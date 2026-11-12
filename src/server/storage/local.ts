import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getEnvironment } from "@/server/env";
import { systemClock, type Clock } from "@/server/domain/clock";

export type StorageVisibility = "public" | "private";

export interface StoredFile {
  provider: "local" | "cloudinary";
  key: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface StorageProvider {
  put(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    visibility: StorageVisibility;
    folder: string;
  }): Promise<StoredFile>;
  getPublicUrl(file: StoredFile): string;
  getSignedUrl(file: StoredFile, expiresInSec: number): Promise<string>;
  readPublic(key: string): Promise<Buffer>;
  readPrivate(key: string): Promise<Buffer>;
  delete(file: StoredFile): Promise<void>;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function assertSafeFolder(folder: string): string {
  const segments = folder.split("/");
  if (!segments.length || segments.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
    throw new RangeError("Storage folder contains an invalid path segment.");
  }
  return segments.join(path.sep);
}

export async function validateImageContent(buffer: Buffer, declaredMimeType: string): Promise<{ mimeType: string; width: number; height: number }> {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FILE_BYTES) {
    throw new RangeError("Image must be between 1 byte and 5 MB.");
  }
  const detectedMime = sniffImageMime(buffer);
  if (!detectedMime || detectedMime !== declaredMimeType || !MIME_EXTENSIONS.has(detectedMime)) {
    throw new TypeError("Image content does not match an allowed JPEG, PNG or WebP type.");
  }
  try {
    const image = sharp(buffer, { failOn: "error", limitInputPixels: 100_000_000 });
    const metadata = await image.metadata();
    const expectedFormat = detectedMime === "image/jpeg" ? "jpeg" : detectedMime === "image/png" ? "png" : "webp";
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) throw new TypeError("Image content is malformed.");
    await image.raw().toBuffer();
    return { mimeType: detectedMime, width: metadata.width, height: metadata.height };
  } catch {
    throw new TypeError("Image content is malformed or cannot be decoded.");
  }
}

function resolveInside(root: string, key: string): string {
  if (path.isAbsolute(key) || key.split(/[\\/]/).some((part) => part === ".." || part === "")) {
    throw new RangeError("Storage key is invalid.");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new RangeError("Storage key escapes its root.");
  }
  return resolved;
}

function sign(key: string, expiresAt: number): string {
  return createHmac("sha256", getEnvironment().SESSION_SECRET)
    .update(`${key}.${expiresAt}`)
    .digest("base64url");
}

export function verifyPrivateFileSignature(
  key: string,
  expiresAt: number,
  signature: string,
  clock: Clock = systemClock,
  provider: "local" | "cloudinary" = "local",
): boolean {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(clock.now().getTime() / 1000)) return false;
  const expected = Buffer.from(sign(provider === "local" ? key : `${provider}:${key}`, expiresAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function privateFileUrl(key: string, provider: "local" | "cloudinary", expiresInSec: number): string {
  if (!Number.isSafeInteger(expiresInSec) || expiresInSec <= 0) {
    throw new RangeError("Signed URL lifetime must be a positive number of seconds.");
  }
  const expiresAt = Math.floor(systemClock.now().getTime() / 1000) + expiresInSec;
  const signature = sign(provider === "local" ? key : `${provider}:${key}`, expiresAt);
  const params = new URLSearchParams({ key, expires: String(expiresAt), sig: signature });
  if (provider !== "local") params.set("provider", provider);
  return `/api/storage/private?${params}`;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly publicRoot = path.join(process.cwd(), "public", "uploads");
  private readonly privateRoot = path.join(process.cwd(), "storage", "private");

  async put(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    visibility: StorageVisibility;
    folder: string;
  }): Promise<StoredFile> {
    const image = await validateImageContent(input.buffer, input.mimeType);

    const folder = assertSafeFolder(input.folder);
    const extension = MIME_EXTENSIONS.get(image.mimeType)!;
    const key = `${folder}/${randomUUID()}.${extension}`;
    const root = input.visibility === "public" ? this.publicRoot : this.privateRoot;
    const destination = resolveInside(root, key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.buffer, { flag: "wx", mode: 0o600 });

    return {
      provider: "local",
      key: key.split(path.sep).join("/"),
      mimeType: image.mimeType,
      size: input.buffer.byteLength,
      width: image.width,
      height: image.height,
    };
  }

  getPublicUrl(file: StoredFile): string {
    if (file.provider !== "local") throw new TypeError("This local adapter cannot render another provider's files.");
    return `/uploads/${encodeURIComponent(file.key).replaceAll("%2F", "/")}`;
  }

  async getSignedUrl(file: StoredFile, expiresInSec: number): Promise<string> {
    if (file.provider !== "local") throw new TypeError("This local adapter cannot sign another provider's files.");
    return privateFileUrl(file.key, "local", expiresInSec);
  }

  async readPrivate(key: string): Promise<Buffer> {
    return readFile(resolveInside(this.privateRoot, key));
  }

  async readPublic(key: string): Promise<Buffer> {
    return readFile(resolveInside(this.publicRoot, key));
  }

  async delete(file: StoredFile): Promise<void> {
    if (file.provider !== "local") throw new TypeError("This local adapter cannot delete another provider's files.");
    const locations = [
      resolveInside(this.publicRoot, file.key),
      resolveInside(this.privateRoot, file.key),
    ];
    for (const location of locations) {
      try {
        await unlink(location);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

export const localStorage = new LocalStorageProvider();