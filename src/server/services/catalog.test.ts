import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    $transaction: vi.fn(),
    category: { findFirst: vi.fn(), findMany: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/server/auth/guards", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin-test" })) }));
vi.mock("@/server/services/audit", () => ({ auditJson: (value: unknown) => value, writeAuditEntry: vi.fn() }));

import { db } from "@/server/db";
import { deleteProduct, getPublicCollection, getPublicProduct, listFeaturedProducts, updateProduct } from "@/server/services/catalog";

describe("admin product lifecycle", () => {
  const product = {
    id: "product-test", type: "DESIGNER_DRESS", status: "ARCHIVED", images: [{ id: "image-test" }],
    variants: [{ id: "variant-test", reserved: 0 }], category: { visible: true }, _count: { orderLines: 0 },
  };
  const transaction = {
    $queryRaw: vi.fn(),
    product: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    stockMovement: { count: vi.fn() },
    cartLine: { deleteMany: vi.fn() }, productImage: { deleteMany: vi.fn() }, productVariant: { deleteMany: vi.fn() },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation(async (callback) => (callback as (tx: unknown) => unknown)(transaction) as never);
    transaction.product.findUnique.mockResolvedValue(product);
    transaction.product.update.mockResolvedValue({ ...product, status: "ACTIVE" });
    transaction.stockMovement.count.mockResolvedValue(0);
  });
  it("reactivates archived products while retaining activation requirements", async () => {
    await expect(updateProduct(product.id, { status: "ACTIVE" })).resolves.toMatchObject({ status: "ACTIVE" });
    transaction.product.findUnique.mockResolvedValue({ ...product, images: [] });
    await expect(updateProduct(product.id, { status: "ACTIVE" })).rejects.toThrow("between one and eight images");
  });
  it("deletes unused products and removes their cart and catalog children", async () => {
    await expect(deleteProduct(product.id)).resolves.toEqual({ id: product.id });
    expect(transaction.product.delete).toHaveBeenCalledWith({ where: { id: product.id } });
    expect(transaction.cartLine.deleteMany).toHaveBeenCalledWith({ where: { productId: product.id } });
  });
  it("protects products with order or stock history from deletion", async () => {
    transaction.product.findUnique.mockResolvedValue({ ...product, _count: { orderLines: 1 } });
    await expect(deleteProduct(product.id)).rejects.toThrow("Archive it instead");
    transaction.product.findUnique.mockResolvedValue(product);
    transaction.stockMovement.count.mockResolvedValue(1);
    await expect(deleteProduct(product.id)).rejects.toThrow("Archive it instead");
    expect(transaction.product.delete).not.toHaveBeenCalled();
  });
});

describe("public catalog visibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires active products inside visible categories for direct product routes", async () => {
    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    await expect(getPublicProduct("hidden-sample")).resolves.toBeNull();
    expect(db.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        slug: "hidden-sample",
        status: "ACTIVE",
        category: { visible: true },
      },
    }));
  });

  it("does not return products for hidden collections", async () => {
    vi.mocked(db.category.findFirst).mockResolvedValue(null);
    await expect(getPublicCollection("hidden-collection")).resolves.toBeNull();
    expect(db.category.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: "hidden-collection", visible: true },
    }));
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("limits featured products to active products with visible categories", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([]);
    await expect(listFeaturedProducts()).resolves.toEqual([]);
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "ACTIVE", category: { visible: true } },
    }));
  });
});