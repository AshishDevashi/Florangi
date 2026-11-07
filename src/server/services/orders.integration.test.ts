import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createManualClock } from "@/server/domain/clock";
import { createCartQuoteVersion } from "@/server/services/cart";
import { cancelOrderForGuest, createOrderForGuest, IdempotencyConflictError } from "@/server/services/orders";
import { expireUnpaidOrders } from "@/server/payments/expiry";
import { processPaymentWebhook, reconcileCapturedPayment, recordFailedPayment } from "@/server/payments/service";
import { createFullRefundForAdmin } from "@/server/payments/refunds";
import { enqueueEmailJob, decryptEmailPayload } from "@/server/email/outbox";
import { processEmailJobs } from "@/server/email/worker";
import { createGuestReplacementRequest } from "@/server/services/replacements";
import { releaseReplacementAllocationForAdmin } from "@/server/services/replacements";
import { correctOrderMeasurementsForAdmin } from "@/server/services/admin-orders";
import { confirmCustomCodOrder, enqueueCodConfirmationReminders } from "@/server/services/cod-confirmation";
import { getOrderTracking } from "@/server/services/order-tracking";

const guestAccess = vi.hoisted(() => ({ orderId: "", token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === `florangi_order_${guestAccess.orderId}` ? { value: guestAccess.token } : undefined,
  }),
}));

const now = new Date();
const measurementRanges = {
  bust: { min: 30, max: 50 },
  underbust: { min: 25, max: 45 },
  waist: { min: 24, max: 48 },
  hips: { min: 32, max: 55 },
  dressLength: { min: 35, max: 65 },
  heightFeet: { min: 4, max: 7 },
  heightInches: { min: 0, max: 11.99 },
};

let fixtureNumber = 0;

