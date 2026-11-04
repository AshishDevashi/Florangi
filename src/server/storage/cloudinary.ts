import "server-only";

import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { getEnvironment } from "@/server/env";
import { systemClock } from "@/server/domain/clock";
import { assertSafeFolder, validateImageContent, type StorageProvider, type StoredFile, type StorageVisibility } from "@/server/storage/local";

export class CloudinaryStorageProvider implements StorageProvider {
  constructor() {
    const environment = getEnvironment();
    if (!environment.CLOUDINARY_CLOUD_NAME || !environment.CLOUDINARY_API_KEY || !environment.CLOUDINARY_API_SECRET) {
      throw new Error("Cloudinary credentials are required when STORAGE_DRIVER=cloudinary.");
    }
    cloudinary.config({
      cloud_name: environment.CLOUDINARY_CLOUD_NAME,
      api_key: environment.CLOUDINARY_API_KEY,
      api_secret: environment.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async put(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    visibility: StorageVisibility;
    folder: string;
  }): Promise<StoredFile> {
    const image = await validateImageContent(input.buffer, input.mimeType);
    const folder = assertSafeFolder(input.folder).split("\\").join("/");
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream({
        resource_type: "image",
        type: input.visibility === "private" ? "authenticated" : "upload",
        folder,
        public_id: randomUUID(),
        overwrite: false,
        unique_filename: true,
      }, (error, response) => {
        if (error || !response) return reject(new Error("Cloudinary upload failed."));
        resolve(response);
      });
      upload.end(input.buffer);
    });
    return {
      provider: "cloudinary",
      key: result.public_id,
      mimeType: image.mimeType,
      size: result.bytes,
      width: result.width,
      height: result.height,
    };
  }

  getPublicUrl(file: StoredFile): string {
    if (file.provider !== "cloudinary") throw new TypeError("Cloudinary adapter cannot render another provider's files.");
    return cloudinary.url(file.key, { secure: true, resource_type: "image", type: "upload" });
  }

  async getSignedUrl(file: StoredFile, expiresInSec: number): Promise<string> {
    if (file.provider !== "cloudinary") throw new TypeError("Cloudinary adapter cannot sign another provider's files.");
    if (!Number.isSafeInteger(expiresInSec) || expiresInSec <= 0) throw new RangeError("Signed URL lifetime must be positive.");
    const expiresAt = Math.floor(systemClock.now().getTime() / 1000) + expiresInSec;
    return cloudinary.url(file.key, {
      secure: true,
      resource_type: "image",
      type: "authenticated",
      sign_url: true,
      expires_at: expiresAt,
    });
  }

  async readPrivate(key: string): Promise<Buffer> {
    return this.fetchAsset(key, "authenticated");
  }

  async readPublic(key: string): Promise<Buffer> {
    return this.fetchAsset(key, "upload");
  }

  private async fetchAsset(key: string, type: "upload" | "authenticated"): Promise<Buffer> {
    const url = cloudinary.url(key, {
      secure: true,
      resource_type: "image",
      type,
      ...(type === "authenticated" ? { sign_url: true, expires_at: Math.floor(systemClock.now().getTime() / 1000) + 60 } : {}),
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error("Cloudinary private file could not be read.");
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(file: StoredFile): Promise<void> {
    if (file.provider !== "cloudinary") throw new TypeError("Cloudinary adapter cannot delete another provider's files.");
    await cloudinary.uploader.destroy(file.key, { resource_type: "image", type: "authenticated", invalidate: true });
  }
}