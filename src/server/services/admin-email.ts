import "server-only";

import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { systemClock } from "@/server/domain/clock";
import { auditJson, writeAuditEntry } from "@/server/services/audit";

export async function retryFailedEmailJob(jobId: string) {
  const admin = await requireAdmin();
  return db.$transaction(async (transaction) => {
    const job = await transaction.emailJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (job.status !== "FAILED") throw new RangeError("Only failed email jobs can be retried.");
    const updated = await transaction.emailJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        attemptCount: 0,
        availableAt: systemClock.now(),
        lastAttemptAt: null,
        sentAt: null,
        errorDetail: null,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "EMAIL_JOB_RETRY_QUEUED",
      entity: "EmailJob",
      entityId: job.id,
      before: auditJson({ status: job.status, attemptCount: job.attemptCount }),
      after: auditJson({ status: updated.status, attemptCount: updated.attemptCount }),
    });
    return updated;
  });
}