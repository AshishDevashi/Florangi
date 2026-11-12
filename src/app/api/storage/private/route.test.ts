import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), admin: vi.fn(), access: vi.fn(), readPrivate: vi.fn(), signature: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { replacementPhoto: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/auth/session", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("@/server/guest-order-access", () => ({ hasGuestOrderAccess: mocks.access }));
vi.mock("@/server/storage/local", () => ({ verifyPrivateFileSignature: mocks.signature }));
vi.mock("@/server/storage", () => ({ getStorageProvider: () => ({ readPrivate: mocks.readPrivate }) }));

import { GET } from "@/app/api/storage/private/route";

describe("private photo endpoint", () => {
  const request = () => new Request("http://localhost/api/storage/private?provider=cloudinary&key=photos%2Ftest&expires=123&sig=test");
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signature.mockReturnValue(true);
    mocks.findFirst.mockResolvedValue({ provider: "cloudinary", mimeType: "image/png", request: { orderId: "order-test" } });
    mocks.admin.mockResolvedValue(null);
    mocks.access.mockResolvedValue(false);
    mocks.readPrivate.mockResolvedValue(Buffer.from("photo"));
  });
  it("denies access without an admin session or guest order access", async () => {
    expect((await GET(request())).status).toBe(404);
    expect(mocks.readPrivate).not.toHaveBeenCalled();
  });
  it("serves a Cloudinary photo only after signed link and order access checks", async () => {
    mocks.access.mockResolvedValue(true);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("photo");
    expect(mocks.signature).toHaveBeenCalledWith("photos/test", 123, "test", undefined, "cloudinary");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: "cloudinary", key: "photos/test" } }));
  });
  it("rejects an invalid signature before loading the photo", async () => {
    mocks.signature.mockReturnValue(false);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
