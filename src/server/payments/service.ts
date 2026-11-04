import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/server/auth/guards";
import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";
import { assertFulfillmentTransition } from "@/server/domain/order-state";
import { formatPaise } from "@/server/domain/money";
import { systemClock } from "@/server/domain/clock";
import { enqueueEmailJob } from "@/server/email/outbox";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { getPaymentProvider } from "@/server/payments/provider";
import { verifyAndCompleteRefund } from "@/server/payments/refunds";
import { readOrderContact } from "@/server/domain/order-contact";

function mockSecret(): Buffer {
  return createHash("sha256").update(`${getEnvironment().SESSION_SECRET}:florangi-mock-payment`).digest();
}

function paymentSignatureSecret(): Buffer {
  const environment = getEnvironment();
  return environment.PAYMENT_DRIVER === "mock"
    ? mockSecret()
    : Buffer.from(environment.RAZORPAY_KEY_SECRET!, "utf8");
}

function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actual)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createPaymentSignature(orderId: string, paymentId: string): string {
  return createHmac("sha256", paymentSignatureSecret()).update(`${orderId}|${paymentId}`).digest("hex");
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  return safeEqualHex(createPaymentSignature(orderId, paymentId), signature);
}

export function verifyPaymentWebhookSignature(rawBody: string, signature: string): boolean {
  const environment = getEnvironment();
  const secret = environment.PAYMENT_DRIVER === "mock"
    ? mockSecret()
    : Buffer.from(environment.RAZORPAY_WEBHOOK_SECRET!, "utf8");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export async function createProviderOrderForCustomer(orderId: string) {
  const customer = await requireCustomer();
  const environment = getEnvironment();
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await transaction.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      include: { paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) throw new RangeError("Order not found.");
    if (order.paymentMethod !== "ONLINE" || order.fulfillmentStatus !== "PENDING_PAYMENT") {
      throw new RangeError("This order is not awaiting online payment.");
    }
    if (order.razorpayOrderId) {
      return {
        providerOrderId: order.razorpayOrderId,
        amountPaise: order.totalPaise,
        currency: order.currency,
        keyId: environment.PAYMENT_DRIVER === "razorpay" ? environment.NEXT_PUBLIC_RAZORPAY_KEY_ID : null,
        driver: environment.PAYMENT_DRIVER,
      };
    }

    const provider = getPaymentProvider();
    const providerOrder = await provider.createOrder({ amount: order.totalPaise, currency: "INR", receipt: order.orderNumber });
    if (providerOrder.amount !== order.totalPaise || providerOrder.currency !== "INR") {
      throw new Error("Payment provider created an order with unexpected amount or currency.");
    }
    await transaction.order.update({ where: { id: order.id }, data: { razorpayOrderId: providerOrder.id } });
    await transaction.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: environment.PAYMENT_DRIVER,
        providerOrderId: providerOrder.id,
        amountPaise: order.totalPaise,
        currency: "INR",
        status: "CREATED",
      },
    });
    return {
      providerOrderId: providerOrder.id,
      amountPaise: order.totalPaise,
      currency: "INR",
      keyId: environment.PAYMENT_DRIVER === "razorpay" ? environment.NEXT_PUBLIC_RAZORPAY_KEY_ID : null,
      driver: environment.PAYMENT_DRIVER,
    };
  });
}

function receiptText(order: {
  orderNumber: string;
  subtotalPaise: number;
  shippingFeePaise: number;
  codSurchargePaise: number;
  totalPaise: number;
  lines: Array<{ productName: string; quantity: number; unitPricePaise: number; productType: string; measurementsSnapshot: Prisma.JsonValue }>;
}) {
  const lines = order.lines.map((line) => `${line.productName} x ${line.quantity}: ${formatPaise(line.unitPricePaise * line.quantity)}`);
  return `Your online payment is confirmed.\n${lines.join("\n")}\nSubtotal: ${formatPaise(order.subtotalPaise)}\nShipping: ${formatPaise(order.shippingFeePaise)}\nTotal: ${formatPaise(order.totalPaise)}`;
}

