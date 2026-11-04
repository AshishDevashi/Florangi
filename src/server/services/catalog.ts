import "server-only";

import { z } from "zod";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getStorageProvider } from "@/server/storage";
import type { StoredFile } from "@/server/storage/local";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { getEffectiveSetting } from "@/server/services/settings";
import { systemClock } from "@/server/domain/clock";

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  visible: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

const variantSchema = z.object({
  size: z.enum(["XS", "S", "M"]),
  sizePremiumPaise: z.number().int().nonnegative().default(0),
  onHand: z.number().int().nonnegative().default(0),
});

const newProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  description: z.string().trim().min(1).max(10000),
  categoryId: z.string().min(1),
  type: z.enum(["DESIGNER_DRESS", "CUSTOM_DRESS"]),
  basePricePaise: z.number().int().nonnegative(),
  customizationFeePaise: z.number().int().nonnegative().nullable().optional(),
  variants: z.array(variantSchema).max(3).default([]),
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().min(1).max(10000).optional(),
  categoryId: z.string().min(1).optional(),
  basePricePaise: z.number().int().nonnegative().optional(),
  customizationFeePaise: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "HIDDEN", "ARCHIVED"]).optional(),
});

function parseCustomizationLimits(value: unknown): { minPaise: number; maxPaise: number } {
  const parsed = z.object({ minPaise: z.number().int().nonnegative(), maxPaise: z.number().int().nonnegative() }).safeParse(value);
  if (!parsed.success || parsed.data.minPaise > parsed.data.maxPaise) {
    throw new Error("Customization fee limits are not configured correctly.");
  }
  return parsed.data;
}

const publicProductInclude = {
  images: { orderBy: { position: "asc" as const } },
  variants: { orderBy: { size: "asc" as const } },
};

function toPublicProduct(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  basePricePaise: number;
  customizationFeePaise: number | null;
  images: Array<{ provider: string; key: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; position: number }>;
  variants: Array<{ id: string; size: "XS" | "S" | "M"; sizePremiumPaise: number; onHand: number; reserved: number }>;
}) {
  const images = product.images.map((image) => ({
    url: image.provider === "static"
      ? `/${image.key}`
        : getStorageProvider(image.provider).getPublicUrl({
          provider: image.provider as StoredFile["provider"],
          key: image.key,
          mimeType: image.mimeType,
          size: image.sizeBytes,
          width: image.width ?? undefined,
          height: image.height ?? undefined,
        }),
    position: image.position,
  }));

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    type: product.type,
    basePricePaise: product.basePricePaise,
    customizationFeePaise: product.customizationFeePaise,
    images,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      size: variant.size,
      sizePremiumPaise: variant.sizePremiumPaise,
      available: Math.max(0, variant.onHand - variant.reserved),
      unitPricePaise: product.basePricePaise + variant.sizePremiumPaise,
    })),
  };
}

function categoryImageUrl(image: { provider: string; key: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null }) {
  return image.provider === "static" ? `/${image.key}` : getStorageProvider(image.provider).getPublicUrl({
    provider: image.provider as StoredFile["provider"], key: image.key, mimeType: image.mimeType,
    size: image.sizeBytes, width: image.width ?? undefined, height: image.height ?? undefined,
  });
}

export async function listVisibleCategories() {
  const categories = await db.category.findMany({
    where: { visible: true, products: { some: { status: "ACTIVE" } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, sortOrder: true, images: { orderBy: { position: "asc" } } },
  });
  return categories.map((category) => ({ ...category, images: category.images.map((image) => ({ ...image, url: categoryImageUrl(image) })) }));
}

export async function listFeaturedProducts() {
  const products = await db.product.findMany({
    where: { status: "ACTIVE", category: { visible: true } },
    include: publicProductInclude,
    orderBy: { createdAt: "desc" },
    take: 4,
  });
  return products.map(toPublicProduct);
}

export async function getPublicCollection(slug: string) {
  const category = await db.category.findFirst({
    where: { slug, visible: true },
    select: { id: true, name: true, slug: true, images: { orderBy: { position: "asc" } } },
  });
  if (!category) return null;

  const products = await db.product.findMany({
    where: { categoryId: category.id, status: "ACTIVE" },
    include: publicProductInclude,
    orderBy: { createdAt: "desc" },
  });
  return { ...category, images: category.images.map((image) => ({ ...image, url: categoryImageUrl(image) })), products: products.map(toPublicProduct) };
}

export async function getPublicProduct(slug: string) {
  const product = await db.product.findFirst({
    where: { slug, status: "ACTIVE", category: { visible: true } },
    include: {
      ...publicProductInclude,
      category: { select: { name: true, slug: true } },
    },
  });
  if (!product) return null;
  return { ...toPublicProduct(product), category: product.category };
}

export async function listAdminCategories() {
  await requireAdmin();
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { images: { orderBy: { position: "asc" } }, _count: { select: { products: true } } },
  });
  return categories.map((category) => ({ ...category, images: category.images.map((image) => ({ ...image, url: categoryImageUrl(image) })) }));
}

