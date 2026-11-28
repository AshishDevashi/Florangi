import "server-only";

import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";
import { systemClock, type Clock } from "@/server/domain/clock";
import { decryptEmailPayload, encryptPayload } from "@/server/email/outbox";
import { getEmailProvider, renderEmailPayload } from "@/server/email/provider";
import { enqueueCodConfirmationReminders, refreshCodConfirmationPayload } from "@/server/services/cod-confirmation";

const MAX_ATTEMPTS = 5;
const MAX_BATCH_SIZE = 100;
const STALE_PROCESSING_MS = 5 * 60 * 1000;
let lastQuotaWarningDate = "";

function nextRetryTime(now: Date, attempts: number): Date {
  const delayMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMs);
}

function nextQuotaWindow(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export async function processEmailJobs(clock: Clock = systemClock) {
  const environment = getEnvironment();
  const now = clock.now();
  const remindersQueued = await enqueueCodConfirmationReminders(clock);
  if (remindersQueued > 0) console.info("cod.confirmation_reminders_queued", { count: remindersQueued });
  await db.emailJob.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
    data: { status: "QUEUED", availableAt: now },
  });

  const candidates = await db.emailJob.findMany({
    where: { status: { in: ["QUEUED", "DEFERRED"] }, availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: MAX_BATCH_SIZE,
  });
  let processed = 0;
  let sentToday = await db.emailJob.count({
    where: { status: "SENT", sentAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } },
  });
  const quotaDate = now.toISOString().slice(0, 10);
  if (sentToday >= environment.EMAIL_DAILY_QUOTA * 0.8 && lastQuotaWarningDate !== quotaDate) {
    console.warn("email.daily_quota_warning", { used: sentToday, quota: environment.EMAIL_DAILY_QUOTA });
    lastQuotaWarningDate = quotaDate;
  }

  for (const candidate of candidates) {
    if (sentToday >= environment.EMAIL_DAILY_QUOTA) {
      await db.emailJob.updateMany({
        where: { id: candidate.id, status: { in: ["QUEUED", "DEFERRED"] } },
        data: { status: "DEFERRED", availableAt: nextQuotaWindow(now) },
      });
      continue;
    }
    const job = await db.$transaction(async (transaction) => {
      if (candidate.template === "cod-confirmation-reminder") {
        const payload = decryptEmailPayload(candidate.payload);
        const orderId = typeof payload.orderId === "string" ? payload.orderId : "";
        if (!orderId) {
          await transaction.emailJob.update({ where: { id: candidate.id }, data: { status: "CANCELLED", errorDetail: "Reminder is missing its order reference." } });
          return null;
        }
        await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
        const order = await transaction.order.findUnique({
          where: { id: orderId },
          include: { lines: { select: { productType: true } } },
        });
        if (
          !order ||
          order.paymentMethod !== "COD" ||
          order.paymentStatus !== "COD_PENDING" ||
          order.confirmedAt ||
          !["PENDING_APPROVAL", "APPROVED"].includes(order.fulfillmentStatus) ||
          !order.lines.some((line) => line.productType === "CUSTOM_DRESS")
        ) {
          await transaction.emailJob.update({ where: { id: candidate.id }, data: { status: "CANCELLED" } });
          return null;
        }
      }
      const claimed = await transaction.emailJob.updateMany({
        where: { id: candidate.id, status: { in: ["QUEUED", "DEFERRED"] }, availableAt: { lte: now } },
        data: { status: "PROCESSING", lastAttemptAt: now, attemptCount: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;
      return transaction.emailJob.findUnique({ where: { id: candidate.id } });
    });
    if (!job) continue;
    processed += 1;

    try {
      let payload = decryptEmailPayload(job.payload);
      if (job.template === "cod-confirmation" || job.template === "cod-confirmation-reminder") {
        payload = await db.$transaction(async (transaction) => {
          const refreshed = await refreshCodConfirmationPayload(transaction, payload, clock.now());
          if (refreshed !== payload) {
            await transaction.emailJob.update({ where: { id: job.id }, data: { payload: encryptPayload(refreshed) } });
          }
          return refreshed;
        });
      }
      if (environment.EMAIL_DRIVER !== "dev") {
        const provider = getEmailProvider();
        await provider.send({ to: job.recipient, email: renderEmailPayload(payload) });
      } else {
        console.info("email.outbox_ready", { template: job.template });
      }
      await db.emailJob.update({ where: { id: job.id }, data: { status: "SENT", sentAt: clock.now(), errorDetail: null } });
      sentToday += 1;
    } catch (error) {
      const attempts = job.attemptCount;
      await db.emailJob.update({
        where: { id: job.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
          availableAt: attempts >= MAX_ATTEMPTS ? now : nextRetryTime(clock.now(), attempts),
          errorDetail: error instanceof Error ? error.name.slice(0, 80) : "EmailProviderError",
        },
      });
      console.error("email.delivery_failed", { template: job.template, attempt: attempts });
    }
  }

  return { processed, sentToday };
}