async function createFixture(stock: number) {
  fixtureNumber += 1;
  const suffix = `${Date.now()}-${fixtureNumber}`;
  const customer = {
    firstName: "Order",
    lastName: `Test${fixtureNumber}`,
    phoneNumber: "9876543210",
    email: `order-test-${suffix}@example.test`,
  };
  const category = await db.category.create({
    data: { name: `Integration ${suffix}`, slug: `integration-${suffix}`, visible: true },
  });
  const product = await db.product.create({
    data: {
      name: `Integration dress ${suffix}`,
      slug: `integration-dress-${suffix}`,
      description: "Synthetic integration fixture.",
      categoryId: category.id,
      type: "DESIGNER_DRESS",
      basePricePaise: 100000,
      status: "ACTIVE",
      images: {
        create: [{ provider: "static", key: `images/integration-${suffix}.svg`, mimeType: "image/svg+xml", sizeBytes: 100, position: 0 }],
      },
      variants: { create: [{ size: "XS", sizePremiumPaise: 5000, onHand: stock, reserved: 0 }] },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const unitPricePaise = product.basePricePaise + variant.sizePremiumPaise;
  const quoteVersion = createCartQuoteVersion({
    productId: product.id,
    variantId: variant.id,
    type: product.type,
    unitPricePaise,
    shippingFeePaise: 0,
    shippingFreeThresholdPaise: 500000,
  });
  const cartLine = {
    lineId: crypto.randomUUID(),
    productId: product.id,
    variantId: variant.id,
    quantity: 1,
    acceptedUnitPaise: unitPricePaise,
    quoteVersion,
  };
  return { customer, category, product, variant, cartLine, quoteVersion };
}

function payloadFor(fixture: Awaited<ReturnType<typeof createFixture>>, paymentMethod: "ONLINE" | "COD" = "COD") {
  return {
    idempotencyKey: crypto.randomUUID(),
    paymentMethod,
    firstName: fixture.customer.firstName,
    lastName: fixture.customer.lastName,
    phoneNumber: fixture.customer.phoneNumber,
    email: fixture.customer.email,
    address: { line1: "1 Integration Road", city: "Mumbai", state: "Maharashtra", pinCode: "400001" },
    lines: [fixture.cartLine],
  };
}

function allowGuestOrderAccess(orderId: string, token: string) {
  guestAccess.orderId = orderId;
  guestAccess.token = token;
}

beforeAll(async () => {
  const settings = [
    { key: "shipping_fee_paise", value: { amountPaise: 0 } },
    { key: "shipping_free_threshold_paise", value: { amountPaise: 500000 } },
    { key: "replacement_window_hours", value: { hours: 96 } },
    { key: "measurement_ranges", value: measurementRanges },
  ];
  for (const setting of settings) {
    await db.setting.upsert({
      where: { key_version: { key: setting.key, version: 1 } },
      create: { ...setting, version: 1 },
      update: { value: setting.value, effectiveAt: now },
    });
  }
});

describe("real PostgreSQL order integrity", () => {
  it("tracks an order publicly by number without returning private buyer data", async () => {
    const fixture = await createFixture(2);
    const placed = await createOrderForGuest(payloadFor(fixture));
    const tracking = await getOrderTracking(` ${placed.order.orderNumber.toLowerCase()} `);
    expect(tracking).toMatchObject({ orderNumber: placed.order.orderNumber, fulfillmentStatus: "PENDING_APPROVAL" });
    expect(Object.keys(tracking!).sort()).toEqual([
      "codSurchargePaise", "createdAt", "fulfillmentStatus", "lines", "orderNumber", "paymentMethod",
      "paymentStatus", "shipment", "shippingFeePaise", "subtotalPaise", "totalPaise",
    ].sort());
    expect(Object.keys(tracking!.lines[0]).sort()).toEqual([
      "productName", "productType", "quantity", "size", "unitPricePaise",
    ].sort());
    expect(await getOrderTracking(placed.order.id)).toBeNull();
    expect(await getOrderTracking("invalid-number")).toBeNull();
    expect(await getOrderTracking("FLR-0000-000000")).toBeNull();
  });

  it("stores guest checkout contact on the order and sends the receipt to the buyer", async () => {
    const fixture = await createFixture(2);
    const payload = { ...payloadFor(fixture), email: "guest-buyer@example.test" };
    const first = await createOrderForGuest(payload);
    const retry = await createOrderForGuest(payload);
    expect(first.order).toMatchObject({
      firstName: payload.firstName,
      lastName: payload.lastName,
      phoneNumber: payload.phoneNumber,
      email: payload.email,
    });
    expect(retry.order.id).toBe(first.order.id);
    expect(retry.reused).toBe(true);
    const receipts = await db.emailJob.findMany({ where: { eventKey: `order-received:${first.order.id}` } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].recipient).toBe(payload.email);
    await expect(createOrderForGuest({ ...payload, email: "another-buyer@example.test" }))
      .rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("AT-10 reserves stock atomically, records snapshots, and safely retries idempotent COD checkout", async () => {
    const fixture = await createFixture(2);
    const payload = payloadFor(fixture);
    const first = await createOrderForGuest(payload);
    const retry = await createOrderForGuest(payload);
    const changed = { ...payload, address: { ...payload.address, city: "Pune" } };
    await expect(createOrderForGuest(changed)).rejects.toBeInstanceOf(IdempotencyConflictError);

    const stored = await db.order.findUniqueOrThrow({
      where: { id: first.order.id },
      include: { lines: true },
    });
    const inventory = await db.productVariant.findUniqueOrThrow({ where: { id: fixture.variant.id } });
    expect(first.reused).toBe(false);
    expect(retry.reused).toBe(true);
    expect(retry.order.id).toBe(first.order.id);
    expect(stored.orderNumber).toMatch(/^FLR-\d{4}-\d{6}$/);
    expect(stored.fulfillmentStatus).toBe("PENDING_APPROVAL");
    expect(stored.paymentStatus).toBe("COD_PENDING");
    expect(stored.codSurchargePaise).toBe(0);
    expect(stored.lines[0].unitPricePaise).toBe(105000);
    expect(stored.lines[0].productName).toBe(fixture.product.name);
    expect(inventory.reserved).toBe(1);
  });

  it("AT-05 lets exactly one concurrent checkout reserve the final unit", async () => {
    const [first, second] = await Promise.all([createFixture(1), createFixture(1)]);
    const sharedProduct = await db.product.create({
      data: {
        name: `Shared race dress ${Date.now()}`,
        slug: `shared-race-${Date.now()}`,
        description: "Synthetic concurrent checkout fixture.",
        categoryId: first.category.id,
        type: "DESIGNER_DRESS",
        basePricePaise: 100000,
        status: "ACTIVE",
        images: {
          create: [{ provider: "static", key: `images/shared-race-${Date.now()}.svg`, mimeType: "image/svg+xml", sizeBytes: 100, position: 0 }],
        },
        variants: { create: [{ size: "XS", sizePremiumPaise: 0, onHand: 1, reserved: 0 }] },
      },
      include: { variants: true },
    });
    const variant = sharedProduct.variants[0];
    const sharedQuoteVersion = createCartQuoteVersion({
      productId: sharedProduct.id,
      variantId: variant.id,
      type: sharedProduct.type,
      unitPricePaise: sharedProduct.basePricePaise,
      shippingFeePaise: 0,
      shippingFreeThresholdPaise: 500000,
    });
    const sharedLineFor = (fixture: Awaited<ReturnType<typeof createFixture>>) => ({
      ...fixture.cartLine,
      productId: sharedProduct.id,
      variantId: variant.id,
      acceptedUnitPaise: sharedProduct.basePricePaise,
      quoteVersion: sharedQuoteVersion,
    });

    const attempts = await Promise.allSettled([
      createOrderForGuest({ ...payloadFor(first, "ONLINE"), lines: [sharedLineFor(first)] }),
      createOrderForGuest({ ...payloadFor(second, "ONLINE"), lines: [sharedLineFor(second)] }),
    ]);
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const inventory = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(successes).toHaveLength(1);
    expect(inventory.reserved).toBe(1);
    expect(inventory.reserved).toBeLessThanOrEqual(inventory.onHand);
  });

  it("releases a pending order reservation exactly once on customer cancellation", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "ONLINE"));
    const before = await db.productVariant.findUniqueOrThrow({ where: { id: fixture.variant.id } });
    const cancelled = await cancelOrderForGuest(placed.order.id);
    await expect(cancelOrderForGuest(placed.order.id)).rejects.toThrow();
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: fixture.variant.id } });
    expect(placed.order.fulfillmentStatus).toBe("PENDING_PAYMENT");
    expect(cancelled.fulfillmentStatus).toBe("CANCELLED");
    expect(before.reserved).toBe(1);
    expect(after.reserved).toBe(0);
  });

  it("AT-06 expires unpaid orders under lock and flags a late capture without re-reserving stock", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "ONLINE"));
    const providerOrderId = `mock_order_expiry_${crypto.randomUUID()}`;
    const paymentId = `mock_payment_late_${crypto.randomUUID()}`;
    await db.order.update({
      where: { id: placed.order.id },
      data: { razorpayOrderId: providerOrderId, paymentDeadline: new Date(Date.now() - 1) },
    });
    await db.paymentAttempt.create({
      data: {
        orderId: placed.order.id,
        provider: "mock",
        providerOrderId,
        amountPaise: placed.order.totalPaise,
        currency: "INR",
        status: "CREATED",
      },
    });
    const clock = createManualClock(new Date(Date.now() + 31 * 60 * 1000));
    const expired = await expireUnpaidOrders(clock);
    const duplicateExpiry = await expireUnpaidOrders(clock);
    await db.paymentAttempt.updateMany({
      where: { orderId: placed.order.id, providerOrderId },
      data: { providerPaymentId: paymentId, status: "CAPTURED" },
    });
    const lateCapture = await reconcileCapturedPayment(providerOrderId, paymentId);
    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: placed.order.id } });
    const inventory = await db.productVariant.findUniqueOrThrow({ where: { id: fixture.variant.id } });

    expect(expired.orderIds).toContain(placed.order.id);
    expect(duplicateExpiry.expiredCount).toBe(0);
    expect(lateCapture.refundRequired).toBe(true);
    expect(finalOrder.fulfillmentStatus).toBe("CANCELLED");
    expect(finalOrder.paymentStatus).toBe("REFUND_REQUIRED");
    expect(inventory.reserved).toBe(0);
  });

  it("AT-07/08 reconciles capture once, clears only purchased lines, redacts webhook data, and ignores late failure", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "ONLINE"));
    const providerOrderId = `mock_order_capture_${crypto.randomUUID()}`;
    const paymentId = `mock_payment_capture_${crypto.randomUUID()}`;
    await db.order.update({ where: { id: placed.order.id }, data: { razorpayOrderId: providerOrderId } });
    await db.paymentAttempt.create({
      data: {
        orderId: placed.order.id,
        provider: "mock",
        providerOrderId,
        providerPaymentId: paymentId,
        amountPaise: placed.order.totalPaise,
        currency: "INR",
        status: "CAPTURED",
      },
    });

    const reconciled = await reconcileCapturedPayment(providerOrderId, paymentId);
    const replay = await reconcileCapturedPayment(providerOrderId, paymentId);
    const failure = await recordFailedPayment(providerOrderId, `mock_failure_${crypto.randomUUID()}`, "late_failure");
    const rawEvent = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      event: "payment.captured",
      payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, amount: placed.order.totalPaise, currency: "INR", status: "captured", captured: true, email: "must-not-be-persisted@example.test" } } },
    });
    const eventId = JSON.parse(rawEvent).id as string;
    const webhook = await processPaymentWebhook(rawEvent, eventId);
    const webhookReplay = await processPaymentWebhook(rawEvent, eventId);
    const storedOrder = await db.order.findUniqueOrThrow({ where: { id: placed.order.id } });
    const storedEvent = await db.paymentEvent.findUniqueOrThrow({ where: { providerEventId: eventId } });
    const emails = await db.emailJob.count({ where: { eventKey: `order-received:${placed.order.id}` } });

    expect(reconciled.order.paymentStatus).toBe("PAID");
    expect(replay.duplicate).toBe(true);
    expect("ignored" in failure && failure.ignored).toBe(true);
    expect(storedOrder.paymentStatus).toBe("PAID");
    expect(storedOrder.fulfillmentStatus).toBe("PENDING_APPROVAL");
    expect(webhook.duplicate).toBe(false);
    expect(webhookReplay.duplicate).toBe(true);
    expect(JSON.stringify(storedEvent.payload)).not.toContain("must-not-be-persisted@example.test");
    expect(emails).toBe(1);
  });

  it("AT-12 verifies a full refund idempotently without changing fulfillment status", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "ONLINE"));
    const providerOrderId = `mock_order_refund_${crypto.randomUUID()}`;
    const paymentId = `mock_payment_refund_${crypto.randomUUID()}`;
    await db.order.update({ where: { id: placed.order.id }, data: { razorpayOrderId: providerOrderId } });
    await db.paymentAttempt.create({
      data: {
        orderId: placed.order.id,
        provider: "mock",
        providerOrderId,
        providerPaymentId: paymentId,
        amountPaise: placed.order.totalPaise,
        currency: "INR",
        status: "CAPTURED",
      },
    });
    await reconcileCapturedPayment(providerOrderId, paymentId);
    await db.order.update({
      where: { id: placed.order.id },
      data: { fulfillmentStatus: "CANCELLED", paymentStatus: "REFUND_REQUIRED" },
    });
    const admin = await db.adminUser.create({
      data: {
        email: `refund-admin-${crypto.randomUUID()}@example.test`,
        name: "Refund Admin",
        passwordHash: "integration-test-not-used",
      },
      select: { id: true, email: true, name: true },
    });

    const first = await createFullRefundForAdmin(admin, placed.order.id);
    const retry = await createFullRefundForAdmin(admin, placed.order.id);
    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: placed.order.id } });
    expect(first.refund.status).toBe("PROCESSED");
    expect(retry.duplicate).toBe(true);
    expect(finalOrder.paymentStatus).toBe("REFUNDED");
    expect(finalOrder.fulfillmentStatus).toBe("CANCELLED");
  });

  it("EML-11/14 encrypts and deduplicates email jobs, then processes the dev outbox", async () => {
    const eventKey = `email-worker-test:${crypto.randomUUID()}`;
    const message = {
      eventKey,
      template: "order-received",
      recipient: `email-worker-${crypto.randomUUID()}@example.test`,
      payload: { subject: "Synthetic email test", text: "No external message is sent." },
    };
    await db.$transaction((transaction) => enqueueEmailJob(transaction, message));
    await db.$transaction((transaction) => enqueueEmailJob(transaction, message));
    const before = await db.emailJob.findMany({ where: { eventKey } });
    expect(before).toHaveLength(1);
    expect(JSON.stringify(before[0].payload)).not.toContain("No external message is sent.");
    expect(decryptEmailPayload(before[0].payload)).toEqual(message.payload);

    await db.emailJob.update({ where: { id: before[0].id }, data: { availableAt: new Date(0) } });
    const processed = await processEmailJobs();
    const after = await db.emailJob.findUniqueOrThrow({ where: { id: before[0].id } });
    expect(processed.processed).toBeGreaterThanOrEqual(1);
    expect(after.status).toBe("SENT");
  });

  it("AT-11 enforces the delivered replacement window and rejects duplicate open line requests", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "COD"));
    allowGuestOrderAccess(placed.order.id, placed.accessToken);
    const deliveredAt = new Date("2026-01-01T00:00:00.000Z");
    await db.order.update({ where: { id: placed.order.id }, data: { fulfillmentStatus: "DELIVERED" } });
    await db.shipment.create({
      data: {
        orderId: placed.order.id,
        courierName: "Integration courier",
        awbNumber: `AWB-${crypto.randomUUID()}`,
        shippedAt: new Date(deliveredAt.getTime() - 60 * 60 * 1000),
        deliveredAt,
      },
    });
    const beforeClose = createManualClock(new Date(deliveredAt.getTime() + (95 * 60 + 59) * 60_000));
    const request = await createGuestReplacementRequest({
      orderId: placed.order.id,
      reason: "Synthetic exchange window test.",
      lines: [{ orderLineId: placed.order.lines[0].id, desiredSize: "S" }],
    }, [], beforeClose);
    await expect(createGuestReplacementRequest({
      orderId: placed.order.id,
      reason: "Duplicate open request.",
      lines: [{ orderLineId: placed.order.lines[0].id, desiredSize: "M" }],
    }, [], beforeClose)).rejects.toThrow(/open replacement request/i);

    const atClose = createManualClock(new Date(deliveredAt.getTime() + 96 * 60 * 60 * 1000));
    await expect(createGuestReplacementRequest({
      orderId: placed.order.id,
      reason: "Closed-window request.",
      lines: [{ orderLineId: placed.order.lines[0].id, desiredSize: "M" }],
    }, [], atClose)).rejects.toThrow(/window has closed/i);
    expect(request.status).toBe("OPEN");
  });

  it("ORD-14/EML-3/16 creates a signed COD confirmation link and queues one 24-hour reminder", async () => {
    fixtureNumber += 1;
    const suffix = `${Date.now()}-${fixtureNumber}`;
    const customer = {
      firstName: "COD",
      lastName: "Confirmation Test",
      phoneNumber: "9876543210",
      email: `cod-confirm-${suffix}@example.test`,
    };
    const category = await db.category.create({ data: { name: `Custom ${suffix}`, slug: `custom-${suffix}`, visible: true } });
    const product = await db.product.create({
      data: {
        name: `Custom confirmation ${suffix}`,
        slug: `custom-confirmation-${suffix}`,
        description: "Synthetic COD confirmation fixture.",
        categoryId: category.id,
        type: "CUSTOM_DRESS",
        basePricePaise: 100000,
        customizationFeePaise: 50000,
        status: "ACTIVE",
        images: { create: [{ provider: "static", key: `images/custom-confirmation-${suffix}.svg`, mimeType: "image/svg+xml", sizeBytes: 100, position: 0 }] },
      },
    });
    const measurements = { bust: 36, underbust: 32, waist: 30, hips: 40, dressLength: 55, heightFeet: 5, heightInches: 6 };
    const unitPricePaise = product.basePricePaise + product.customizationFeePaise!;
    const quoteVersion = createCartQuoteVersion({
      productId: product.id,
      variantId: null,
      type: product.type,
      unitPricePaise,
      shippingFeePaise: 0,
      shippingFreeThresholdPaise: 500000,
    });
    const placed = await createOrderForGuest({
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: "COD",
      firstName: customer.firstName,
      lastName: customer.lastName,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      address: { line1: "1 COD Road", city: "Mumbai", state: "Maharashtra", pinCode: "400001" },
      lines: [{
        lineId: crypto.randomUUID(),
        productId: product.id,
        variantId: null,
        quantity: 1,
        measurements,
        acceptedUnitPaise: unitPricePaise,
        quoteVersion,
      }],
    });
    const confirmationEmail = await db.emailJob.findFirstOrThrow({ where: { eventKey: `cod-confirmation-initial:${placed.order.id}` } });
    const emailPayload = decryptEmailPayload(confirmationEmail.payload);
    const link = new URL(String(emailPayload.url));
    expect(link.search).toBe("");
    expect(link.hash).toContain("token=");
    expect(placed.order.confirmedAt).toBeNull();

    const reminderClock = createManualClock(new Date(placed.order.createdAt.getTime() + 25 * 60 * 60 * 1000));
    expect(await enqueueCodConfirmationReminders(reminderClock)).toBeGreaterThanOrEqual(1);
    expect(await enqueueCodConfirmationReminders(reminderClock)).toBe(0);
    const reminder = await db.emailJob.findFirstOrThrow({ where: { eventKey: `cod-confirmation-reminder:${placed.order.id}` } });
    const reminderPayload = decryptEmailPayload(reminder.payload);
    const token = new URL(String(reminderPayload.url)).hash.slice(1);
    const parsedToken = new URLSearchParams(token).get("token");
    expect(parsedToken).toBeTruthy();

    const confirmed = await confirmCustomCodOrder(placed.order.id, parsedToken!);
    expect(confirmed.duplicate).toBe(false);
    expect(confirmed.order.confirmationMethod).toBe("EMAIL_LINK");
    expect(confirmed.order.fulfillmentStatus).toBe("PENDING_APPROVAL");
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.order.id } })).paymentStatus).toBe("COD_PENDING");
  });

  it("REQ-7 releases an accepted DD exchange allocation with a stock movement", async () => {
    const fixture = await createFixture(1);
    const placed = await createOrderForGuest(payloadFor(fixture, "COD"));
    await db.order.update({ where: { id: placed.order.id }, data: { fulfillmentStatus: "DELIVERED" } });
    const deliveredAt = new Date();
    await db.shipment.create({
      data: {
        orderId: placed.order.id,
        courierName: "Replacement test courier",
        awbNumber: `AWB-${crypto.randomUUID()}`,
        shippedAt: new Date(deliveredAt.getTime() - 60_000),
        deliveredAt,
      },
    });
    const exchangeVariant = await db.productVariant.create({
      data: { productId: fixture.product.id, size: "S", sizePremiumPaise: 0, onHand: 2, reserved: 1 },
    });
    const request = await db.replacementRequest.create({
      data: {
        orderId: placed.order.id,
        status: "ACCEPTED",
        reason: "Synthetic exchange allocation release.",
        logisticsNote: "Hold for customer return.",
        lines: {
          create: [{
            orderLineId: placed.order.lines[0].id,
            desiredSize: "S",
            allocatedVariantId: exchangeVariant.id,
            allocatedAt: now,
          }],
        },
      },
      include: { lines: true },
    });
    const admin = await db.adminUser.create({
      data: {
        email: `allocation-admin-${crypto.randomUUID()}@example.test`,
        name: "Allocation Admin",
        passwordHash: "integration-test-not-used",
      },
      select: { id: true, email: true, name: true },
    });

    await releaseReplacementAllocationForAdmin(admin, request.id, request.lines[0].id, "Customer exchange withdrawn.");
    const inventory = await db.productVariant.findUniqueOrThrow({ where: { id: exchangeVariant.id } });
    const movement = await db.stockMovement.findFirstOrThrow({ where: { variantId: exchangeVariant.id, orderId: null }, orderBy: { createdAt: "desc" } });
    const updatedLine = await db.replacementRequestLine.findUniqueOrThrow({ where: { id: request.lines[0].id } });
    expect(inventory.reserved).toBe(0);
    expect(movement.type).toBe("REPLACEMENT_RELEASE");
    expect(movement.quantity).toBe(-1);
    expect(updatedLine.allocatedVariantId).toBeNull();
  });

  it("ORD-9 versions measurement corrections without overwriting the original snapshot", async () => {
    fixtureNumber += 1;
    const suffix = `${Date.now()}-${fixtureNumber}`;
    const customer = {
      firstName: "Measurement",
      lastName: "Customer",
      phoneNumber: "9876543210",
      email: `measurement-customer-${suffix}@example.test`,
    };
    const category = await db.category.create({ data: { name: `Measurements ${suffix}`, slug: `measurements-${suffix}`, visible: true } });
    const product = await db.product.create({
      data: {
        name: `Measurement dress ${suffix}`,
        slug: `measurement-dress-${suffix}`,
        description: "Synthetic measurement version fixture.",
        categoryId: category.id,
        type: "CUSTOM_DRESS",
        basePricePaise: 100000,
        customizationFeePaise: 50000,
        status: "ACTIVE",
        images: { create: [{ provider: "static", key: `images/measurement-${suffix}.svg`, mimeType: "image/svg+xml", sizeBytes: 100, position: 0 }] },
      },
    });
    const original = { bust: 36, underbust: 32, waist: 30, hips: 40, dressLength: 55, heightFeet: 5, heightInches: 6 };
    const unitPricePaise = product.basePricePaise + product.customizationFeePaise!;
    const quoteVersion = createCartQuoteVersion({ productId: product.id, variantId: null, type: product.type, unitPricePaise, shippingFeePaise: 0, shippingFreeThresholdPaise: 500000 });
    const placed = await createOrderForGuest({
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: "COD",
      firstName: customer.firstName,
      lastName: customer.lastName,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      address: { line1: "1 Measurement Road", city: "Mumbai", state: "Maharashtra", pinCode: "400001" },
      lines: [{
        lineId: crypto.randomUUID(),
        productId: product.id,
        variantId: null,
        quantity: 1,
        measurements: original,
        acceptedUnitPaise: unitPricePaise,
        quoteVersion,
      }],
    });
    const admin = await db.adminUser.create({
      data: { email: `measurement-admin-${suffix}@example.test`, name: "Measurement Admin", passwordHash: "integration-test-not-used" },
      select: { id: true, email: true, name: true },
    });
    const corrected = { ...original, waist: 31, fitNotes: "Customer requested correction." };
    const version = await correctOrderMeasurementsForAdmin(admin, placed.order.id, placed.order.lines[0].id, { values: corrected, reason: "Customer correction request by email." });
    const versions = await db.measurementVersion.findMany({ where: { orderLineId: placed.order.lines[0].id }, orderBy: { version: "asc" } });
    const snapshot = await db.orderLine.findUniqueOrThrow({ where: { id: placed.order.lines[0].id } });
    expect(version.version).toBe(2);
    expect(versions).toHaveLength(2);
    expect(versions[0].values).toMatchObject(original);
    expect(versions[1].values).toMatchObject(corrected);
    expect(snapshot.measurementsSnapshot).toMatchObject(original);
  });
});

afterAll(async () => {
  await db.$disconnect();
});