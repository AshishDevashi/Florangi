import { db } from "@/server/db";
import { getStorageProvider } from "@/server/storage";

async function migrate() {
  const local = getStorageProvider("local");
  const cloudinary = getStorageProvider("cloudinary");
  const productImages = await db.productImage.findMany({ where: { provider: "local" }, orderBy: { createdAt: "asc" } });
  const categoryImages = await db.categoryImage.findMany({ where: { provider: "local" }, orderBy: { createdAt: "asc" } });
  const replacementPhotos = await db.replacementPhoto.findMany({ where: { provider: "local" }, orderBy: { createdAt: "asc" } });
  let migrated = 0;

  for (const image of productImages) {
    const buffer = await local.readPublic(image.key);
    const stored = await cloudinary.put({
      buffer,
      mimeType: image.mimeType,
      originalName: "storage-migration",
      visibility: "public",
      folder: `products/${image.productId}`,
    });
    await db.productImage.updateMany({
      where: { id: image.id, provider: "local", key: image.key },
      data: { provider: stored.provider, key: stored.key, mimeType: stored.mimeType, sizeBytes: stored.size, width: stored.width, height: stored.height },
    });
    migrated += 1;
  }

  for (const image of categoryImages) {
    const buffer = await local.readPublic(image.key);
    const stored = await cloudinary.put({
      buffer,
      mimeType: image.mimeType,
      originalName: "storage-migration",
      visibility: "public",
      folder: `categories/${image.categoryId}`,
    });
    await db.categoryImage.updateMany({
      where: { id: image.id, provider: "local", key: image.key },
      data: { provider: stored.provider, key: stored.key, mimeType: stored.mimeType, sizeBytes: stored.size, width: stored.width, height: stored.height },
    });
    migrated += 1;
  }

  for (const photo of replacementPhotos) {
    const buffer = await local.readPrivate(photo.key);
    const stored = await cloudinary.put({
      buffer,
      mimeType: photo.mimeType,
      originalName: "storage-migration",
      visibility: "private",
      folder: "replacement-photos",
    });
    await db.replacementPhoto.updateMany({
      where: { id: photo.id, provider: "local", key: photo.key },
      data: { provider: stored.provider, key: stored.key, mimeType: stored.mimeType, sizeBytes: stored.size },
    });
    migrated += 1;
  }

  console.info("storage.migration_complete", { migrated });
}

migrate()
  .catch((error: unknown) => {
    console.error("storage.migration_failed", { errorName: error instanceof Error ? error.name : "StorageMigrationError" });
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });