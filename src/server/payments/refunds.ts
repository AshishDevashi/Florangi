import "server-only";

import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { systemClock } from "@/server/domain/clock";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { getPaymentProvider } from "@/server/payments/provider";

export async function verifyAndCompleteRefund(providerRefundId: string) {
  const provider = getPaymentProvider();
  const providerRefund = await provider.fetchRefund(providerRefundId);
  const localRefund = await db.refund.findUnique({
    where: { providerRefundId },
    include: { order: true },
  });
  if (!localRefund) throw new RangeError("Refund record not found.");
  const payment = await db.paymentAttempt.findFirst({
    where: { orderId: localRefund.orderId, status: "CAPTURED", providerPaymentId: providerRefund.paymentId },
  });
  if (
    !payment ||
    providerRefund.paymentId !== payment.providerPaymentId ||
    providerRefund.amount !== localRefund.amountPaise ||
    localRefund.amountPaise !== localRefund.order.totalPaise ||
    localRefund.currency !== "INR"
  ) {
    throw new RangeError("Provider refund does not match the captured order payment.");
  }
  if (providerRefund.status !== "processed") {
    return { refund: localRefund, order: localRefund.order, completed: false };
  }

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${localRefund.orderId} FOR UPDATE`;
    const order = await transaction.order.findUniqueOrThrow({ where: { id: localRefund.orderId } });
    const refund = await transaction.refund.update({
      where: { id: localRefund.id },
      data: { status: "PROCESSED", completedAt: systemClock.now() },
    });
    if (order.paymentStatus === "REFUNDED") return { refund, order, completed: true };
    if (order.paymentStatus !== "REFUND_REQUIRED") throw new RangeError("Order is not awaiting a refund.");
    const updatedOrder = await transaction.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorName: "System",
        action: "REFUND_COMPLETED",
        fromState: "REFUND_REQUIRED",
        toState: "REFUNDED",
        note: "Full refund completion verified with the payment provider.",
      },
    });
    await writeAuditEntry(transaction, {
      actorType: "SYSTEM",
      action: "REFUND_COMPLETED",
      entity: "Order",
      entityId: order.id,
      before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
      after: auditJson({ fulfillmentStatus: updatedOrder.fulfillmentStatus, paymentStatus: updatedOrder.paymentStatus, providerRefundId }),
    });
    return { refund, order: updatedOrder, completed: true };
  });
}

export async function createOrReconcileFullRefund(orderId: string) {
  const admin = await requireAdmin();
  return createFullRefundForAdmin(admin, orderId);
}

export async function createFullRefundForAdmin(
  admin: { id: string; email: string; name: string | null },
  orderId: string,
) {
  const refundKey = `full-refund:${orderId}`;
  const context = await db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempts: { where: { status: "CAPTURED" }, orderBy: { verifiedAt: "desc" }, take: 1 } },
    });
    if (!order) throw new RangeError("Order not found.");
    if (order.paymentMethod !== "ONLINE" || !["REFUND_REQUIRED", "REFUNDED"].includes(order.paymentStatus)) {
      throw new RangeError("This order is not eligible for a full online refund.");
    }
    const payment = order.paymentAttempts[0];
    if (!payment?.providerPaymentId || payment.amountPaise !== order.totalPaise || payment.currency !== "INR") {
      throw new RangeError("Verified captured payment does not match the order total.");
    }
    let refund = await transaction.refund.findUnique({ where: { idempotencyKey: refundKey } });
    if (!refund) {
      refund = await transaction.refund.create({
        data: {
          orderId,
          amountPaise: order.totalPaise,
          currency: "INR",
          status: "PENDING",
          idempotencyKey: refundKey,
        },
      });
    }
    return { order, payment, refund };
  });

  if (context.refund.status === "PROCESSED" && context.order.paymentStatus === "REFUNDED") {
    return { refund: context.refund, order: context.order, duplicate: true };
  }
  const provider = getPaymentProvider();
  let providerRefund = context.refund.providerRefundId
    ? await provider.fetchRefund(context.refund.providerRefundId)
    : await provider.createRefund(context.payment.providerPaymentId!, context.order.totalPaise, refundKey);

  if (
    providerRefund.paymentId !== context.payment.providerPaymentId ||
    providerRefund.amount !== context.order.totalPaise
  ) {
    await db.refund.update({ where: { id: context.refund.id }, data: { status: "UNKNOWN" } });
    throw new RangeError("Provider refund does not match the captured order payment.");
  }

  const mappedStatus = providerRefund.status === "processed"
    ? "PROCESSED"
    : providerRefund.status === "failed"
      ? "FAILED"
      : "PENDING";
  const persistedStatus = mappedStatus === "PROCESSED" ? "PENDING" : mappedStatus;
  await db.refund.update({
    where: { id: context.refund.id },
    data: {
      providerRefundId: providerRefund.id,
      status: persistedStatus,
    },
  });
  if (mappedStatus !== "PROCESSED") {
    return { refund: { ...context.refund, providerRefundId: providerRefund.id, status: mappedStatus }, order: context.order, duplicate: false };
  }

  providerRefund = await provider.fetchRefund(providerRefund.id);
  if (
    providerRefund.status !== "processed" ||
    providerRefund.paymentId !== context.payment.providerPaymentId ||
    providerRefund.amount !== context.order.totalPaise
  ) {
    await db.refund.update({ where: { id: context.refund.id }, data: { status: "UNKNOWN", completedAt: null } });
    throw new RangeError("Refund completion could not be verified with the provider.");
  }

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const currentOrder = await transaction.order.findUniqueOrThrow({ where: { id: orderId } });
    if (currentOrder.paymentStatus === "REFUNDED") {
      const refund = await transaction.refund.findUniqueOrThrow({ where: { id: context.refund.id } });
      return { refund, order: currentOrder, duplicate: true };
    }
    if (currentOrder.paymentStatus !== "REFUND_REQUIRED") {
      throw new RangeError("Order refund state changed during provider reconciliation.");
    }
    const refund = await transaction.refund.update({
      where: { id: context.refund.id },
      data: { providerRefundId: providerRefund.id, status: "PROCESSED", completedAt: systemClock.now() },
    });
    const order = await transaction.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" } });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId,
        actorUserId: admin.id,
        actorName: admin.name ?? admin.email,
        action: "REFUND_COMPLETED",
        fromState: "REFUND_REQUIRED",
        toState: "REFUNDED",
        note: `Full refund of ${refund.amountPaise} paise verified with the provider.`,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "REFUND_COMPLETED",
      entity: "Order",
      entityId: orderId,
      before: auditJson({ fulfillmentStatus: currentOrder.fulfillmentStatus, paymentStatus: currentOrder.paymentStatus }),
      after: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, providerRefundId: refund.providerRefundId }),
    });
    return { refund, order, duplicate: false };
  });
}