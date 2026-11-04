import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { z } from "zod";
import { requireCustomer, ResourceNotFoundError } from "@/server/auth/guards";
import { createSession, getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { calculateSubtotalPaise, calculateTotalPaise, priceUnit } from "@/server/domain/pricing";
import { parseMeasurementRanges, validateMeasurements, type CustomMeasurements } from "@/server/domain/measurements";
import { assertFulfillmentTransition } from "@/server/domain/order-state";
import { systemClock, type Clock } from "@/server/domain/clock";
import { enqueueEmailJob } from "@/server/email/outbox";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { getCustomerCart } from "@/server/services/cart";
import { quoteCartLines } from "@/server/services/cart";
import { getEffectiveSettings } from "@/server/services/settings";
import { formatPaise } from "@/server/domain/money";
import { enqueueCodConfirmation } from "@/server/services/cod-confirmation";

export const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(20).regex(/^(?:\+91[-\s]?)?[6-9]\d{9}$/),
  line1: z.string().trim().min(1).max(240),
  line2: z.string().trim().max(240).optional().or(z.literal("")),
  landmark: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  pinCode: z.string().regex(/^[1-9][0-9]{5}$/),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

const checkoutSchema = z.object({
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(["ONLINE", "COD"]),
  customerEmail: z.email().optional(),
  address: deliveryAddressSchema,
  lines: z.array(z.object({
    lineId: z.string().min(1),
    quantity: z.number().int().positive(),
    quoteVersion: z.string().length(64),
  })).min(1).max(100),
}).superRefine((input, context) => {
  if (new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length) {
    context.addIssue({ code: "custom", path: ["lines"], message: "Cart lines must be unique." });
  }
});

type CheckoutPayload = z.infer<typeof checkoutSchema>;

const guestCheckoutSchema = z.object({
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(["ONLINE", "COD"]),
  customerEmail: z.email().max(254),
  address: deliveryAddressSchema,
  lines: z.array(z.object({
    lineId: z.string().min(1).max(200),
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable().optional(),
    measurements: z.unknown().optional(),
    quantity: z.number().int().positive(),
    acceptedUnitPaise: z.number().int().nonnegative(),
    quoteVersion: z.string().length(64),
  })).min(1).max(100),
});

type GuestCheckoutPayload = z.infer<typeof guestCheckoutSchema>;
type GuestCartLine = GuestCheckoutPayload["lines"][number];

export class IdempotencyConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("This checkout key was already used with different details.");
    this.name = "IdempotencyConflictError";
  }
}

function parseCheckout(input: unknown): CheckoutPayload {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) throw new RangeError("Please check the delivery address, cart lines, and payment method.");
  return parsed.data;
}

