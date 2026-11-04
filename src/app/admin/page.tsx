import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/server/db";
import { getEffectiveSetting } from "@/server/services/settings";
import { getEnvironment } from "@/server/env";
import { systemClock } from "@/server/domain/clock";

export const instant = false;

export default async function AdminDashboard() {
  await connection();
  const [awaitingApproval, inProduction, readyToShip, openReplacements, variants, thresholdSetting, sentToday, queuedEmails, failedEmails] = await Promise.all([
    db.order.count({ where: { fulfillmentStatus: "PENDING_APPROVAL" } }),
    db.order.count({ where: { fulfillmentStatus: "IN_PRODUCTION" } }),
    db.order.count({ where: { fulfillmentStatus: "READY_TO_SHIP" } }),
    db.replacementRequest.count({ where: { status: "OPEN" } }),
    db.productVariant.findMany({
      where: { product: { status: { not: "ARCHIVED" } } },
      select: { id: true, onHand: true, reserved: true },
    }),
    getEffectiveSetting("low_stock_threshold"),
    db.emailJob.count({ where: { status: "SENT", sentAt: { gte: new Date(Date.UTC(systemClock.now().getUTCFullYear(), systemClock.now().getUTCMonth(), systemClock.now().getUTCDate())) } } }),
    db.emailJob.count({ where: { status: { in: ["QUEUED", "DEFERRED", "PROCESSING"] } } }),
    db.emailJob.count({ where: { status: "FAILED" } }),
  ]);
  const emailQuota = getEnvironment().EMAIL_DAILY_QUOTA;
  const emailQuotaPercent = Math.min(100, Math.round(sentToday * 100 / emailQuota));
  const thresholdValue = thresholdSetting?.value;
  const lowStockThreshold = thresholdValue && typeof thresholdValue === "object" && !Array.isArray(thresholdValue) && "availableUnits" in thresholdValue && typeof thresholdValue.availableUnits === "number"
    ? thresholdValue.availableUnits
    : 2;
  const lowStock = variants.filter((variant) => variant.onHand - variant.reserved <= lowStockThreshold).length;
  const counts = [
    { label: "Awaiting approval", value: awaitingApproval, href: "/admin/orders?status=PENDING_APPROVAL" },
    { label: "In production", value: inProduction, href: "/admin/orders?status=IN_PRODUCTION" },
    { label: "Ready to ship", value: readyToShip, href: "/admin/orders?status=READY_TO_SHIP" },
    { label: "Open replacements", value: openReplacements, href: "/admin/replacements" },
    { label: "Low-stock sizes", value: lowStock, href: "/admin/inventory" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Owner workspace</p>
      <h1 className="mt-2 font-serif text-4xl">Overview</h1>
      <section aria-label="Store activity" className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {counts.map((count) => (
          <Link className="border border-stone-200 bg-white p-4 hover:border-[var(--accent)]" href={count.href} key={count.label}>
            <p className="text-sm text-[var(--muted)]">{count.label}</p>
            <p className="mt-3 font-serif text-3xl">{count.value}</p>
          </Link>
        ))}
      </section>
      <section className="mt-8 border-t border-stone-200 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-medium">Transactional email</h2>
          <p className="text-xs text-[var(--muted)]">Daily quota: {sentToday} / {emailQuota} · {emailQuotaPercent}%</p>
        </div>
        {(emailQuotaPercent >= 80 || failedEmails > 0) && <p className="mt-3 text-sm text-amber-900">{emailQuotaPercent >= 80 ? "Daily email quota is at least 80%. " : ""}{failedEmails > 0 ? `${failedEmails} failed email job(s) need review.` : ""}</p>}
        <p className="mt-2 text-sm text-[var(--muted)]">{queuedEmails} queued or deferred · {failedEmails} failed</p>
      </section>
      <section className="mt-10 border-t border-stone-200 py-6">
        <h2 className="font-medium">Catalog</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="border border-stone-300 px-4 py-2 text-sm hover:border-[var(--accent)]" href="/admin/categories">Manage categories</Link>
          <Link className="border border-stone-300 px-4 py-2 text-sm hover:border-[var(--accent)]" href="/admin/products">Manage products</Link>
          <Link className="border border-stone-300 px-4 py-2 text-sm hover:border-[var(--accent)]" href="/admin/inventory">Update inventory</Link>
        </div>
      </section>
    </main>
  );
}