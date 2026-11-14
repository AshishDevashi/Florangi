import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/server/db";
import { getStorageProvider } from "@/server/storage";
import type { StoredFile } from "@/server/storage/local";

const prefix = "images/fixtures/florangi/";

async function main() {
  assert.equal(process.env.NODE_ENV, "development");
  assert.equal(process.env.STORAGE_DRIVER, "cloudinary");
  const apply = process.argv.includes("--apply");
  const removeLocal = process.argv.includes("--remove-local");
  const manifest = JSON.parse(await readFile("prisma/fixtures/florangi-catalog.json", "utf8")) as { products: Array<{ slug: string; category: { slug: string }; images: Array<{ key: string }> }> };
  const productSlugs = manifest.products.map((product) => product.slug);
  const categorySlugs = [...new Set(manifest.products.map((product) => product.category.slug))];
  const [products, categories] = await Promise.all([
    db.productImage.findMany({ where: { product: { slug: { in: productSlugs } } } }),
    db.categoryImage.findMany({ where: { category: { slug: { in: categorySlugs } } } }),
  ]);
  const rows = [...products.map((image) => ({ ...image, kind: "product" as const })), ...categories.map((image) => ({ ...image, kind: "category" as const }))];
  const pending = rows.filter((image) => image.provider === "static" && image.key.startsWith(prefix));
  assert(rows.every((image) => image.provider === "cloudinary" || (image.provider === "static" && image.key.startsWith(prefix))), "Unexpected storage provider in preview catalog.");
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", productImages: products.length, categoryImages: categories.length, toMigrate: pending.length }));
  if (!apply) return;
  const actor = await db.adminUser.findUnique({ where: { email: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "" }, select: { id: true } });
  assert(actor, "Configured admin must exist.");
  const storage = getStorageProvider("cloudinary");
  const publicRoot = path.resolve("public");
  const backupRoot = path.resolve("test-results/cloudinary-preview-backup");
  const localPath = (key: string) => {
    assert(key.startsWith(prefix));
    const file = path.resolve(publicRoot, key);
    assert(file.startsWith(path.resolve(publicRoot, prefix) + path.sep));
    return file;
  };
  if (pending.length) {
    await mkdir(backupRoot, { recursive: true });
    await writeFile(path.join(backupRoot, `records-${Date.now()}.json`), JSON.stringify(pending, null, 2));
    for (const key of new Set(pending.map((image) => image.key))) {
      const destination = path.resolve(backupRoot, key);
      assert(destination.startsWith(backupRoot + path.sep));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(localPath(key), destination);
    }
  }
  async function verify(file: StoredFile) {
    const response = await fetch(storage.getPublicUrl(file), { signal: AbortSignal.timeout(30000) });
    assert(response.ok, "Cloudinary image could not be delivered.");
    const image = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(image.width, file.width); assert.equal(image.height, file.height);
  }
  let migrated = 0;
  for (let start = 0; start < pending.length; start += 3) {
    const results = await Promise.allSettled(pending.slice(start, start + 3).map(async (image) => {
      const stored = await storage.put({ buffer: await readFile(localPath(image.key)), mimeType: image.mimeType, originalName: "preview-migration", visibility: "public", folder: image.kind === "product" ? `products/${image.productId}` : `categories/${image.categoryId}` });
      await verify(stored);
      const data = { provider: stored.provider, key: stored.key, mimeType: stored.mimeType, sizeBytes: stored.size, width: stored.width, height: stored.height };
      await db.$transaction(async (tx) => {
        const where = { id: image.id, provider: "static", key: image.key };
        const updated = image.kind === "product" ? await tx.productImage.updateMany({ where, data }) : await tx.categoryImage.updateMany({ where, data });
        assert.equal(updated.count, 1, "Image changed during migration; database reference was not replaced.");
        await tx.auditLog.create({ data: { actorUserId: actor!.id, actorType: "USER", action: "IMAGE_STORAGE_MIGRATED", entity: image.kind === "product" ? "ProductImage" : "CategoryImage", entityId: image.id, before: { provider: image.provider, key: image.key }, after: { provider: stored.provider, key: stored.key } } });
      });
      migrated++;
    }));
    console.log(`Verified and migrated ${migrated}/${pending.length}`);
    if (results.some((result) => result.status === "rejected")) throw new Error("A migration batch failed. Local originals are retained; rerun to resume completed rows safely.");
  }
  const current = [
    ...await db.productImage.findMany({ where: { product: { slug: { in: productSlugs } } } }),
    ...await db.categoryImage.findMany({ where: { category: { slug: { in: categorySlugs } } } }),
  ];
  assert.equal(current.length, rows.length);
  assert(current.every((image) => image.provider === "cloudinary"));
  for (let start = 0; start < current.length; start += 3) await Promise.all(current.slice(start, start + 3).map((image) => verify({ provider: "cloudinary", key: image.key, mimeType: image.mimeType, size: image.sizeBytes, width: image.width ?? undefined, height: image.height ?? undefined })));
  let removed = 0;
  if (removeLocal) {
    const references = await Promise.all([db.productImage.count({ where: { provider: "static", key: { startsWith: prefix } } }), db.categoryImage.count({ where: { provider: "static", key: { startsWith: prefix } } })]);
    assert(references.every((count) => count === 0), "Local image references remain.");
    const orderImages = await db.orderLine.findMany({ select: { productImage: true } });
    assert(!orderImages.some((line) => JSON.stringify(line.productImage).includes(prefix)), "An order snapshot still needs local images.");
    for (const key of new Set(manifest.products.flatMap((product) => product.images.map((image) => image.key)))) {
      try { await unlink(localPath(key)); removed++; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  console.log(JSON.stringify({ verifiedCloudinaryImages: current.length, migrated, removedLocalFiles: removed, backup: "test-results/cloudinary-preview-backup" }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Migration failed."); process.exitCode = 1; }).finally(() => db.$disconnect());
