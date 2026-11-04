import "server-only";

import { getEnvironment } from "@/server/env";
import { CloudinaryStorageProvider } from "@/server/storage/cloudinary";
import { localStorage, type StorageProvider } from "@/server/storage/local";

export function getStorageProvider(provider?: string): StorageProvider {
  const selected = provider ?? getEnvironment().STORAGE_DRIVER;
  if (selected === "local") return localStorage;
  if (selected === "cloudinary") return new CloudinaryStorageProvider();
  throw new RangeError("Unsupported storage provider.");
}