export async function reconcileCapturedPayment(providerOrderId: string, paymentId: string) {
  const provider = getPaymentProvider();
  const payment = await provider.fetchPayment(paymentId);
  if (!payment.captured || payment.status !== "captured") throw new RangeError("Payment has not been captured.");
  if (payment.orderId !== providerOrderId) throw new RangeError("Payment does not belong to this provider order.");

  return db.$transaction(async (transaction) => {
    const candidate = await transaction.order.findUnique({
      where: { razorpayOrderId: providerOrderId },
      select: { id: true },
    });
    if (!candidate) throw new RangeError("Payment order does not match the saved checkout.");
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const order = await transaction.order.findUnique({
      where: { id: candidate.id },
      include: { lines: true },
    });
    if (!order || order.razorpayOrderId !== providerOrderId) throw new RangeError("Payment order does not match the saved checkout.");
    if (payment.amount !== order.totalPaise || payment.currency !== "INR") {
      throw new RangeError("Captured payment amount or currency does not match the order.");
    }

    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
      return { order, duplicate: true, refundRequired: false };
    }

    const matchingAttempt = await transaction.paymentAttempt.findFirst({
      where: { orderId: order.id, providerOrderId, providerPaymentId: paymentId },
    });
    if (matchingAttempt?.status === "CAPTURED" && matchingAttempt.verifiedAt) {
      return { order, duplicate: true, refundRequired: order.paymentStatus === "REFUND_REQUIRED" };
    }
    const unclaimedAttempt = matchingAttempt ?? await transaction.paymentAttempt.findFirst({
      where: { orderId: order.id, providerOrderId, providerPaymentId: null, status: "CREATED" },
      orderBy: { createdAt: "desc" },
    });
    const paymentAttempt = unclaimedAttempt
      ? await transaction.paymentAttempt.update({
          where: { id: unclaimedAttempt.id },
          data: { providerPaymentId: paymentId, status: "CAPTURED", verifiedAt: systemClock.now() },
        })
      : await transaction.paymentAttempt.create({
          data: {
            orderId: order.id,
            provider: getEnvironment().PAYMENT_DRIVER,
            providerOrderId,
            providerPaymentId: paymentId,
            amountPaise: order.totalPaise,
            currency: "INR",
            status: "CAPTURED",
            verifiedAt: systemClock.now(),
          },
        });
    if (order.fulfillmentStatus === "CANCELLED") {
      const lateOrder = await transaction.order.update({
        where: { id: order.id },
        data: { paymentStatus: "REFUND_REQUIRED" },
      });
      await transaction.orderTimelineEvent.create({
        data: {
          orderId: order.id,
          actorName: "System",
          action: "LATE_PAYMENT_REFUND_REQUIRED",
          fromState: "CANCELLED",
          toState: "CANCELLED",
          note: "Captured payment arrived after cancellation; refund is required. Stock was not re-reserved.",
        },
      });
      await writeAuditEntry(transaction, {
        actorType: "SYSTEM",
        action: "LATE_PAYMENT_REFUND_REQUIRED",
        entity: "Order",
        entityId: order.id,
        before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
        after: auditJson({ fulfillmentStatus: lateOrder.fulfillmentStatus, paymentStatus: lateOrder.paymentStatus, paymentAttemptId: paymentAttempt.id }),
      });
      const admin = await transaction.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
      if (admin) {
        await enqueueEmailJob(transaction, {
          eventKey: `late-capture-refund:${order.id}:${paymentId}`,
          template: "late-capture-refund-required",
          recipient: admin.email,
          payload: { subject: `Late capture needs refund: ${order.orderNumber}`, text: `A late captured payment for ${order.orderNumber} requires a full refund. Stock was not re-reserved.` },
        });
      }
      return { order: lateOrder, duplicate: false, refundRequired: true };
    }

    if (order.fulfillmentStatus !== "PENDING_PAYMENT") {
      throw new RangeError("Order is not awaiting payment reconciliation.");
    }
    assertFulfillmentTransition("PENDING_PAYMENT", "PENDING_APPROVAL", "SYSTEM");
    const paidOrder = await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "PENDING_APPROVAL", paymentStatus: "PAID" },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorName: "System",
        action: "PAYMENT_VERIFIED",
        fromState: "PENDING_PAYMENT",
        toState: "PENDING_APPROVAL",
        note: "Captured payment verified with the payment provider.",
      },
    });
    await writeAuditEntry(transaction, {
      actorType: "SYSTEM",
      action: "PAYMENT_CAPTURE_RECONCILED",
      entity: "Order",
      entityId: order.id,
      before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
      after: auditJson({ fulfillmentStatus: paidOrder.fulfillmentStatus, paymentStatus: paidOrder.paymentStatus, paymentAttemptId: paymentAttempt.id }),
    });

    const cart = await transaction.cart.findUnique({ where: { userId: order.customerId } });
    if (cart) {
      for (const line of order.lines) {
        if (!line.sourceCartLineId) continue;
        await transaction.cartLine.deleteMany({
          where: {
            id: line.sourceCartLineId,
            cartId: cart.id,
            quantity: line.quantity,
            acceptedUnitPaise: line.unitPricePaise,
            quoteVersion: line.sourceCartQuoteVersion,
          },
        });
      }
    }

    const customer = await transaction.user.findUnique({ where: { id: order.customerId }, select: { email: true } });
    if (customer) {
      const contact = readOrderContact(order.contactSnapshot, { name: null, email: customer.email, phone: null });
      await enqueueEmailJob(transaction, {
        eventKey: `order-received:${order.id}`,
        template: "order-received",
        recipient: contact.email,
        payload: {
          subject: `Order ${order.orderNumber} received`,
          text: receiptText(order),
          orderNumber: order.orderNumber,
        },
      });
      if (order.lines.some((line) => line.productType === "CUSTOM_DRESS")) {
        await enqueueEmailJob(transaction, {
          eventKey: `measurement-check:${order.id}`,
          template: "measurement-check",
          recipient: contact.email,
          payload: {
            subject: `Measurements for order ${order.orderNumber}`,
            text: "Please check the measurements saved with your custom order. You may request a correction during the initial 12-hour check period, before production starts.",
            measurements: order.lines.flatMap((line) => line.productType === "CUSTOM_DRESS" ? [line.measurementsSnapshot] : []),
          },
        });
      }
    }
    const admin = await transaction.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
    if (admin) {
      await enqueueEmailJob(transaction, {
        eventKey: `new-order:${order.id}`,
        template: "new-order-alert",
        recipient: admin.email,
        payload: { subject: `New order ${order.orderNumber}`, text: `${order.orderNumber} · Online · ${formatPaise(order.totalPaise)} · awaiting approval` },
      });
    }
    return { order: paidOrder, duplicate: false, refundRequired: false };
  });
}

