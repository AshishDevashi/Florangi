import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { requireCustomer } from "@/server/auth/guards";
import { db } from "@/server/db";
import { calculateShippingFeePaise, calculateSubtotalPaise, priceUnit } from "@/server/domain/pricing";
import { parseMeasurementRanges, validateMeasurements, type CustomMeasurements } from "@/server/domain/measurements";
import { systemClock, type Clock } from "@/server/domain/clock";
import { getEffectiveSettings } from "@/server/services/settings";

const cartLineSchema = z.object({
  lineId: z.string().min(1).max(100).optional(),
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  measurements: z.unknown().optional(),
  quantity: z.number().int().positive(),
  acceptedUnitPaise: z.number().int().nonnegative().optional().nullable(),
  acceptedQuoteVersion: z.string().max(128).optional().nullable(),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;
export type QuotedCartLine = {
  lineId?: string;
  productId: string;
  productName?: string;
  type?: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  variantId?: string | null;
  size?: "XS" | "S" | "M";
  measurements?: CustomMeasurements;
  quantity: number;
  available?: number;
  unitPricePaise?: number;
  lineTotalPaise?: number;
  quoteVersion?: string;
  acceptedUnitPaise?: number | null;
  state: "AVAILABLE" | "PRICE_CHANGED" | "UNAVAILABLE" | "INVALID";
  message?: string;
  fieldErrors?: Record<string, string>;
};

function readSettingAmount(value: unknown, key: string, field: string): number {
  if (value === undefined) return 0;
  const parsed = z.object({ [field]: z.number().int().nonnegative() }).safeParse(value);
  if (!parsed.success) throw new Error(`Setting ${key} is invalid.`);
  return parsed.data[field] as number;
}

export function createCartQuoteVersion(input: {
  productId: string;
  variantId: string | null;
  type: string;
  unitPricePaise: number;
  shippingFeePaise: number;
  shippingFreeThresholdPaise?: number;
}): string {
  const canonical = JSON.stringify({ ...input, shippingFreeThresholdPaise: input.shippingFreeThresholdPaise ?? 0 });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function quoteCartLines(
  input: unknown,
  clock: Clock = systemClock,
  options: { checkCombinedVariantQuantity?: boolean } = {},
) {
  const parsed = z.array(cartLineSchema).max(100).safeParse(input);
  if (!parsed.success) throw new RangeError("Cart lines contain invalid product identifiers or quantities.");

  const settings = await getEffectiveSettings(clock);
  const shippingSetting = settings.get("shipping_fee_paise");
  const shippingFeePaise = readSettingAmount(shippingSetting?.value, "shipping_fee_paise", "amountPaise");
  const shippingFreeThresholdPaise = readSettingAmount(settings.get("shipping_free_threshold_paise")?.value, "shipping_free_threshold_paise", "amountPaise");
  const measurementSetting = settings.get("measurement_ranges");
  const productIds = [...new Set(parsed.data.map((line) => line.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    include: { category: true, variants: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const lines: QuotedCartLine[] = parsed.data.map((line) => {
    const unavailable = (message: string): QuotedCartLine => ({
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      acceptedUnitPaise: line.acceptedUnitPaise,
      state: "UNAVAILABLE",
      message,
    });
    const product = productById.get(line.productId);
    if (!product || product.status !== "ACTIVE" || !product.category.visible) {
      return unavailable("This dress is no longer available. Remove it from your cart.");
    }

    if (product.type === "DESIGNER_DRESS") {
      const variant = product.variants.find((candidate) => candidate.id === line.variantId);
      if (!variant) return unavailable("This size is no longer available. Remove it from your cart.");
      const available = Math.max(0, variant.onHand - variant.reserved);
      if (available < 1 || line.quantity > available) {
        return {
          ...unavailable(available < 1 ? "This size is sold out." : `Only ${available} available; update the quantity or remove this item.`),
          available,
          size: variant.size,
        };
      }
      const unitPricePaise = priceUnit({
        type: product.type,
        basePricePaise: product.basePricePaise,
        sizePremiumPaise: variant.sizePremiumPaise,
      });
      const version = createCartQuoteVersion({
        productId: product.id,
        variantId: variant.id,
        type: product.type,
        unitPricePaise,
        shippingFeePaise,
        shippingFreeThresholdPaise,
      });
      const changed = Boolean(line.acceptedQuoteVersion && line.acceptedQuoteVersion !== version)
        || (line.acceptedUnitPaise !== undefined && line.acceptedUnitPaise !== null && line.acceptedUnitPaise !== unitPricePaise);
      return {
        lineId: line.lineId,
        productId: product.id,
        productName: product.name,
        type: product.type,
        variantId: variant.id,
        size: variant.size,
        quantity: line.quantity,
        available,
        unitPricePaise,
        lineTotalPaise: unitPricePaise * line.quantity,
        quoteVersion: version,
        acceptedUnitPaise: line.acceptedUnitPaise,
        state: changed ? "PRICE_CHANGED" : "AVAILABLE",
        ...(changed ? { message: "The price or shipping setting changed. Review and accept the updated quote." } : {}),
      };
    }

    if (line.variantId || line.quantity !== 1 || !product.customizationFeePaise) {
      return { ...unavailable("Custom dresses require one measured line and no size variant."), state: "INVALID" };
    }
    if (!measurementSetting) {
      return { ...unavailable("Custom orders are not available yet. Please try again later."), state: "INVALID" };
    }
    let measurements: CustomMeasurements;
    try {
      measurements = validateMeasurements(line.measurements, parseMeasurementRanges(measurementSetting.value));
    } catch (error) {
      const fieldErrors = error instanceof Error && "fieldErrors" in error
        ? (error as { fieldErrors: Record<string, string> }).fieldErrors
        : undefined;
      return {
        lineId: line.lineId,
        productId: product.id,
        productName: product.name,
        type: product.type,
        quantity: line.quantity,
        acceptedUnitPaise: line.acceptedUnitPaise,
        state: "INVALID",
        message: "Check the required custom measurements.",
        fieldErrors,
      };
    }
    const unitPricePaise = priceUnit({
      type: product.type,
      basePricePaise: product.basePricePaise,
      customizationFeePaise: product.customizationFeePaise,
    });
    const version = createCartQuoteVersion({
      productId: product.id,
      variantId: null,
      type: product.type,
      unitPricePaise,
      shippingFeePaise,
      shippingFreeThresholdPaise,
    });
    const changed = Boolean(line.acceptedQuoteVersion && line.acceptedQuoteVersion !== version)
      || (line.acceptedUnitPaise !== undefined && line.acceptedUnitPaise !== null && line.acceptedUnitPaise !== unitPricePaise);
    return {
      lineId: line.lineId,
      productId: product.id,
      productName: product.name,
      type: product.type,
      measurements,
      quantity: 1,
      unitPricePaise,
      lineTotalPaise: unitPricePaise,
      quoteVersion: version,
      acceptedUnitPaise: line.acceptedUnitPaise,
      state: changed ? "PRICE_CHANGED" : "AVAILABLE",
      ...(changed ? { message: "The price or shipping setting changed. Review and accept the updated quote." } : {}),
    };
  });

  if (options.checkCombinedVariantQuantity !== false) {
    const designerLines = new Map<string, QuotedCartLine[]>();
    for (const line of lines) {
      if (line.type !== "DESIGNER_DRESS" || !line.variantId || line.available === undefined || line.state === "UNAVAILABLE" || line.state === "INVALID") continue;
      const key = `${line.productId}:${line.variantId}`;
      designerLines.set(key, [...(designerLines.get(key) ?? []), line]);
    }
    for (const groupedLines of designerLines.values()) {
      const requestedQuantity = groupedLines.reduce((sum, line) => sum + line.quantity, 0);
      const available = Math.min(...groupedLines.map((line) => line.available ?? 0));
      if (requestedQuantity > available) {
        for (const line of groupedLines) {
          line.state = "UNAVAILABLE";
          line.message = `Only ${available} available across these cart lines; reduce the total quantity or remove an item.`;
        }
      }
    }
  }

  const validLines = lines.filter((line): line is QuotedCartLine & { type: "DESIGNER_DRESS" | "CUSTOM_DRESS"; unitPricePaise: number } =>
    (line.state === "AVAILABLE" || line.state === "PRICE_CHANGED") && line.unitPricePaise !== undefined,
  );
  const subtotalPaise = calculateSubtotalPaise(validLines.map((line) => ({
    type: line.type,
    basePricePaise: line.unitPricePaise,
    sizePremiumPaise: 0,
    customizationFeePaise: 0,
    quantity: line.quantity,
  })));
  const shippingChargePaise = validLines.length === 0 ? 0 : calculateShippingFeePaise(subtotalPaise, { shippingFeePaise, shippingFreeThresholdPaise });
  return {
    lines,
    shippingFeePaise: shippingChargePaise,
    subtotalPaise,
    totalPaise: subtotalPaise + shippingChargePaise,
    hasBlockingLines: lines.some((line) => line.state === "UNAVAILABLE" || line.state === "INVALID"),
    needsAcceptance: lines.some((line) => line.state === "PRICE_CHANGED"),
  };
}

async function getOrCreateCustomerCart(userId: string) {
  return db.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function getCustomerCart(clock: Clock = systemClock) {
  const user = await requireCustomer();
  const cart = await getOrCreateCustomerCart(user.id);
  const storedLines = await db.cartLine.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: "asc" } });
  const quote = await quoteCartLines(storedLines.map((line) => ({
    lineId: line.id,
    productId: line.productId,
    variantId: line.variantId,
    measurements: line.measurements ?? undefined,
    quantity: line.quantity,
    acceptedUnitPaise: line.acceptedUnitPaise,
    acceptedQuoteVersion: line.quoteVersion,
  })), clock);
  return { ...quote, cartId: cart.id };
}

export async function addCustomerCartLine(input: unknown, clock: Clock = systemClock) {
  const user = await requireCustomer();
  const parsed = cartLineSchema.omit({ lineId: true }).parse(input);
  const quote = await quoteCartLines([{ ...parsed, lineId: "new-line" }], clock);
  const line = quote.lines[0];
  if (!line || line.state !== "AVAILABLE" || line.unitPricePaise === undefined || !line.quoteVersion) {
    throw new RangeError(line?.message ?? "This cart item cannot be added.");
  }
  const cart = await getOrCreateCustomerCart(user.id);
  if (line.type === "DESIGNER_DRESS") {
    const existing = await db.cartLine.findFirst({ where: { cartId: cart.id, productId: line.productId, variantId: line.variantId } });
    if (existing) {
      if (existing.acceptedUnitPaise !== line.unitPricePaise || existing.quoteVersion !== line.quoteVersion) {
        throw new RangeError("This size's quote changed. Review your cart before adding another.");
      }
      const quantity = existing.quantity + parsed.quantity;
      if (quantity > (line.available ?? 0)) throw new RangeError("Requested quantity exceeds available stock.");
      return db.cartLine.update({
        where: { id: existing.id },
        data: { quantity, acceptedUnitPaise: line.unitPricePaise, quoteVersion: line.quoteVersion },
      });
    }
  }
  return db.cartLine.create({
    data: {
      cartId: cart.id,
      productId: parsed.productId,
      variantId: parsed.variantId ?? null,
      measurements: parsed.measurements as object | undefined,
      quantity: parsed.quantity,
      acceptedUnitPaise: line.unitPricePaise,
      quoteVersion: line.quoteVersion,
    },
  });
}

export async function updateCustomerCartLine(lineId: string, quantity: number, clock: Clock = systemClock) {
  const user = await requireCustomer();
  const cart = await getOrCreateCustomerCart(user.id);
  const stored = await db.cartLine.findFirst({ where: { id: lineId, cartId: cart.id } });
  if (!stored) return null;
  const quote = await quoteCartLines([{
    productId: stored.productId,
    variantId: stored.variantId,
    measurements: stored.measurements ?? undefined,
    quantity,
    acceptedUnitPaise: stored.acceptedUnitPaise,
    acceptedQuoteVersion: stored.quoteVersion,
  }], clock);
  const line = quote.lines[0];
  if (!line || line.state !== "AVAILABLE" || line.unitPricePaise === undefined || !line.quoteVersion) {
    throw new RangeError(line?.message ?? "Review this cart item before changing its quantity.");
  }
  return db.cartLine.update({
    where: { id: stored.id },
    data: { quantity, acceptedUnitPaise: line.unitPricePaise, quoteVersion: line.quoteVersion },
  });
}

export async function removeCustomerCartLine(lineId: string) {
  const user = await requireCustomer();
  const cart = await getOrCreateCustomerCart(user.id);
  const result = await db.cartLine.deleteMany({ where: { id: lineId, cartId: cart.id } });
  return result.count > 0;
}

export async function clearCustomerCart() {
  const user = await requireCustomer();
  const cart = await getOrCreateCustomerCart(user.id);
  await db.cartLine.deleteMany({ where: { cartId: cart.id } });
  return true;
}

export async function acceptCustomerCartQuotes(clock: Clock = systemClock) {
  const user = await requireCustomer();
  const cart = await getOrCreateCustomerCart(user.id);
  const storedLines = await db.cartLine.findMany({ where: { cartId: cart.id }, orderBy: { createdAt: "asc" } });
  const quote = await quoteCartLines(storedLines.map((line) => ({
    lineId: line.id,
    productId: line.productId,
    variantId: line.variantId,
    measurements: line.measurements ?? undefined,
    quantity: line.quantity,
    acceptedUnitPaise: line.acceptedUnitPaise,
    acceptedQuoteVersion: line.quoteVersion,
  })), clock);
  if (quote.hasBlockingLines) throw new RangeError("Remove unavailable items or correct invalid measurements before accepting prices.");
  await db.$transaction(quote.lines.map((line) => db.cartLine.update({
    where: { id: line.lineId },
    data: { acceptedUnitPaise: line.unitPricePaise, quoteVersion: line.quoteVersion },
  })));
  return getCustomerCart(clock);
}

export async function mergeGuestCart(input: unknown, clock: Clock = systemClock) {
  const user = await requireCustomer();
  const parsed = z.array(cartLineSchema.omit({ lineId: true })).max(100).parse(input);
  const guestLines = parsed.map((line, index) => ({
    ...line,
    quantity: line.variantId ? 1 : line.quantity,
    lineId: `guest-${index}`,
  }));
  const quote = await quoteCartLines(guestLines, clock, { checkCombinedVariantQuantity: false });
  if (quote.hasBlockingLines || quote.needsAcceptance) {
    return { merged: false, requiresReview: true, quote };
  }

  const cart = await getOrCreateCustomerCart(user.id);
  const excess: Array<{ lineId?: string; productId: string; requested: number; merged: number }> = [];
  await db.$transaction(async (transaction) => {
    for (const [index, line] of quote.lines.entries()) {
      if (!line.quoteVersion || line.unitPricePaise === undefined) continue;
      if (line.type === "DESIGNER_DRESS") {
        const requestedQuantity = parsed[index].quantity;
        const existing = await transaction.cartLine.findFirst({
          where: { cartId: cart.id, productId: line.productId, variantId: line.variantId },
        });
        const existingQuantity = existing?.quantity ?? 0;
        const capacity = Math.max(0, (line.available ?? 0) - existingQuantity);
        const mergedQuantity = Math.min(requestedQuantity, capacity);
        if (requestedQuantity > mergedQuantity) {
          excess.push({ lineId: line.lineId, productId: line.productId, requested: requestedQuantity, merged: mergedQuantity });
        }
        if (mergedQuantity === 0) continue;
        if (existing) {
          await transaction.cartLine.update({
            where: { id: existing.id },
            data: {
              quantity: existingQuantity + mergedQuantity,
              acceptedUnitPaise: line.unitPricePaise,
              quoteVersion: line.quoteVersion,
            },
          });
        } else {
          await transaction.cartLine.create({
            data: {
              cartId: cart.id,
              productId: line.productId,
              variantId: line.variantId,
              quantity: mergedQuantity,
              acceptedUnitPaise: line.unitPricePaise,
              quoteVersion: line.quoteVersion,
            },
          });
        }
      } else {
        await transaction.cartLine.create({
          data: {
            cartId: cart.id,
            productId: line.productId,
            quantity: 1,
            measurements: line.measurements as object,
            acceptedUnitPaise: line.unitPricePaise,
            quoteVersion: line.quoteVersion,
          },
        });
      }
    }
  });
  return { merged: true, requiresReview: false, excess, cart: await getCustomerCart(clock) };
}