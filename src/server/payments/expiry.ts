import "server-only";

import { db } from "@/server/db";
import { systemClock, type Clock } from "@/server/domain/clock";
import { auditJson, writeAuditEntry } from "@/server/services/audit";

export async function expireUnpaidOrders(clock: Clock = systemClock) {
  const now = clock.now();
  const candidates = await db.order.findMany({
    where: {
      fulfillmentStatus: "PENDING_PAYMENT",
      paymentStatus: { in: ["UNPAID", "FAILED"] },
      paymentDeadline: { lte: now },
    },
    select: { id: true },
    orderBy: { paymentDeadline: "asc" },
    take: 200,
  });
  const expiredOrderIds: string[] = [];

  for (const candidate of candidates) {
    const expired = await db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const order = await transaction.order.findUnique({
        where: { id: candidate.id },
        include: { lines: true },
      });
      if (
        !order ||
        order.fulfillmentStatus !== "PENDING_PAYMENT" ||
        !["UNPAID", "FAILED"].includes(order.paymentStatus) ||
        !order.paymentDeadline ||
        order.paymentDeadline > now
      ) return false;

      const lines = order.lines
        .filter((line): line is typeof line & { variantId: string } => line.variantId !== null)
        .sort((left, right) => left.variantId.localeCompare(right.variantId));
      for (const line of lines) {
        await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.variantId} FOR UPDATE`;
        const released = await transaction.productVariant.updateMany({
          where: { id: line.variantId, reserved: { gte: line.quantity } },
          data: { reserved: { decrement: line.quantity } },
        });
        if (released.count !== 1) throw new Error("Stock reservation mismatch while expiring unpaid order.");
        await transaction.stockMovement.create({
          data: {
            variantId: line.variantId,
            orderId: order.id,
            type: "RELEASE",
            quantity: -line.quantity,
            note: `Reservation released after payment deadline for ${order.orderNumber}`,
          },
        });
      }

      await transaction.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "CANCELLED" } });
      await transaction.orderTimelineEvent.create({
        data: {
          orderId: order.id,
          actorName: "System",
          action: "UNPAID_ORDER_EXPIRED",
          fromState: "PENDING_PAYMENT",
          toState: "CANCELLED",
          note: "Payment deadline passed; reserved stock was released.",
        },
      });
      await writeAuditEntry(transaction, {
        actorType: "SYSTEM",
        action: "UNPAID_ORDER_EXPIRED",
        entity: "Order",
        entityId: order.id,
        before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
        after: auditJson({ fulfillmentStatus: "CANCELLED", paymentStatus: order.paymentStatus }),
      });
      return true;
    });
    if (expired) expiredOrderIds.push(candidate.id);
  }

  return { expiredCount: expiredOrderIds.length, orderIds: expiredOrderIds };
}