export async function verifyCustomerPayment(input: unknown) {
  const customer = await requireCustomer();
  const parsed = z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  }).parse(input);
  const order = await db.order.findFirst({
    where: { customerId: customer.id, razorpayOrderId: parsed.razorpay_order_id },
    select: { id: true },
  });
  if (!order) throw new RangeError("Payment order not found.");
  if (!verifyPaymentSignature(parsed.razorpay_order_id, parsed.razorpay_payment_id, parsed.razorpay_signature)) {
    throw new RangeError("Payment signature is invalid.");
  }
  return reconcileCapturedPayment(parsed.razorpay_order_id, parsed.razorpay_payment_id);
}

export async function captureMockPaymentForCustomer(orderId: string) {
  const customer = await requireCustomer();
  const environment = getEnvironment();
  if (environment.NODE_ENV === "production" || environment.PAYMENT_DRIVER !== "mock") {
    throw new RangeError("Mock payment capture is available only in development and test.");
  }
  const paymentId = `mock_payment_${randomBytes(16).toString("hex")}`;
  const attempt = await db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await transaction.order.findFirst({ where: { id: orderId, customerId: customer.id } });
    if (!order || !order.razorpayOrderId || order.fulfillmentStatus !== "PENDING_PAYMENT") {
      throw new RangeError("Order is not available for mock payment.");
    }
    const attempt = await transaction.paymentAttempt.findFirst({
      where: { orderId, provider: "mock", providerOrderId: order.razorpayOrderId },
      orderBy: { createdAt: "desc" },
    });
    if (!attempt) throw new RangeError("Mock payment attempt not found.");
    return transaction.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerPaymentId: paymentId, status: "CAPTURED" },
    });
  });
  const signature = createPaymentSignature(attempt.providerOrderId!, paymentId);
  if (!verifyPaymentSignature(attempt.providerOrderId!, paymentId, signature)) throw new Error("Mock callback signature could not be verified.");
  return reconcileCapturedPayment(attempt.providerOrderId!, paymentId);
}

