import "server-only";

import { expireUnpaidOrders } from "@/server/payments/expiry";
import { processEmailJobs } from "@/server/email/worker";
import { db } from "@/server/db";

async function runWorker() {
  console.info("florangi.worker_started");
  while (true) {
    try {
      const [expiry, email] = await Promise.all([expireUnpaidOrders(), processEmailJobs()]);
      if (expiry.expiredCount > 0) console.info("orders.expired", { count: expiry.expiredCount });
      if (email.processed > 0) console.info("email.jobs_processed", { count: email.processed });
    } catch (error) {
      console.error("florangi.worker_iteration_failed", { errorName: error instanceof Error ? error.name : "WorkerError" });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

runWorker().catch(async (error: unknown) => {
  console.error("florangi.worker_stopped", { errorName: error instanceof Error ? error.name : "WorkerError" });
  await db.$disconnect();
  process.exitCode = 1;
});