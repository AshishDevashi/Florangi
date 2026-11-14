import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getStorageProvider } from "@/server/storage";
import type { StoredFile } from "@/server/storage/local";

const manifestSchema = z.object({ products: z.array(z.object({
  name: z.string().min(1).max(160), slug: z.string().regex(/^preview-[a-z0-9-]+$/), description: z.string().min(1),
  basePricePaise: z.number().int().nonnegative(),
  category: z.object({ name: z.string(), slug: z.string().regex(/^preview-[a-z0-9-]+$/) }),
  images: z.array(z.object({ key: z.string().startsWith("images/fixtures/florangi/"), sourceUrl: z.string().url(), position: z.number().int().nonnegative() })).min(1).max(8),
})).min(1) });

async function main() {
  assert.equal(process.env.NODE_ENV, "development", "Preview imports require NODE_ENV=development.");
  assert.equal(process.env.STORAGE_DRIVER, "cloudinary", "Preview images must use the configured Cloudinary account.");
  const apply = process.argv.includes("--apply");
  const manifest = manifestSchema.parse(JSON.parse(await readFile("prisma/fixtures/florangi-catalog.json", "utf8")));
  assert.equal(new Set(manifest.products.map((product) => product.slug)).size, manifest.products.length);
  for (const product of manifest.products) {
    assert.deepEqual(product.images.map((image) => image.position), product.images.map((_, index) => index));
    for (const image of product.images) {
      const url = new URL(image.sourceUrl);
      assert(url.origin === "https://florangi.com" && url.pathname.startsWith("/images/"), "Only source website images are allowed.");
    }
  }
  const db = new PrismaClient({ log: [] });
  const staged = new Map<string, StoredFile>();
  const used = new Set<string>();
  let committed = false;
  let storage: ReturnType<typeof getStorageProvider> | undefined;
  function imageData(token: string, position: number) {
    const file = staged.get(token);
    assert(file?.provider === "cloudinary", "Cloudinary image must be staged before writing its reference.");
    used.add(file.key);
    return { provider: file.provider, key: file.key, mimeType: file.mimeType, sizeBytes: file.size, width: file.width, height: file.height, position };
  }
  try {
    const slugs = manifest.products.map((product) => product.slug);
    const existing = await db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
    const existingSlugs = new Set(existing.map((product) => product.slug));
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", source: "florangi.com", categories: [...new Set(manifest.products.map((product) => product.category.name))], toCreate: manifest.products.filter((product) => !existingSlugs.has(product.slug)).length, existingProductsSkipped: existing.length, images: manifest.products.reduce((count, product) => count + product.images.length, 0), stock: "Zero for all demo sizes" }));
    if (!apply) return;
    const actor = await db.adminUser.findUnique({ where: { email: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "" }, select: { id: true } });
    assert(actor, "Configured admin must exist before importing.");
    storage = getStorageProvider("cloudinary");
    const tasks: Array<{ token: string; sourceUrl: string; folder: string }> = [];
    for (const product of manifest.products.filter((item) => !existingSlugs.has(item.slug))) {
      for (const image of product.images) tasks.push({ token: `${product.slug}:${image.position}`, sourceUrl: image.sourceUrl, folder: `preview/products/${product.slug}` });
    }
    const categoryCovers = new Map<string, typeof manifest.products[number]["images"]>();
    for (const product of manifest.products) {
      if (categoryCovers.has(product.category.slug)) continue;
      const covers = manifest.products.filter((item) => item.category.slug === product.category.slug).map((item) => item.images[0]);
      if (covers.length === 1 && product.images[1]) covers.push(product.images[1]);
      categoryCovers.set(product.category.slug, covers.slice(0, 2));
      const category = await db.category.findUnique({ where: { slug: product.category.slug }, include: { images: { select: { position: true } } } });
      for (const [position, image] of covers.slice(0, 2).entries()) {
        if (!category?.images.some((present) => present.position === position)) tasks.push({ token: `${product.category.slug}:${position}`, sourceUrl: image.sourceUrl, folder: `preview/categories/${product.category.slug}` });
      }
    }
    for (let start = 0; start < tasks.length; start += 3) {
      const results = await Promise.allSettled(tasks.slice(start, start + 3).map(async (task) => {
        const response = await fetch(task.sourceUrl, { signal: AbortSignal.timeout(30000) });
        assert(response.ok, "Source photo could not be downloaded.");
        const buffer = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 100_000_000 }).rotate().resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        const file = await storage!.put({ buffer, mimeType: "image/webp", originalName: "preview-import", visibility: "public", folder: task.folder });
        staged.set(task.token, file);
      }));
      assert(results.every((result) => result.status === "fulfilled"), "An image could not be staged. No catalog records have been created.");
    }
    const result = await db.$transaction(async (tx) => {
      let created = 0;
      const categoryMap = new Map<string, { id: string; visible: boolean }>();
      const highest = await tx.category.aggregate({ _max: { sortOrder: true } });
      let sortOrder = (highest._max.sortOrder ?? -1) + 1;
      for (const product of manifest.products) {
        if (categoryMap.has(product.category.slug)) continue;
        let category = await tx.category.findUnique({ where: { slug: product.category.slug } });
        if (!category) {
          category = await tx.category.create({ data: { ...product.category, visible: true, sortOrder: sortOrder++ } });
          await tx.auditLog.create({ data: { actorUserId: actor.id, actorType: "USER", action: "PREVIEW_CATEGORY_IMPORTED", entity: "Category", entityId: category.id, after: { source: "https://florangi.com/", previewOnly: true } } });
        }
        categoryMap.set(product.category.slug, category);
        for (const position of categoryCovers.get(product.category.slug)!.keys()) {
          const present = await tx.categoryImage.findUnique({ where: { categoryId_position: { categoryId: category.id, position } } });
          if (!present) await tx.categoryImage.create({ data: { categoryId: category.id, ...imageData(`${product.category.slug}:${position}`, position) } });
        }
      }
      for (const product of manifest.products) {
        if (await tx.product.findUnique({ where: { slug: product.slug }, select: { id: true } })) continue;
        const category = categoryMap.get(product.category.slug)!;
        const row = await tx.product.create({ data: {
          name: product.name, slug: product.slug, description: product.description, categoryId: category.id,
          type: "DESIGNER_DRESS", status: category.visible ? "ACTIVE" : "DRAFT", basePricePaise: product.basePricePaise, customizationFeePaise: null,
          variants: { create: (["XS", "S", "M"] as const).map((size) => ({ size, sizePremiumPaise: 0, onHand: 0, reserved: 0 })) },
          images: { create: product.images.map((image) => imageData(`${product.slug}:${image.position}`, image.position)) },
        } });
        await tx.auditLog.create({ data: { actorUserId: actor.id, actorType: "USER", action: "PREVIEW_PRODUCT_IMPORTED", entity: "Product", entityId: row.id, after: { source: "https://florangi.com/", previewOnly: true, sourceSlug: product.slug.replace(/^preview-/, "") } } });
        created++;
      }
      return { created, skipped: manifest.products.length - created };
    }, { timeout: 60000, isolationLevel: "Serializable" });
    committed = true;
    console.log(JSON.stringify(result));
  } finally {
    for (const file of staged.values()) {
      if (committed && used.has(file.key)) continue;
      try {
        const references = await Promise.all([db.productImage.count({ where: { provider: file.provider, key: file.key } }), db.categoryImage.count({ where: { provider: file.provider, key: file.key } })]);
        if (references.every((count) => count === 0)) await storage!.delete(file);
      } catch { console.warn("An unreferenced staged upload may need cleanup; no referenced assets were removed."); }
    }
    await db.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Preview import failed."); process.exitCode = 1; });
