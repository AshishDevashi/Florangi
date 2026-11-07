import "server-only";

import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";
import { systemClock, type Clock } from "@/server/domain/clock";
import { createCodConfirmationToken, parseCodConfirmationToken } from "@/server/domain/cod-confirmation";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { enqueueEmailJob } from "@/server/email/outbox";
import type { Prisma } from "@prisma/client";
import { issueGuestOrderAccessToken } from "@/server/guest-order-access";

export async function enqueueCodConfirmation(
  transaction: Prisma.TransactionClient,
  input: { orderId: string; orderNumber: string; customerEmail: string; guestAccessToken?: string; clock?: Clock; reminder?: boolean },
): Promise<void> {
  const environment = getEnvironment();
  const clock = input.clock ?? systemClock;
  const reminder = input.reminder === true;
  const eventKey = `cod-confirmation-${reminder ? "reminder" : "initial"}:${input.orderId}`;
  const template = reminder ? "cod-confirmation-reminder" : "cod-confirmation";
  const existingJob = await transaction.emailJob.findFirst({
    where: { eventKey, template, recipient: input.customerEmail.toLowerCase() },
    select: { id: true },
  });
  if (existingJob) return;
  const expiresAt = new Date(clock.now().getTime() + 48 * 60 * 60 * 1000);
  const token = createCodConfirmationToken(input.orderId, expiresAt, environment.SESSION_SECRET);
  const guestAccessToken = input.guestAccessToken ?? await issueGuestOrderAccessToken(transaction, input.orderId);
  await transaction.orderConfirmationToken.create({
    data: {
      orderId: input.orderId,
      tokenHash: parseCodConfirmationToken(token, environment.SESSION_SECRET, clock.now())!.tokenHash,
      expiresAt,
    },
  });
  await enqueueEmailJob(transaction, {
    eventKey,
    template,
    recipient: input.customerEmail,
    payload: {
      orderId: input.orderId,
      subject: `${reminder ? "Reminder: " : ""}confirm your custom order ${input.orderNumber}`,
      text: `${reminder ? "This is your 24-hour reminder. " : ""}Confirm that you intend to accept this made-to-measure Cash on Delivery order. Opening this link does not confirm the order; submit the form on the page.`,
      url: `${environment.APP_URL}/orders/${input.orderId}/confirm-cod#token=${encodeURIComponent(token)}&access=${encodeURIComponent(guestAccessToken)}`,
    },
  });
}

export async function enqueueCodConfirmationReminders(clock: Clock = systemClock) {
  const now = clock.now();
  const dueBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const candidates = await db.order.findMany({
    where: {
      paymentMethod: "COD",
      paymentStatus: "COD_PENDING",
      confirmedAt: null,
      fulfillmentStatus: { in: ["PENDING_APPROVAL", "APPROVED"] },
      createdAt: { lte: dueBefore },
      lines: { some: { productType: "CUSTOM_DRESS" } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  let queued = 0;
  for (const candidate of candidates) {
    const didQueue = await db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const order = await transaction.order.findUnique({
        where: { id: candidate.id },
        include: { lines: { select: { productType: true } } },
      });
      if (
        !order ||
        order.paymentMethod !== "COD" ||
        order.paymentStatus !== "COD_PENDING" ||
        order.confirmedAt ||
        !["PENDING_APPROVAL", "APPROVED"].includes(order.fulfillmentStatus) ||
        order.createdAt > dueBefore ||
        !order.lines.some((line) => line.productType === "CUSTOM_DRESS")
      ) return false;
      const before = await transaction.emailJob.count({
        where: { eventKey: `cod-confirmation-reminder:${order.id}`, template: "cod-confirmation-reminder", recipient: order.email.toLowerCase() },
      });
      if (before > 0) return false;
      await enqueueCodConfirmation(transaction, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        guestAccessToken: await issueGuestOrderAccessToken(transaction, order.id),
        clock,
        reminder: true,
      });
      return true;
    });
    if (didQueue) queued += 1;
  }
  return queued;
}

export async function confirmCustomCodOrder(orderId: string, token: string, clock: Clock = systemClock) {
  const environment = getEnvironment();
  const now = clock.now();
  const parsed = parseCodConfirmationToken(token, environment.SESSION_SECRET, now);
  if (!parsed || parsed.orderId !== orderId) throw new RangeError("Confirmation link is invalid or expired.");

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await transaction.order.findFirst({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) throw new RangeError("Order not found.");
    if (order.paymentMethod !== "COD" || !order.lines.some((line) => line.productType === "CUSTOM_DRESS")) {
      throw new RangeError("This order does not require custom COD confirmation.");
    }
    if (order.fulfillmentStatus !== "PENDING_APPROVAL" && order.fulfillmentStatus !== "APPROVED") {
      throw new RangeError("This order is no longer eligible for customer confirmation.");
    }
    const confirmationToken = await transaction.orderConfirmationToken.findUnique({ where: { tokenHash: parsed.tokenHash } });
    if (!confirmationToken || confirmationToken.orderId !== order.id || confirmationToken.expiresAt <= now) {
      throw new RangeError("Confirmation link is invalid or expired.");
    }
    if (order.confirmedAt) return { order, duplicate: true };
    const claimed = await transaction.orderConfirmationToken.updateMany({
      where: { id: confirmationToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new RangeError("Confirmation link has already been used.");

    const updated = await transaction.order.update({
      where: { id: order.id },
      data: { confirmedAt: now, confirmationMethod: "EMAIL_LINK", confirmationNote: "Confirmed by customer through a signed email link." },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorName: `${order.firstName} ${order.lastName}`,
        action: "CUSTOM_ORDER_CONFIRMED",
        fromState: order.fulfillmentStatus,
        toState: order.fulfillmentStatus,
        note: "Customer confirmed the custom COD order. This does not constitute admin approval.",
      },
    });
    await writeAuditEntry(transaction, {
      actorType: "USER",
      action: "CUSTOM_ORDER_CONFIRMED",
      entity: "Order",
      entityId: order.id,
      before: auditJson({ confirmedAt: order.confirmedAt, confirmationMethod: order.confirmationMethod }),
      after: auditJson({ confirmedAt: updated.confirmedAt, confirmationMethod: updated.confirmationMethod }),
    });
    return { order: updated, duplicate: false };
  });
}