function hashCheckoutPayload(payload: CheckoutPayload): string {
  const canonical = JSON.stringify({
    paymentMethod: payload.paymentMethod,
    customerEmail: payload.customerEmail?.trim().toLowerCase() ?? "",
    address: {
      fullName: payload.address.fullName,
      phone: payload.address.phone.replace(/[\s-]/g, ""),
      line1: payload.address.line1,
      line2: payload.address.line2 ?? "",
      landmark: payload.address.landmark ?? "",
      city: payload.address.city,
      state: payload.address.state,
      pinCode: payload.address.pinCode,
    },
    lines: [...payload.lines].sort((a, b) => a.lineId.localeCompare(b.lineId)),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function currentSettings(rows: Array<{ key: string; version: number; value: PrismaTypes.JsonValue }>) {
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!byKey.has(row.key)) byKey.set(row.key, row);
  const readAmount = (key: string, field: string): number => {
    const value = byKey.get(key)?.value;
    if (value === undefined) return 0;
    if (!value || typeof value !== "object" || Array.isArray(value) || !(field in value) || typeof value[field] !== "number") {
      throw new Error(`Required checkout setting ${key} is missing.`);
    }
    const amount = value[field];
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Checkout setting ${key} is invalid.`);
    return amount;
  };
  const windowValue = byKey.get("replacement_window_hours")?.value ?? { hours: 96 };
  if (!windowValue || typeof windowValue !== "object" || Array.isArray(windowValue) || !("hours" in windowValue) || typeof windowValue.hours !== "number") {
    throw new Error("Replacement window is not configured.");
  }
  const replacementWindowHours = windowValue.hours;
  if (!Number.isSafeInteger(replacementWindowHours) || replacementWindowHours < 0) {
    throw new Error("Replacement window setting is invalid.");
  }

  return {
    shippingFeePaise: readAmount("shipping_fee_paise", "amountPaise"),
    shippingFreeThresholdPaise: readAmount("shipping_free_threshold_paise", "amountPaise"),
    replacementWindowHours,
    snapshot: Object.fromEntries([...byKey.entries()].map(([key, row]) => [key, { version: row.version, value: row.value }])),
  };
}

export async function getCustomerCheckoutQuote(paymentMethod: "ONLINE" | "COD", clock: Clock = systemClock) {
  const cart = await getCustomerCart(clock);
  if (cart.lines.length === 0) throw new RangeError("Your cart is empty.");
  if (cart.hasBlockingLines) throw new RangeError("Resolve unavailable items and measurement errors before checkout.");
  if (cart.needsAcceptance) throw new RangeError("Accept updated prices in your cart before checkout.");

  const settings = await getEffectiveSettings(clock);
  const readAmount = (key: string) => {
    const value = settings.get(key)?.value;
    if (value === undefined) return 0;
    if (!value || typeof value !== "object" || Array.isArray(value) || !("amountPaise" in value) || typeof value.amountPaise !== "number") {
      throw new Error(`Required checkout setting ${key} is missing.`);
    }
    return value.amountPaise;
  };
  const totals = calculateTotalPaise(cart.subtotalPaise, {
    shippingFeePaise: readAmount("shipping_fee_paise"),
    shippingFreeThresholdPaise: readAmount("shipping_free_threshold_paise"),
  }, paymentMethod);
  return { ...cart, ...totals, paymentMethod };
}

export async function getGuestCheckoutQuote(lines: unknown, paymentMethod: "ONLINE" | "COD", clock: Clock = systemClock) {
  const cart = await quoteCartLines(lines, clock);
  if (cart.lines.length === 0) throw new RangeError("Your cart is empty.");
  if (cart.hasBlockingLines) throw new RangeError("Resolve unavailable items and measurement errors before checkout.");
  if (cart.needsAcceptance) throw new RangeError("Accept updated prices in your cart before checkout.");

  const settings = await getEffectiveSettings(clock);
  const readAmount = (key: string) => {
    const value = settings.get(key)?.value;
    if (value === undefined) return 0;
    if (!value || typeof value !== "object" || Array.isArray(value) || !("amountPaise" in value) || typeof value.amountPaise !== "number") {
      throw new Error(`Required checkout setting ${key} is missing.`);
    }
    return value.amountPaise;
  };
  const totals = calculateTotalPaise(cart.subtotalPaise, {
    shippingFeePaise: readAmount("shipping_fee_paise"),
    shippingFreeThresholdPaise: readAmount("shipping_free_threshold_paise"),
  }, paymentMethod);
  return { ...cart, ...totals, paymentMethod };
}

export async function createCustomerOrder(input: unknown, clock: Clock = systemClock) {
  const customer = await requireCustomer();
  return createOrderForCustomer(customer, input, clock);
}

export async function createOrderForCustomer(
  customer: { id: string; email: string; name: string | null; isGuestSession?: boolean },
  input: unknown,
  clock: Clock = systemClock,
  guestLines?: GuestCartLine[],
) {
  const payload = parseCheckout(input);
  const payloadHash = hashCheckoutPayload(payload);
  const now = clock.now();
  if (!customer.isGuestSession && payload.customerEmail && payload.customerEmail.trim().toLowerCase() !== customer.email.toLowerCase()) {
    throw new RangeError("Checkout email does not match the customer contact email.");
  }

  try {
    return await db.$transaction(async (transaction) => {
      const existing = await transaction.order.findUnique({
        where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: payload.idempotencyKey } },
        include: { lines: true },
      });
      if (existing) {
        if (existing.idempotencyPayloadHash !== payloadHash) throw new IdempotencyConflictError();
        return { order: existing, reused: true };
      }

      const cart = await transaction.cart.upsert({ where: { userId: customer.id }, create: { userId: customer.id }, update: {} });
      const requestedIds = payload.lines.map((line) => line.lineId);
      if (guestLines) {
        const payloadById = new Map(payload.lines.map((line) => [line.lineId, line]));
        for (const guestLine of guestLines) {
          const checkoutLine = payloadById.get(guestLine.lineId);
          if (!checkoutLine || checkoutLine.quantity !== guestLine.quantity || checkoutLine.quoteVersion !== guestLine.quoteVersion) {
            throw new RangeError("Guest cart line details do not match the reviewed checkout quote.");
          }
          const lineId = `${cart.id}:${guestLine.lineId}`;
          await transaction.cartLine.upsert({
            where: { id: lineId },
            create: {
              id: lineId,
              cartId: cart.id,
              productId: guestLine.productId,
              variantId: guestLine.variantId ?? null,
              measurements: guestLine.measurements as object | undefined,
              quantity: guestLine.quantity,
              acceptedUnitPaise: guestLine.acceptedUnitPaise,
              quoteVersion: guestLine.quoteVersion,
            },
            update: {
              productId: guestLine.productId,
              variantId: guestLine.variantId ?? null,
              measurements: guestLine.measurements as object | undefined,
              quantity: guestLine.quantity,
              acceptedUnitPaise: guestLine.acceptedUnitPaise,
              quoteVersion: guestLine.quoteVersion,
            },
          });
        }
        for (let index = 0; index < requestedIds.length; index += 1) {
          requestedIds[index] = `${cart.id}:${requestedIds[index]}`;
        }
      }
      const cartLines = await transaction.cartLine.findMany({
        where: { cartId: cart.id, id: { in: requestedIds } },
        orderBy: { createdAt: "asc" },
      });
      if (cartLines.length !== requestedIds.length) throw new RangeError("Your cart changed. Refresh and review it before checkout.");
      const requestedById = new Map(payload.lines.map((line) => [
        guestLines ? `${cart.id}:${line.lineId}` : line.lineId,
        line,
      ]));
      for (const line of cartLines) {
        const requestLine = requestedById.get(line.id);
        if (!requestLine || requestLine.quantity !== line.quantity || requestLine.quoteVersion !== line.quoteVersion) {
          throw new RangeError("Your cart or quote changed. Refresh and accept the current prices before checkout.");
        }
      }

      const productIds = [...new Set(cartLines.map((line) => line.productId))].sort();
      for (const productId of productIds) {
        await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR SHARE`;
      }
      const variantIds = [...new Set(cartLines.map((line) => line.variantId).filter((id): id is string => id !== null))].sort();
      for (const variantId of variantIds) {
        await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${variantId} FOR UPDATE`;
      }

      const products = await transaction.product.findMany({
        where: { id: { in: productIds } },
        include: { category: true, images: { orderBy: { position: "asc" } }, variants: true },
      });
      const productById = new Map(products.map((product) => [product.id, product]));
      const settingsRows = await transaction.setting.findMany({
        where: {
          key: { in: ["shipping_fee_paise", "shipping_free_threshold_paise", "replacement_window_hours", "measurement_ranges"] },
          effectiveAt: { lte: now },
        },
        orderBy: [{ key: "asc" }, { effectiveAt: "desc" }, { version: "desc" }],
      });
      const settings = currentSettings(settingsRows);
      const settingsByKey = new Map<string, (typeof settingsRows)[number]>();
      for (const row of settingsRows) if (!settingsByKey.has(row.key)) settingsByKey.set(row.key, row);
      const rangesValue = settingsByKey.get("measurement_ranges")?.value;
      const pricedLines: Array<{ product: (typeof products)[number]; cartLine: (typeof cartLines)[number]; variant: (typeof products)[number]["variants"][number] | null; measurements: CustomMeasurements | null; unitPricePaise: number; image: PrismaTypes.InputJsonValue | typeof Prisma.JsonNull }> = [];

      for (const cartLine of cartLines) {
        const product = productById.get(cartLine.productId);
        if (!product || product.status !== "ACTIVE" || !product.category.visible) {
          throw new RangeError("A cart item is no longer available. Remove it before checkout.");
        }
        if (product.images.length < 1 || product.images.length > 8) throw new RangeError("A cart item is missing its product image.");
        let variant: (typeof product.variants)[number] | null = null;
        let measurements: CustomMeasurements | null = null;
        let unitPricePaise: number;
        if (product.type === "DESIGNER_DRESS") {
          variant = product.variants.find((candidate) => candidate.id === cartLine.variantId) ?? null;
          if (!variant) throw new RangeError("A selected size is no longer available.");
          const available = variant.onHand - variant.reserved;
          if (cartLine.quantity > available) throw new RangeError(`Only ${Math.max(available, 0)} units remain for a selected size.`);
          unitPricePaise = priceUnit({ type: product.type, basePricePaise: product.basePricePaise, sizePremiumPaise: variant.sizePremiumPaise });
        } else {
          if (cartLine.variantId || cartLine.quantity !== 1 || !product.customizationFeePaise) {
            throw new RangeError("Custom dresses require one valid measurement set per cart line.");
          }
          if (rangesValue === undefined) throw new RangeError("Custom orders are not available yet.");
          measurements = validateMeasurements(cartLine.measurements, parseMeasurementRanges(rangesValue));
          unitPricePaise = priceUnit({ type: product.type, basePricePaise: product.basePricePaise, customizationFeePaise: product.customizationFeePaise });
        }

        const expectedQuoteVersion = createHash("sha256").update(JSON.stringify({
          productId: product.id,
          variantId: variant?.id ?? null,
          type: product.type,
          unitPricePaise,
          shippingFeePaise: settings.shippingFeePaise,
          shippingFreeThresholdPaise: settings.shippingFreeThresholdPaise,
        })).digest("hex");
        if (cartLine.acceptedUnitPaise !== unitPricePaise || cartLine.quoteVersion !== expectedQuoteVersion) {
          throw new RangeError("A cart price or shipping setting changed. Return to your cart and accept the updated quote.");
        }

        const firstImage = product.images[0];
        const imageSnapshot: PrismaTypes.InputJsonValue | typeof Prisma.JsonNull = firstImage
          ? { provider: firstImage.provider, key: firstImage.key, mimeType: firstImage.mimeType }
          : Prisma.JsonNull;
        pricedLines.push({ product, cartLine, variant, measurements, unitPricePaise, image: imageSnapshot });
      }

      const subtotalPaise = calculateSubtotalPaise(pricedLines.map((line) => ({
        type: line.product.type,
        basePricePaise: line.unitPricePaise,
        sizePremiumPaise: 0,
        customizationFeePaise: 0,
        quantity: line.cartLine.quantity,
      })));
      const total = calculateTotalPaise(subtotalPaise, {
        shippingFeePaise: settings.shippingFeePaise,
        shippingFreeThresholdPaise: settings.shippingFreeThresholdPaise,
      }, payload.paymentMethod);

      const year = now.getUTCFullYear();
      const counters = await transaction.$queryRaw<Array<{ nextValue: number }>>`
        INSERT INTO "OrderCounter" ("year", "nextValue", "updatedAt")
        VALUES (${year}, 1, ${now})
        ON CONFLICT ("year") DO UPDATE SET "nextValue" = "OrderCounter"."nextValue" + 1, "updatedAt" = ${now}
        RETURNING "nextValue"
      `;
      const orderNumber = `FLR-${year}-${String(counters[0].nextValue).padStart(6, "0")}`;
      const fulfillmentStatus = payload.paymentMethod === "COD" ? "PENDING_APPROVAL" : "PENDING_PAYMENT";
      const paymentStatus = payload.paymentMethod === "COD" ? "COD_PENDING" : "UNPAID";
      if (payload.paymentMethod === "COD") {
        assertFulfillmentTransition("PENDING_PAYMENT", "PENDING_APPROVAL", "SYSTEM");
      }

      const normalizedPhone = payload.address.phone.replace(/[\s-]/g, "");
      const addressSnapshot = {
        ...payload.address,
        phone: normalizedPhone,
        line2: payload.address.line2 || null,
        landmark: payload.address.landmark || null,
        country: "IN",
      };
      const order = await transaction.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          fulfillmentStatus,
          paymentStatus,
          paymentMethod: payload.paymentMethod,
          subtotalPaise: total.subtotalPaise,
          shippingFeePaise: total.shippingFeePaise,
          codSurchargePaise: total.codSurchargePaise,
          totalPaise: total.totalPaise,
          addressSnapshot,
          contactSnapshot: {
            name: customer.name,
            email: payload.customerEmail?.trim().toLowerCase() ?? customer.email,
            phone: normalizedPhone,
          },
          settingsSnapshot: { ...settings.snapshot, replacementWindowHours: settings.replacementWindowHours },
          paymentDeadline: payload.paymentMethod === "ONLINE" ? new Date(now.getTime() + 30 * 60 * 1000) : null,
          idempotencyKey: payload.idempotencyKey,
          idempotencyPayloadHash: payloadHash,
          lines: {
            create: pricedLines.map(({ product, cartLine, variant, measurements, unitPricePaise, image }) => ({
              sourceCartLineId: cartLine.id,
              sourceCartQuoteVersion: cartLine.quoteVersion,
              productId: product.id,
              productName: product.name,
              productImage: image,
              productType: product.type,
              variantId: variant?.id ?? null,
              size: variant?.size ?? null,
              measurementsSnapshot: measurements ? auditJson(measurements) : Prisma.DbNull,
              quantity: cartLine.quantity,
              unitPricePaise,
              customizationFeePaise: product.type === "CUSTOM_DRESS" ? product.customizationFeePaise! : 0,
            })),
          },
        },
        include: { lines: true },
      });

      for (const [index, orderLine] of order.lines.entries()) {
        const { variant, measurements } = pricedLines[index];
        if (variant) {
          await transaction.productVariant.update({
            where: { id: variant.id },
            data: { reserved: { increment: orderLine.quantity } },
          });
          await transaction.stockMovement.create({
            data: {
              variantId: variant.id,
              orderId: order.id,
              actorUserId: customer.id,
              type: "RESERVATION",
              quantity: orderLine.quantity,
              note: `Reserved for ${order.orderNumber}`,
            },
          });
        }
        if (measurements) {
          await transaction.measurementVersion.create({
            data: {
              orderLineId: orderLine.id,
              version: 1,
              values: auditJson(measurements),
              authorType: "CUSTOMER",
              authorUserId: customer.id,
            },
          });
        }
      }

      await transaction.orderTimelineEvent.create({
        data: {
          orderId: order.id,
          actorUserId: customer.id,
          actorName: customer.name ?? customer.email,
          action: "ORDER_CREATED",
          toState: fulfillmentStatus,
          note: payload.paymentMethod === "COD" ? "Cash on Delivery order placed." : "Online payment is pending.",
        },
      });
      await writeAuditEntry(transaction, {
        actorUserId: customer.id,
        actorType: "USER",
        action: "ORDER_CREATED",
        entity: "Order",
        entityId: order.id,
        after: auditJson({ orderNumber, fulfillmentStatus, paymentStatus, paymentMethod: payload.paymentMethod, totalPaise: total.totalPaise }),
      });

      if (payload.paymentMethod === "COD") {
        await transaction.cartLine.deleteMany({ where: { id: { in: requestedIds }, cartId: cart.id } });
        const receiptLines = order.lines.map((line) => `${line.productName} x ${line.quantity}: ${formatPaise(line.unitPricePaise * line.quantity)}`);
        await enqueueEmailJob(transaction, {
          eventKey: `order-received:${order.id}`,
          template: "order-received",
          recipient: payload.customerEmail?.trim().toLowerCase() ?? customer.email,
          payload: {
            subject: `Order ${order.orderNumber} received`,
            text: `Your order is awaiting approval.\n${receiptLines.join("\n")}\nSubtotal: ${formatPaise(total.subtotalPaise)}\nShipping: ${formatPaise(total.shippingFeePaise)}\nTotal: ${formatPaise(total.totalPaise)}`,
            orderNumber: order.orderNumber,
          },
        });
        if (pricedLines.some((line) => line.measurements)) {
          await enqueueEmailJob(transaction, {
            eventKey: `measurement-check:${order.id}`,
            template: "measurement-check",
            recipient: payload.customerEmail?.trim().toLowerCase() ?? customer.email,
            payload: {
              subject: `Measurements for order ${order.orderNumber}`,
              text: `Please check the measurements saved with your custom order. You may request a correction during the initial 12-hour check period, before production starts.`,
              measurements: pricedLines.flatMap((line) => line.measurements ? [line.measurements] : []),
            },
          });
          await enqueueCodConfirmation(transaction, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerEmail: payload.customerEmail?.trim().toLowerCase() ?? customer.email,
            clock,
          });
        }
        const admin = await transaction.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
        if (admin) {
          await enqueueEmailJob(transaction, {
            eventKey: `new-order:${order.id}`,
            template: "new-order-alert",
            recipient: admin.email,
            payload: {
              subject: `New order ${order.orderNumber}`,
              text: `${order.orderNumber} · COD · ${formatPaise(total.totalPaise)} · awaiting approval`,
            },
          });
        }
      }

      return { order, reused: false };
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.order.findUnique({
        where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: payload.idempotencyKey } },
        include: { lines: true },
      });
      if (existing) {
        if (existing.idempotencyPayloadHash !== payloadHash) throw new IdempotencyConflictError();
        return { order: existing, reused: true };
      }
    }
    throw error;
  }
}

export async function createGuestOrder(input: unknown, clock: Clock = systemClock) {
  const parsed = guestCheckoutSchema.safeParse(input);
  if (!parsed.success) throw new RangeError("Enter your name, mobile, email, delivery address, and current cart items.");
  const payload: GuestCheckoutPayload = parsed.data;
  const email = payload.customerEmail.trim().toLowerCase();
  let guestUser = await getCurrentUser();
  if (!guestUser || guestUser.role !== "CUSTOMER" || !guestUser.isGuestSession) {
    guestUser = await db.user.create({
      data: {
        email: `guest-${randomBytes(24).toString("hex")}@guest.florangi.invalid`,
        name: payload.address.fullName,
        phone: payload.address.phone.replace(/[\s-]/g, ""),
        passwordHash: randomBytes(48).toString("base64url"),
        role: "CUSTOMER",
        isGuestSession: true,
      },
    });
  } else {
    guestUser = await db.user.update({
      where: { id: guestUser.id },
      data: {
        name: payload.address.fullName,
        phone: payload.address.phone.replace(/[\s-]/g, ""),
      },
    });
  }
  const checkoutPayload = {
    idempotencyKey: payload.idempotencyKey,
    paymentMethod: payload.paymentMethod,
    customerEmail: email,
    address: payload.address,
    lines: payload.lines.map(({ lineId, quantity, quoteVersion }) => ({ lineId, quantity, quoteVersion })),
  };
  const result = await createOrderForCustomer(
    { id: guestUser.id, email: guestUser.email, name: guestUser.name, isGuestSession: guestUser.isGuestSession },
    checkoutPayload,
    clock,
    payload.lines,
  );
  await createSession(guestUser.id, clock);
  return result;
}

export async function listCustomerOrders() {
  const customer = await requireCustomer();
  return db.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { createdAt: "asc" } }, shipment: true, timeline: { orderBy: { createdAt: "asc" } }, replacementRequests: { orderBy: { createdAt: "desc" } } },
  });
}

export async function getCustomerOrder(orderId: string) {
  const customer = await requireCustomer();
  return db.order.findFirst({
    where: { id: orderId, customerId: customer.id },
    include: {
      lines: { orderBy: { createdAt: "asc" }, include: { measurementVersions: { orderBy: { version: "asc" } } } },
      shipment: true,
      timeline: { orderBy: { createdAt: "asc" } },
      replacementRequests: { orderBy: { createdAt: "desc" }, include: { lines: true } },
    },
  });
}

export async function cancelPendingPaymentOrder(orderId: string) {
  const customer = await requireCustomer();
  return cancelOrderForCustomer(customer, orderId);
}

export async function cancelOrderForCustomer(
  customer: { id: string; email: string; name: string | null },
  orderId: string,
) {
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await transaction.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      include: { lines: true },
    });
    if (!order) throw new ResourceNotFoundError("Order not found.");
    assertFulfillmentTransition(order.fulfillmentStatus, "CANCELLED", "CUSTOMER");
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUND_REQUIRED" || order.paymentStatus === "REFUNDED") {
      throw new RangeError("A paid order cannot be cancelled by the customer.");
    }

    const variants = order.lines
      .filter((line): line is typeof line & { variantId: string } => line.variantId !== null)
      .sort((left, right) => left.variantId.localeCompare(right.variantId));
    for (const line of variants) {
      await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.variantId} FOR UPDATE`;
      const released = await transaction.productVariant.updateMany({
        where: { id: line.variantId, reserved: { gte: line.quantity } },
        data: { reserved: { decrement: line.quantity } },
      });
      if (released.count !== 1) throw new Error("Stock reservation mismatch while cancelling order.");
      await transaction.stockMovement.create({
        data: {
          variantId: line.variantId,
          orderId: order.id,
          actorUserId: customer.id,
          type: "RELEASE",
          quantity: -line.quantity,
          note: `Reservation released for ${order.orderNumber}`,
        },
      });
    }

    const cancelled = await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "CANCELLED" },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorUserId: customer.id,
        actorName: customer.name ?? customer.email,
        action: "ORDER_CANCELLED",
        fromState: order.fulfillmentStatus,
        toState: "CANCELLED",
        note: "Cancelled by customer before payment.",
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: customer.id,
      actorType: "USER",
      action: "CUSTOMER_ORDER_CANCELLED",
      entity: "Order",
      entityId: order.id,
      before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
      after: auditJson({ fulfillmentStatus: cancelled.fulfillmentStatus, paymentStatus: cancelled.paymentStatus }),
    });
    return cancelled;
  });
}

export function orderJson(value: unknown): PrismaTypes.InputJsonValue {
  return auditJson(value);
}