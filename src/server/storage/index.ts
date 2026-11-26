import "server-only";

import { getEnvironment } from "@/server/env";
import { CloudinaryStorageProvider } from "@/server/storage/cloudinary";
import { localStorage, type StoredFile, type StorageProvider } from "@/server/storage/local";

export function getStorageProvider(provider?: string): StorageProvider {
  const selected = provider ?? getEnvironment().STORAGE_DRIVER;
  if (selected === "local") return localStorage;
  if (selected === "cloudinary") return new CloudinaryStorageProvider();
  throw new RangeError("Unsupported storage provider.");
}

export function getPublicImageUrl(image: { provider: string; key: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null }) {
  return image.provider === "static" ? `/${image.key}` : getStorageProvider(image.provider).getPublicUrl({
    provider: image.provider as StoredFile["provider"],
    key: image.key,
    mimeType: image.mimeType,
    size: image.sizeBytes,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
  });
}