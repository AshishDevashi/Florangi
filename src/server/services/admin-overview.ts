import "server-only";

import { db } from "@/server/db";
import { requireAdmin } from "@/server/auth/guards";
import { getEnvironment } from "@/server/env";
import { systemClock } from "@/server/domain/clock";
import { getEffectiveSetting } from "./settings";

type LowStockSize = { id: string; productId: string; productName: string; size: "XS" | "S" | "M"; available: number };

async function getStockOverview() {
  const setting = await getEffectiveSetting("low_stock_threshold");
  const value = setting?.value;
  const configured = value && typeof value === "object" && !Array.isArray(value) && "availableUnits" in value ? value.availableUnits : undefined;
  const threshold = typeof configured === "number" && Number.isSafeInteger(configured) && configured >= 0 ? configured : 2;
  // Compute availability in PostgreSQL rather than loading every variant into the page.
  const [counts, sizes] = await Promise.all([
    db.$queryRaw<Array<{ lowStock: number; outOfStock: number }>>`
      SELECT COUNT(*)::int AS "lowStock",
        (COUNT(*) FILTER (WHERE v."onHand" = v."reserved"))::int AS "outOfStock"
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
      WHERE p."status" <> 'ARCHIVED' AND v."onHand" - v."reserved" <= ${threshold}
    `,
    db.$queryRaw<LowStockSize[]>`
      SELECT v."id", p."id" AS "productId", p."name" AS "productName", v."size",
        v."onHand" - v."reserved" AS "available"
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
      WHERE p."status" <> 'ARCHIVED' AND v."onHand" - v."reserved" <= ${threshold}
      ORDER BY "available" ASC, p."name" ASC, v."size" ASC LIMIT 5
    `,
  ]);
  return { threshold, lowStock: counts[0]?.lowStock ?? 0, outOfStock: counts[0]?.outOfStock ?? 0, sizes };
}

export async function getAdminOverview() {
  await requireAdmin();
  const now = systemClock.now();
  // Match the email worker's UTC quota window; the UI formats its reset in IST.
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const resetsAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const [awaitingApproval, inProduction, readyToShip, openReplacements, approvalOrders, stock, sentToday, emailGroups] = await Promise.all([
    db.order.count({ where: { fulfillmentStatus: "PENDING_APPROVAL" } }),
    db.order.count({ where: { fulfillmentStatus: "IN_PRODUCTION" } }),
    db.order.count({ where: { fulfillmentStatus: "READY_TO_SHIP" } }),
    db.replacementRequest.count({ where: { status: "OPEN" } }),
    db.order.findMany({ where: { fulfillmentStatus: "PENDING_APPROVAL" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5, select: { id: true, orderNumber: true, firstName: true, lastName: true, totalPaise: true, paymentMethod: true, createdAt: true } }),
    getStockOverview(),
    db.emailJob.count({ where: { status: "SENT", sentAt: { gte: dayStart, lt: resetsAt } } }),
    db.emailJob.groupBy({ by: ["status"], where: { status: { in: ["QUEUED", "DEFERRED", "PROCESSING", "FAILED"] } }, _count: { _all: true } }),
  ]);
  const emailCounts = new Map(emailGroups.map((group) => [group.status, group._count._all]));
  return {
    updatedAt: now,
    counts: { awaitingApproval, inProduction, readyToShip, openReplacements },
    approvalOrders: approvalOrders.map((order) => ({ ...order, waitingHours: Math.max(0, Math.floor((now.getTime() - order.createdAt.getTime()) / 3_600_000)) })),
    stock,
    email: { sentToday, quota: getEnvironment().EMAIL_DAILY_QUOTA, resetsAt, queued: emailCounts.get("QUEUED") ?? 0, deferred: emailCounts.get("DEFERRED") ?? 0, processing: emailCounts.get("PROCESSING") ?? 0, failed: emailCounts.get("FAILED") ?? 0 },
  };
}
