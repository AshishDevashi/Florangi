import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { verifyPrivateFileSignature } from "@/server/storage/local";

const cloud = vi.hoisted(() => ({
  config: vi.fn(),
  url: vi.fn(() => "https://example.test/image"),
  destroy: vi.fn(),
  uploadStream: vi.fn(),
}));

vi.mock("cloudinary", () => ({
  v2: { config: cloud.config, url: cloud.url, uploader: { destroy: cloud.destroy, upload_stream: cloud.uploadStream } },
}));
vi.mock("@/server/env", () => ({
  getEnvironment: () => ({ CLOUDINARY_CLOUD_NAME: "test", CLOUDINARY_API_KEY: "test", CLOUDINARY_API_SECRET: "test", SESSION_SECRET: "test-session-secret-at-least-32-characters" }),
}));

import { CloudinaryStorageProvider } from "@/server/storage/cloudinary";

describe("Cloudinary storage", () => {
  const file = { provider: "cloudinary" as const, key: "replacement-photos/test", mimeType: "image/png", size: 10 };
  beforeEach(() => {
    vi.clearAllMocks();
    cloud.destroy.mockResolvedValue({ result: "ok" });
  });

  it("uploads validated private images as authenticated assets", async () => {
    cloud.uploadStream.mockImplementation((_options, callback) => ({
      end: () => callback(null, { public_id: file.key, bytes: 10, width: 1, height: 1 }),
    }));
    const buffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const provider = new CloudinaryStorageProvider();
    await expect(provider.put({ buffer, mimeType: "image/png", originalName: "test.png", visibility: "private", folder: "replacement-photos" })).resolves.toMatchObject(file);
    expect(cloud.uploadStream).toHaveBeenCalledWith(expect.objectContaining({ type: "authenticated", resource_type: "image" }), expect.any(Function));
  });

  it("returns an expiring application-authorized link bound to its provider", async () => {
    const provider = new CloudinaryStorageProvider();
    const url = new URL(await provider.getSignedUrl(file, 60), "http://localhost:3000");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("sig") ?? "";
    expect(url.pathname).toBe("/api/storage/private");
    expect(url.searchParams.get("provider")).toBe("cloudinary");
    expect(verifyPrivateFileSignature(file.key, expires, signature, undefined, "cloudinary")).toBe(true);
    expect(verifyPrivateFileSignature(file.key, expires, signature)).toBe(false);
    expect(verifyPrivateFileSignature(file.key, expires - 120, signature, undefined, "cloudinary")).toBe(false);
  });

  it("deletes both public and authenticated assets and reports provider failures", async () => {
    const provider = new CloudinaryStorageProvider();
    cloud.destroy.mockResolvedValueOnce({ result: "not found" }).mockResolvedValueOnce({ result: "ok" });
    await provider.delete(file);
    expect(cloud.destroy).toHaveBeenCalledWith(file.key, expect.objectContaining({ type: "upload" }));
    expect(cloud.destroy).toHaveBeenCalledWith(file.key, expect.objectContaining({ type: "authenticated" }));
    cloud.destroy.mockResolvedValueOnce({ result: "error" });
    await expect(provider.delete(file)).rejects.toThrow("deletion failed");
  });
});