export async function saveCategoryImage(categoryId: string, position: number, buffer: Buffer, mimeType: string) {
  const actor = await requireAdmin();
  z.number().int().min(0).max(1).parse(position);
  if (!(await db.category.findUnique({ where: { id: categoryId } }))) return null;
  const storage = getStorageProvider();
  const stored = await storage.put({ buffer, mimeType, originalName: "category-image", visibility: "public", folder: `categories/${categoryId}` });
  try {
    return await db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${categoryId} FOR UPDATE`;
      const data = { provider: stored.provider, key: stored.key, mimeType: stored.mimeType, sizeBytes: stored.size, width: stored.width, height: stored.height };
      const image = await transaction.categoryImage.upsert({
        where: { categoryId_position: { categoryId, position } },
        create: { categoryId, position, ...data }, update: data,
      });
      await writeAuditEntry(transaction, { actorUserId: actor.id, actorType: "USER", action: "CATEGORY_IMAGE_SAVED", entity: "Category", entityId: categoryId, after: auditJson({ imageId: image.id, position }) });
      return image;
    });
  } catch (error) {
    await storage.delete(stored);
    throw error;
  }
}

export async function removeCategoryImage(categoryId: string, position: number) {
  const actor = await requireAdmin();
  z.number().int().min(0).max(1).parse(position);
  return db.$transaction(async (transaction) => {
    const image = await transaction.categoryImage.findUnique({ where: { categoryId_position: { categoryId, position } } });
    if (!image) return null;
    await transaction.categoryImage.delete({ where: { id: image.id } });
    await writeAuditEntry(transaction, { actorUserId: actor.id, actorType: "USER", action: "CATEGORY_IMAGE_REMOVED", entity: "Category", entityId: categoryId, before: auditJson({ imageId: image.id, position }) });
    return { id: image.id };
  });
}

export async function createCategory(input: unknown) {
  const actor = await requireAdmin();
  const parsed = categorySchema.parse(input);
  return db.$transaction(async (transaction) => {
    const category = await transaction.category.create({ data: parsed });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "CATEGORY_CREATED",
      entity: "Category",
      entityId: category.id,
      after: auditJson(category),
    });
    return category;
  });
}

export async function updateCategory(id: string, input: unknown) {
  const actor = await requireAdmin();
  const parsed = categorySchema.partial().parse(input);
  if (Object.keys(parsed).length === 0) throw new RangeError("At least one category field is required.");
  return db.$transaction(async (transaction) => {
    const before = await transaction.category.findUnique({ where: { id } });
    if (!before) return null;
    const category = await transaction.category.update({ where: { id }, data: parsed });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "CATEGORY_UPDATED",
      entity: "Category",
      entityId: category.id,
      before: auditJson(before),
      after: auditJson(category),
    });
    return category;
  });
}

export async function listAdminProducts() {
  await requireAdmin();
  const products = await db.product.findMany({
    include: {
      category: { select: { name: true, slug: true, visible: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { size: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return products.map((product) => ({
    ...product,
    images: product.images.map((image) => ({
      ...image,
      url: image.provider === "static"
        ? `/${image.key}`
        : getStorageProvider(image.provider).getPublicUrl({
            provider: image.provider as StoredFile["provider"],
            key: image.key,
            mimeType: image.mimeType,
            size: image.sizeBytes,
            width: image.width ?? undefined,
            height: image.height ?? undefined,
          }),
    })),
  }));
}

export async function createProduct(input: unknown) {
  const actor = await requireAdmin();
  const parsed = newProductSchema.parse(input);
  const fee = parsed.customizationFeePaise ?? null;
  if (parsed.type === "CUSTOM_DRESS" && (fee === null || parsed.variants.length > 0)) {
    throw new RangeError("Custom dresses require a customization fee and cannot have size variants.");
  }
  if (parsed.type === "DESIGNER_DRESS" && (fee !== null || parsed.variants.length === 0)) {
    throw new RangeError("Designer dresses require at least one size variant and cannot have a customization fee.");
  }
  if (parsed.type === "CUSTOM_DRESS") {
    const setting = await getEffectiveSetting("customization_fee_limits_paise");
    const limits = parseCustomizationLimits(setting?.value);
    if (fee! < limits.minPaise || fee! > limits.maxPaise) {
      throw new RangeError("Customization fee is outside the configured limits.");
    }
  }
  if (new Set(parsed.variants.map((variant) => variant.size)).size !== parsed.variants.length) {
    throw new RangeError("A designer dress can have only one variant per size.");
  }

  return db.$transaction(async (transaction) => {
    const category = await transaction.category.findUnique({ where: { id: parsed.categoryId } });
    if (!category) throw new RangeError("Select an existing category.");
    const product = await transaction.product.create({
      data: {
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description,
        categoryId: parsed.categoryId,
        type: parsed.type,
        basePricePaise: parsed.basePricePaise,
        customizationFeePaise: fee,
        variants: { create: parsed.variants },
      },
      include: { variants: true },
    });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "PRODUCT_CREATED",
      entity: "Product",
      entityId: product.id,
      after: auditJson(product),
    });
    return product;
  });
}

export async function updateProduct(id: string, input: unknown) {
  const actor = await requireAdmin();
  const parsed = productUpdateSchema.parse(input);
  if (Object.keys(parsed).length === 0) throw new RangeError("At least one product field is required.");

  return db.$transaction(async (transaction) => {
    const before = await transaction.product.findUnique({
      where: { id },
      include: { images: true, variants: true, category: true, _count: { select: { orderLines: true } } },
    });
    if (!before) return null;
    if (parsed.status === "ACTIVE") {
      if (before.images.length < 1 || before.images.length > 8) {
        throw new RangeError("An active product must have between one and eight images.");
      }
      const categoryVisible = parsed.categoryId
        ? (await transaction.category.findUnique({ where: { id: parsed.categoryId }, select: { visible: true } }))?.visible
        : before.category.visible;
      if (!categoryVisible) throw new RangeError("Products in hidden categories cannot be activated.");
      if (before.type === "DESIGNER_DRESS" && before.variants.length === 0) {
        throw new RangeError("A designer dress needs at least one size variant before activation.");
      }
    }
    if (parsed.categoryId && !(await transaction.category.findUnique({ where: { id: parsed.categoryId } }))) {
      throw new RangeError("Select an existing category.");
    }
    if (parsed.customizationFeePaise !== undefined && before.type === "CUSTOM_DRESS") {
      const setting = await transaction.setting.findFirst({
        where: { key: "customization_fee_limits_paise", effectiveAt: { lte: systemClock.now() } },
        orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
      });
      const limits = parseCustomizationLimits(setting?.value);
      if (parsed.customizationFeePaise !== null && (parsed.customizationFeePaise < limits.minPaise || parsed.customizationFeePaise > limits.maxPaise)) {
        throw new RangeError("Customization fee is outside the configured limits.");
      }
    }
    if (before._count.orderLines > 0 && parsed.status === "DRAFT") {
      throw new RangeError("A product with orders cannot be returned to draft; hide or archive it instead.");
    }

    const product = await transaction.product.update({ where: { id }, data: parsed });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: parsed.status && parsed.status !== before.status ? "PRODUCT_STATUS_CHANGED" : "PRODUCT_UPDATED",
      entity: "Product",
      entityId: product.id,
      before: auditJson(before),
      after: auditJson(product),
    });
    return product;
  });
}

export async function deleteProduct(id: string) {
  const actor = await requireAdmin();
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
    const product = await transaction.product.findUnique({
      where: { id },
      include: { variants: true, _count: { select: { orderLines: true } } },
    });
    if (!product) return null;
    const movements = await transaction.stockMovement.count({ where: { variantId: { in: product.variants.map((variant) => variant.id) } } });
    if (product._count.orderLines > 0 || movements > 0 || product.variants.some((variant) => variant.reserved > 0)) {
      throw new RangeError("This product has order or stock history. Archive it instead of deleting it.");
    }
    await transaction.cartLine.deleteMany({ where: { productId: id } });
    await transaction.productImage.deleteMany({ where: { productId: id } });
    await transaction.productVariant.deleteMany({ where: { productId: id } });
    await transaction.product.delete({ where: { id } });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "PRODUCT_DELETED",
      entity: "Product",
      entityId: id,
      before: auditJson(product),
    });
    return { id };
  });
}

export async function addProductImage(productId: string, buffer: Buffer, mimeType: string) {
  const actor = await requireAdmin();
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { images: { select: { position: true } } },
  });
  if (!product) return null;
  if (product.images.length >= 8) throw new RangeError("A product can have at most eight images.");

  const storage = getStorageProvider();
  const stored = await storage.put({
    buffer,
    mimeType,
    originalName: "uploaded-image",
    visibility: "public",
    folder: `products/${productId}`,
  });

  try {
    return await db.$transaction(async (transaction) => {
      const currentImages = await transaction.productImage.findMany({
        where: { productId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      if (currentImages.length >= 8) throw new RangeError("A product can have at most eight images.");
      const image = await transaction.productImage.create({
        data: {
          productId,
          provider: stored.provider,
          key: stored.key,
          mimeType: stored.mimeType,
          sizeBytes: stored.size,
          width: stored.width,
          height: stored.height,
          position: (currentImages[0]?.position ?? -1) + 1,
        },
      });
      await writeAuditEntry(transaction, {
        actorUserId: actor.id,
        actorType: "USER",
        action: "PRODUCT_IMAGE_ADDED",
        entity: "Product",
        entityId: productId,
        after: auditJson({ imageId: image.id, key: image.key, mimeType: image.mimeType, sizeBytes: image.sizeBytes }),
      });
      return image;
    });
  } catch (error) {
    await storage.delete(stored);
    throw error;
  }
}

export async function removeProductImage(productId: string, imageId: string) {
  const actor = await requireAdmin();
  return db.$transaction(async (transaction) => {
    const product = await transaction.product.findUnique({
      where: { id: productId },
      include: { images: true, _count: { select: { orderLines: true } } },
    });
    const image = product?.images.find((item) => item.id === imageId);
    if (!product || !image) return null;
    if (product.images.length === 1 && product.status === "ACTIVE") {
      throw new RangeError("An active product must keep at least one image.");
    }
    if (product._count.orderLines > 0) {
      throw new RangeError("Product images referenced by existing orders cannot be removed.");
    }
    await transaction.productImage.delete({ where: { id: imageId } });
    const remaining = product.images.filter((item) => item.id !== imageId);
    for (const [position, item] of remaining.entries()) {
      await transaction.productImage.update({ where: { id: item.id }, data: { position } });
    }
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "PRODUCT_IMAGE_REMOVED",
      entity: "Product",
      entityId: productId,
      before: auditJson({ imageId, key: image.key, mimeType: image.mimeType, sizeBytes: image.sizeBytes }),
    });
    return { provider: image.provider, key: image.key, mimeType: image.mimeType, size: image.sizeBytes };
  }).then(async (removed) => {
    if (removed) {
      await getStorageProvider(removed.provider).delete({
        provider: removed.provider as StoredFile["provider"],
        key: removed.key,
        mimeType: removed.mimeType,
        size: removed.size,
      });
    }
    return removed;
  });
}

export async function reorderProductImages(productId: string, imageIds: string[]) {
  const actor = await requireAdmin();
  if (new Set(imageIds).size !== imageIds.length || imageIds.length < 1 || imageIds.length > 8) {
    throw new RangeError("Provide the unique image order for one to eight product images.");
  }
  return db.$transaction(async (transaction) => {
    const images = await transaction.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
    if (images.length !== imageIds.length || images.some((image) => !imageIds.includes(image.id))) {
      throw new RangeError("The image list has changed; reload and try again.");
    }

    await transaction.productImage.updateMany({
      where: { productId },
      data: { position: { increment: 100 } },
    });
    for (const [position, imageId] of imageIds.entries()) {
      await transaction.productImage.update({ where: { id: imageId }, data: { position } });
    }
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "PRODUCT_IMAGES_REORDERED",
      entity: "Product",
      entityId: productId,
      before: auditJson(images.map((image) => image.id)),
      after: auditJson(imageIds),
    });
    return imageIds;
  });
}

export async function listAdminInventory() {
  await requireAdmin();
  return db.productVariant.findMany({
    include: {
      product: { select: { id: true, name: true, slug: true, status: true, type: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { size: "asc" }],
  });
}

export async function setInventoryOnHand(input: unknown) {
  const actor = await requireAdmin();
  const parsed = z.object({
    variantId: z.string().min(1),
    onHand: z.number().int().nonnegative(),
    note: z.string().trim().max(500).optional(),
  }).parse(input);

  return db.$transaction(async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{ id: string; onHand: number; reserved: number }>>`
      SELECT "id", "onHand", "reserved"
      FROM "ProductVariant"
      WHERE "id" = ${parsed.variantId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) return null;
    if (parsed.onHand < current.reserved) {
      throw new RangeError("On-hand stock cannot be lower than units reserved by open orders.");
    }
    const delta = parsed.onHand - current.onHand;
    const variant = await transaction.productVariant.update({
      where: { id: parsed.variantId },
      data: { onHand: parsed.onHand },
      include: { product: { select: { name: true } } },
    });
    if (delta !== 0) {
      await transaction.stockMovement.create({
        data: {
          variantId: variant.id,
          actorUserId: actor.id,
          type: "ADJUSTMENT",
          quantity: delta,
          note: parsed.note,
        },
      });
    }
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "INVENTORY_ADJUSTED",
      entity: "ProductVariant",
      entityId: variant.id,
      before: auditJson({ onHand: current.onHand, reserved: current.reserved }),
      after: auditJson({ onHand: variant.onHand, reserved: variant.reserved, note: parsed.note ?? null }),
    });
    return variant;
  });
}