export async function recordFailedPayment(providerOrderId: string, paymentId: string, failureCode?: string) {
  const provider = getPaymentProvider();
  const providerPayment = await provider.fetchPayment(paymentId).catch(() => null);
  if (providerPayment?.captured) return reconcileCapturedPayment(providerOrderId, paymentId);
  return db.$transaction(async (transaction) => {
    const candidate = await transaction.order.findUnique({ where: { razorpayOrderId: providerOrderId }, select: { id: true } });
    if (!candidate) throw new RangeError("Payment attempt not found.");
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const order = await transaction.order.findUniqueOrThrow({ where: { id: candidate.id } });
    const existingAttempt = await transaction.paymentAttempt.findUnique({ where: { providerPaymentId: paymentId } });
    if (existingAttempt?.status === "CAPTURED") return { order, ignored: true };
    if (!existingAttempt) {
      await transaction.paymentAttempt.create({
        data: {
          orderId: order.id,
          provider: getEnvironment().PAYMENT_DRIVER,
          providerOrderId,
          providerPaymentId: paymentId,
          amountPaise: order.totalPaise,
          currency: order.currency,
          status: "FAILED",
          failureCode: failureCode ?? null,
        },
      });
    } else {
      await transaction.paymentAttempt.update({
        where: { id: existingAttempt.id },
        data: { status: "FAILED", failureCode: failureCode ?? null, verifiedAt: null },
      });
    }
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUND_REQUIRED" || order.paymentStatus === "REFUNDED") {
      return { order, ignored: true };
    }
    const failedOrder = order.fulfillmentStatus === "PENDING_PAYMENT"
      ? await transaction.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } })
      : order;
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorName: "System",
        action: "PAYMENT_ATTEMPT_FAILED",
        fromState: order.paymentStatus,
        toState: failedOrder.paymentStatus,
        note: "The latest online payment attempt failed. The order remains retryable until its payment deadline.",
      },
    });
    return { order: failedOrder, ignored: false };
  });
}

const webhookSchema = z.object({
  id: z.string().optional(),
  event: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function readPaymentEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const wrapper = payload as Record<string, unknown>;
  const payment = wrapper.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return null;
  const entity = (payment as Record<string, unknown>).entity;
  return entity && typeof entity === "object" && !Array.isArray(entity) ? entity as Record<string, unknown> : null;
}

function readOrderEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const wrapper = payload as Record<string, unknown>;
  const order = wrapper.order;
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const entity = (order as Record<string, unknown>).entity;
  return entity && typeof entity === "object" && !Array.isArray(entity) ? entity as Record<string, unknown> : null;
}

function readRefundEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const wrapper = payload as Record<string, unknown>;
  const refund = wrapper.refund;
  if (!refund || typeof refund !== "object" || Array.isArray(refund)) return null;
  const entity = (refund as Record<string, unknown>).entity;
  return entity && typeof entity === "object" && !Array.isArray(entity) ? entity as Record<string, unknown> : null;
}

