import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { localStorage, verifyPrivateFileSignature } from "@/server/storage/local";
import type { StoredFile } from "@/server/storage/local";

async function createValidPng(): Promise<Buffer> {
  return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="white"/></svg>')).png().toBuffer();
}

describe("local file storage", () => {
  let storedFile: StoredFile | undefined;

  afterEach(async () => {
    if (storedFile) {
      await localStorage.delete(storedFile);
      storedFile = undefined;
    }
  });

  it("accepts only bytes matching the declared supported image type", async () => {
    await expect(localStorage.put({
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimeType: "image/png",
      originalName: "ignored.png",
      visibility: "private",
      folder: "replacement-photos",
    })).rejects.toThrow(TypeError);

    const file = await localStorage.put({
      buffer: await createValidPng(),
      mimeType: "image/png",
      originalName: "customer-name.png",
      visibility: "private",
      folder: "replacement-photos",
    });
    storedFile = file;
    expect(file.key).not.toContain("customer-name");
    expect(file.key).toMatch(/^replacement-photos\//);
    expect(file.width).toBe(1);
    expect(file.height).toBe(1);
  });

  it("signs private URLs and rejects expired or modified signatures", async () => {
    const file = await localStorage.put({
      buffer: await createValidPng(),
      mimeType: "image/png",
      originalName: "private.png",
      visibility: "private",
      folder: "replacement-photos",
    });
    storedFile = file;
    const url = new URL(await localStorage.getSignedUrl(file, 60), "http://localhost:3000");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("sig") ?? "";
    expect(verifyPrivateFileSignature(file.key, expires, signature)).toBe(true);
    expect(verifyPrivateFileSignature(file.key, expires, `${signature}bad`)).toBe(false);
    expect(verifyPrivateFileSignature(file.key, expires - 120, signature)).toBe(false);
  });
});