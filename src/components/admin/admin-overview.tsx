import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, ArrowUpRight, CheckCircle2, ClipboardCheck, Clock3, FolderOpen, Mail, Package, PackageCheck, RotateCcw, Scissors, Settings2, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import type { getAdminOverview } from "@/server/services/admin-overview";

type Props = { data: Awaited<ReturnType<typeof getAdminOverview>> };
const approvalHref = "/admin/orders?status=PENDING_APPROVAL";

export function AdminOverview({ data }: Props) {
  const { counts, stock, email, approvalOrders } = data;
  const quotaPercent = Math.round(email.sentToday * 100 / email.quota);
  const quotaHigh = email.sentToday >= email.quota * 0.8;
  const metrics = [
    { label: "Awaiting approval", count: counts.awaitingApproval, href: approvalHref, icon: ClipboardCheck },
    { label: "In production", count: counts.inProduction, href: "/admin/orders?status=IN_PRODUCTION", icon: Scissors },
    { label: "Ready to ship", count: counts.readyToShip, href: "/admin/orders?status=READY_TO_SHIP", icon: Truck },
    { label: "Open replacements", count: counts.openReplacements, href: "/admin/replacements", icon: RotateCcw },
    { label: "Low-stock sizes", count: stock.lowStock, href: "/admin/inventory", icon: Package },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-5 py-5 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Owner workspace</p><h1 className="mt-1 font-serif text-3xl sm:text-4xl">Overview</h1><p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted"><Clock3 aria-hidden="true" className="mt-0.5 shrink-0" size={13} />Updated {formatIndiaDateTime(data.updatedAt)}</p></div><div className="flex flex-wrap gap-2"><RefreshButton label="Refresh overview" /><Link className={buttonStyles({ variant: "primary" })} href="/admin/orders">View orders<ArrowRight aria-hidden="true" size={16} /></Link></div></header>
      <section aria-label="Store activity" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map(({ label, count, href, icon: Icon }, index) => <Link aria-label={`${label}: ${count}`} className={`group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${index === metrics.length - 1 ? "col-span-2 sm:col-span-1" : ""}`} href={href} key={label} prefetch={false}><div className="flex items-center justify-between gap-2"><Icon aria-hidden="true" className="text-accent" size={18} /><ArrowUpRight aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={14} /></div><p className="mt-3 text-2xl font-semibold tabular-nums">{count.toLocaleString("en-IN")}</p><h2 className="mt-1 font-sans text-xs font-medium leading-5 text-muted">{label}</h2></Link>)}
      </section>
      {(email.failed > 0 || quotaHigh) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-xs leading-5 text-warning"><p className="flex items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /><span>{email.failed > 0 ? `${email.failed} failed ${email.failed === 1 ? "email needs" : "emails need"} review.` : email.sentToday >= email.quota ? "The configured daily email quota has been reached." : "Daily email quota is nearing its limit."}{quotaHigh && email.failed > 0 ? " Daily email quota is also at or above 80%." : ""}</span></p><a className="inline-flex min-h-8 items-center gap-1.5 font-semibold underline" href="#email-status">Review email status<ArrowRight aria-hidden="true" size={13} /></a></div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <OverviewPanel action={<Link className={buttonStyles({ variant: "link", size: "sm" })} href={approvalHref}>View queue<ArrowRight aria-hidden="true" size={14} /></Link>} icon={ClipboardCheck} title="Approval queue">
            <p className="border-b border-border px-4 py-3 text-xs leading-5 text-muted sm:px-5">Up to 5 requests, oldest first. Review the order before approving or rejecting it.</p>
            {approvalOrders.length ? <ul className="divide-y divide-border">{approvalOrders.map((order) => <li key={order.id}><Link aria-label={`Review ${order.orderNumber}`} className="block space-y-2 px-4 py-4 transition-colors hover:bg-surface-muted sm:px-5" href={`/admin/orders/${order.id}`} prefetch={false}><div className="flex flex-wrap items-start justify-between gap-2"><p className="break-all text-sm font-semibold text-accent">{order.orderNumber}</p><p className="text-sm font-semibold tabular-nums">{formatPaise(order.totalPaise)}</p></div><div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words text-xs text-muted">{order.firstName} {order.lastName} · {order.paymentMethod === "COD" ? "Cash on delivery" : "Online"}</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${order.waitingHours >= 24 ? "bg-warning-bg text-warning" : "bg-surface-muted text-muted"}`}>{order.waitingHours >= 24 && <AlertCircle aria-hidden="true" size={12} />}Waiting {order.waitingHours < 1 ? "less than 1 hour" : `${order.waitingHours} ${order.waitingHours === 1 ? "hour" : "hours"}`}</span></div><p className="text-[10px] leading-5 text-muted">Placed {formatIndiaDateTime(order.createdAt)}</p></Link></li>)}</ul> : <EmptyPanel icon={CheckCircle2} title="No orders awaiting approval" description="New orders ready for your review will appear here." />}
          </OverviewPanel>
          <OverviewPanel action={<Link className={buttonStyles({ variant: "link", size: "sm" })} href="/admin/inventory">View inventory<ArrowRight aria-hidden="true" size={14} /></Link>} icon={Package} title="Stock to review">
            <div className="border-b border-border px-4 py-3 text-xs leading-5 text-muted sm:px-5"><p><span className="font-semibold text-foreground">{stock.lowStock}</span> low-stock sizes · <span className="font-semibold text-foreground">{stock.outOfStock}</span> with no availability</p><p className="mt-1">Available units at or below {stock.threshold}. Archived products are excluded.</p></div>
            {stock.sizes.length ? <><div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_2.25rem_3.5rem] gap-3 bg-surface-muted px-4 py-2 text-[10px] font-medium text-muted sm:px-5"><span>Product</span><span>Size</span><span className="text-right">Available</span></div><ul className="divide-y divide-border">{stock.sizes.map((size) => <li className="grid grid-cols-[minmax(0,1fr)_2.25rem_3.5rem] items-center gap-3 px-4 py-4 sm:px-5" key={size.id}><p className="min-w-0 break-words text-sm font-medium">{size.productName}</p><span aria-label={`Size ${size.size}`} className="text-xs font-semibold">{size.size}</span><span aria-label={`${size.available} available`} className={`text-right text-base font-semibold tabular-nums ${size.available === 0 ? "text-danger" : "text-accent"}`}>{size.available}</span></li>)}</ul><p className="border-t border-border px-4 py-3 text-[10px] leading-5 text-muted sm:px-5">Showing up to 5 sizes with the lowest availability, including draft and hidden products.</p></> : <EmptyPanel icon={PackageCheck} title="No low-stock sizes" description={`No non-archived sizes have ${stock.threshold} or fewer available units.`} />}
          </OverviewPanel>
        </div>
        <div className="min-w-0 space-y-5">
          <OverviewPanel icon={Mail} id="email-status" title="Transactional email">
            <div className="space-y-4 p-4 sm:p-5">
              <div><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-sans text-xs font-medium text-muted">Configured daily quota</h3><span className="text-sm font-semibold tabular-nums">{quotaPercent}%</span></div><p className="mt-2 text-xl font-semibold tabular-nums">{email.sentToday.toLocaleString("en-IN")} <span className="text-xs font-normal text-muted">/ {email.quota.toLocaleString("en-IN")} sent</span></p><progress aria-label="Configured daily email quota used" className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-surface-hover [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-hover [&::-webkit-progress-value]:bg-accent" max={email.quota} value={Math.min(email.sentToday, email.quota)} /><p className="mt-2 text-[10px] leading-5 text-muted">Quota resets {formatIndiaDateTime(email.resetsAt)}</p></div>
              {quotaHigh && <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs leading-5 text-warning">{email.sentToday >= email.quota ? "The configured daily quota has been reached. Emails beyond this quota wait until capacity is available." : "At least 80% of the configured daily quota has been used."}</p>}
              <dl className="grid grid-cols-2 gap-3">{[{ label: "Queued", value: email.queued }, { label: "Deferred", value: email.deferred }, { label: "Processing", value: email.processing }, { label: "Failed", value: email.failed }].map(({ label, value }) => <div className={`rounded-lg border p-3 ${label === "Failed" && value > 0 ? "border-danger-border bg-danger-bg" : "border-border bg-surface-muted"}`} key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
              <p className="text-xs leading-5 text-muted">Review delivery details and retry failed emails from the relevant order.</p><Link className={buttonStyles({ variant: "secondary", className: "w-full" })} href="/admin/orders">Open orders<ArrowRight aria-hidden="true" size={15} /></Link>
            </div>
          </OverviewPanel>
          <OverviewPanel icon={Settings2} title="Quick access">
            <nav aria-label="Store management"><ul className="divide-y divide-border">{[
              { href: "/admin/products", label: "Products", description: "Dresses, images and visibility", icon: ShoppingBag },
              { href: "/admin/categories", label: "Categories", description: "Collections and storefront structure", icon: FolderOpen },
              { href: "/admin/inventory", label: "Inventory", description: "Sizes, reservations and stock", icon: Package },
              { href: "/admin/settings", label: "Settings", description: "Shipping, measurements and policies", icon: Settings2 },
            ].map(({ href, label, description, icon: Icon }) => <li key={href}><Link className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-muted sm:px-5" href={href}><Icon aria-hidden="true" className="shrink-0 text-accent" size={17} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div><ArrowRight aria-hidden="true" className="shrink-0 text-muted" size={15} /></Link></li>)}</ul></nav>
          </OverviewPanel>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted">This overview is a snapshot. Refresh to load current queues, reservations and email counts.</p>
    </main>
  );
}

function OverviewPanel({ title, icon: Icon, action, children, id }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode; id?: string }) {
  return <section className="min-w-0 scroll-mt-5 overflow-hidden rounded-xl border border-border bg-surface" id={id}><header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-2.5"><Icon aria-hidden="true" className="shrink-0 text-accent" size={18} /><h2 className="font-serif text-2xl">{title}</h2></div>{action}</header>{children}</section>;
}
function EmptyPanel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="px-5 py-8 text-center"><Icon aria-hidden="true" className="mx-auto text-muted" size={28} /><h3 className="mt-3 font-sans text-sm font-medium">{title}</h3><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted">{description}</p></div>;
}