function safeWebhookPayload(eventId: string, eventType: string, payload: unknown): Prisma.InputJsonValue {
  const entity = readPaymentEntity(payload) ?? readRefundEntity(payload);
  const orderEntity = readOrderEntity(payload);
  const source = entity ?? orderEntity;
  const allowedFields = ["id", "order_id", "payment_id", "amount", "amount_paid", "currency", "status", "captured", "error_code", "refund_id"] as const;
  const safeEntity = source
    ? Object.fromEntries(allowedFields.flatMap((key) => key in source ? [[key, source[key]]] : []))
    : {};
  const nested = entity
    ? { payment: { entity: safeEntity } }
    : readRefundEntity(payload)
      ? { refund: { entity: safeEntity } }
      : orderEntity
      ? { order: { entity: safeEntity } }
      : {};
  return { id: eventId, event: eventType, payload: nested } as Prisma.InputJsonValue;
}

export async function processPaymentWebhook(rawBody: string, providerEventId: string | null) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    throw new RangeError("Webhook body is not valid JSON.");
  }
  const parsed = webhookSchema.safeParse(decoded);
  if (!parsed.success) throw new RangeError("Webhook payload is invalid.");
  const eventId = providerEventId ?? parsed.data.id;
  if (!eventId) throw new RangeError("Webhook event ID is required.");
  const safePayload = safeWebhookPayload(eventId, parsed.data.event, parsed.data.payload);

  let event = await db.paymentEvent.findUnique({ where: { providerEventId: eventId } });
  if (event?.processedAt) return { duplicate: true };
  if (!event) {
    try {
      event = await db.paymentEvent.create({
        data: {
          provider: getEnvironment().PAYMENT_DRIVER,
          providerEventId: eventId,
          eventType: parsed.data.event,
          payload: safePayload,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      event = await db.paymentEvent.findUniqueOrThrow({ where: { providerEventId: eventId } });
      if (event.processedAt) return { duplicate: true };
    }
  }

  try {
    const entity = readPaymentEntity(parsed.data.payload);
    if (parsed.data.event === "payment.captured") {
      const providerOrderId = typeof entity?.order_id === "string" ? entity.order_id : "";
      const paymentId = typeof entity?.id === "string" ? entity.id : "";
      if (!providerOrderId || !paymentId) throw new RangeError("Captured payment event is missing its provider IDs.");
      await reconcileCapturedPayment(providerOrderId, paymentId);
    } else if (parsed.data.event === "order.paid") {
      const orderEntity = readOrderEntity(parsed.data.payload);
      const providerOrderId = typeof orderEntity?.id === "string" ? orderEntity.id : "";
      if (!providerOrderId) throw new RangeError("Paid order event is missing its provider order ID.");
      const provider = getPaymentProvider();
      const payment = await provider.fetchCapturedPaymentForOrder(providerOrderId);
      await reconcileCapturedPayment(providerOrderId, payment.id);
    } else if (parsed.data.event === "payment.failed") {
      const providerOrderId = typeof entity?.order_id === "string" ? entity.order_id : "";
      const paymentId = typeof entity?.id === "string" ? entity.id : "";
      if (providerOrderId && paymentId) {
        await recordFailedPayment(providerOrderId, paymentId, typeof entity?.error_code === "string" ? entity.error_code : undefined);
      }
    } else if (parsed.data.event === "refund.processed") {
      const refundEntity = readRefundEntity(parsed.data.payload);
      const refundId = typeof refundEntity?.id === "string" ? refundEntity.id : "";
      if (!refundId) throw new RangeError("Processed refund event is missing its provider refund ID.");
      await verifyAndCompleteRefund(refundId);
    }
    await db.paymentEvent.update({ where: { id: event.id }, data: { processedAt: systemClock.now(), processingError: null } });
    return { duplicate: false };
  } catch (error) {
    await db.paymentEvent.update({
      where: { id: event.id },
      data: { processingError: error instanceof Error ? error.message.slice(0, 500) : "Unknown payment reconciliation error." },
    });
    throw error;
  }
}