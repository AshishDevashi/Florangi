import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowUpRight, Clock3, CreditCard, FileText, Mail, MapPin, PackageCheck, ShoppingBag, Truck, UserRound, type LucideIcon } from "lucide-react";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import type { getAdminOrder } from "@/server/services/admin-orders";
import { OrderActions } from "./order-actions";
import { EmailJobList } from "./email-job-list";
import { OrderStatusBadge } from "./order-status";

type AdminOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function AdminOrderDetail({ order }: { order: AdminOrder }) {
  const address = order.addressSnapshot as { fullName?: string; phone?: string; line1?: string; line2?: string | null; landmark?: string | null; city?: string; state?: string; pinCode?: string };
  const quantity = order.lines.reduce((count, line) => count + line.quantity, 0);
  const readyCount = order.lines.filter((line) => line.isReady).length;
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-accent" href="/admin/orders"><ArrowLeft aria-hidden="true" size={16} />Back to orders</Link>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Order details</p><h1 className="mt-1 break-all font-serif text-3xl sm:text-4xl">{order.orderNumber}</h1><p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted"><Clock3 aria-hidden="true" className="mt-0.5 shrink-0" size={13} />Placed {formatIndiaDateTime(order.createdAt)}</p></div>
        <div className="space-y-2 sm:text-right"><p className="text-2xl font-semibold tabular-nums">{formatPaise(order.totalPaise)}</p><div className="flex flex-wrap gap-2 sm:justify-end"><OrderStatusBadge value={order.fulfillmentStatus} /><OrderStatusBadge kind="payment" value={order.paymentStatus} /></div></div>
      </header>
      {order.paymentStatus === "REFUND_REQUIRED" && <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger-border bg-danger-bg p-4 text-sm text-danger"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} /><p>This order requires a refund. <a className="font-semibold underline" href="#order-actions">Review payment actions</a> to request or verify the full refund.</p></div>}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <DetailSection icon={ShoppingBag} title={`Order items (${quantity})`}>
            <div className="mb-4 flex items-center gap-2 text-xs text-muted"><PackageCheck aria-hidden="true" size={15} />{readyCount} of {order.lines.length} lines ready</div>
            <ul className="divide-y divide-border">
              {order.lines.map((line) => {
                const measurements = line.measurementsSnapshot && typeof line.measurementsSnapshot === "object" && !Array.isArray(line.measurementsSnapshot) ? line.measurementsSnapshot as Record<string, unknown> : null;
                return <li className="py-4 first:pt-0 last:pb-0" key={line.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-sans text-sm font-medium">{line.productName}</h3><p className="mt-1 text-xs text-muted">{line.productType === "CUSTOM_DRESS" ? "Made to measure" : `Designer dress · Size ${line.size}`} · Qty {line.quantity}</p></div><p className="text-sm font-semibold tabular-nums">{formatPaise(line.unitPricePaise * line.quantity)}</p></div>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${line.isReady ? "bg-success-bg text-success" : "bg-surface-muted text-muted"}`}>{line.isReady ? "Ready" : "Not ready"}</span>
                  {measurements && <details className="mt-3 rounded-lg border border-border"><summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-medium text-accent">Order measurements</summary><dl className="grid grid-cols-1 gap-3 border-t border-border p-3 text-xs sm:grid-cols-2">{Object.entries(measurements).map(([key, value]) => <div className="flex min-w-0 justify-between gap-3" key={key}><dt className="text-muted">{humanize(key)}</dt><dd className="min-w-0 break-words text-right">{String(value)}</dd></div>)}</dl></details>}
                  {line.qcNotes && <p className="mt-3 rounded-lg bg-surface-muted p-3 text-xs leading-5 text-muted"><span className="font-semibold">QC note:</span> {line.qcNotes}</p>}
                </li>;
              })}
            </ul>
          </DetailSection>
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            fulfillmentStatus={order.fulfillmentStatus}
            paymentStatus={order.paymentStatus}
            paymentMethod={order.paymentMethod}
            totalPaise={order.totalPaise}
            createdAt={order.createdAt.toISOString()}
            confirmedAt={order.confirmedAt?.toISOString() ?? null}
            deliveredAt={order.shipment?.deliveredAt?.toISOString() ?? null}
            hasShipment={Boolean(order.shipment)}
            lines={order.lines.map((line) => ({
              id: line.id,
              productName: line.productName,
              productType: line.productType,
              isReady: line.isReady,
              qcCompletedAt: line.qcCompletedAt?.toISOString() ?? null,
              measurements: line.measurementVersions.at(-1)?.values && typeof line.measurementVersions.at(-1)?.values === "object" && !Array.isArray(line.measurementVersions.at(-1)?.values)
                ? line.measurementVersions.at(-1)!.values as Record<string, unknown>
                : null,
            }))}
          />
          <DetailSection icon={Clock3} title="Order activity">
            {order.timeline.length ? <ol className="space-y-4">{order.timeline.map((event) => <li className="relative border-l border-border-strong pl-4" key={event.id}><span aria-hidden="true" className="absolute top-1 -left-1 size-2 rounded-full bg-rose" /><p className="text-sm font-medium">{humanize(event.action.toLowerCase())}</p><p className="mt-1 text-xs leading-5 text-muted">{formatIndiaDateTime(event.createdAt)} · {event.actorName}</p>{event.note && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted">{event.note}</p>}</li>)}</ol> : <p className="text-sm text-muted">No activity recorded yet.</p>}
          </DetailSection>
          <EmailJobList jobs={order.emailJobs} key={order.emailJobs.map((job) => `${job.id}:${job.updatedAt.getTime()}`).join("|")} />
        </div>
        <aside aria-label="Order information" className="min-w-0 space-y-5">
          <DetailSection icon={CreditCard} title="Payment summary">
            <p className="mb-4 text-sm font-medium">{order.paymentMethod === "COD" ? "Cash on delivery" : "Online payment"}</p>
            <dl className="space-y-3 text-sm"><Summary label="Subtotal" amount={order.subtotalPaise} /><Summary label="Shipping" amount={order.shippingFeePaise + order.codSurchargePaise} /><Summary label="Total" amount={order.totalPaise} strong /></dl>
            <div className="mt-4"><OrderStatusBadge kind="payment" value={order.paymentStatus} /></div>
          </DetailSection>
          <DetailSection icon={UserRound} title="Customer">
            <p className="break-words text-sm font-medium">{order.firstName} {order.lastName}</p><a className="mt-3 flex min-w-0 items-start gap-2 text-xs leading-5 text-accent hover:underline" href={`mailto:${order.email}`}><Mail aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span className="min-w-0 break-all">{order.email}</span></a><a className="mt-2 inline-block min-h-8 text-sm text-accent hover:underline" href={`tel:${order.phoneNumber}`}>{order.phoneNumber}</a>
          </DetailSection>
          <DetailSection icon={MapPin} title="Delivery address">
            <address className="break-words text-sm not-italic leading-6 text-muted">{address.fullName && <><span className="font-medium text-foreground">{address.fullName}</span><br /></>}{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.landmark && <>{address.landmark}<br /></>}{address.city}, {address.state}<br />{address.pinCode}{address.phone && <><br />{address.phone}</>}</address>
          </DetailSection>
          <DetailSection icon={Truck} title="Shipment">
            {order.shipment ? <><p className="text-sm font-medium">{order.shipment.courierName}</p><dl className="mt-3 space-y-3 text-xs"><div><dt className="text-muted">AWB number</dt><dd className="mt-1 break-all font-medium">{order.shipment.awbNumber}</dd></div><div><dt className="text-muted">Shipped</dt><dd className="mt-1 leading-5">{formatIndiaDateTime(order.shipment.shippedAt)}</dd></div>{order.shipment.deliveredAt && <div><dt className="text-muted">Delivered</dt><dd className="mt-1 leading-5">{formatIndiaDateTime(order.shipment.deliveredAt)}</dd></div>}</dl>{order.shipment.trackingUrl && <a className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-accent hover:underline" href={order.shipment.trackingUrl} rel="noopener noreferrer" target="_blank">Track shipment<ArrowUpRight aria-hidden="true" size={14} /></a>}</> : <p className="text-sm leading-6 text-muted">No shipment recorded yet.</p>}
          </DetailSection>
          <DetailSection icon={FileText} title="Internal notes">
            <p className="mb-3 text-xs text-muted">Visible to admins only.</p>{order.notes.length ? <ul className="space-y-4">{order.notes.map((note) => <li className="border-l-2 border-border-strong pl-3" key={note.id}><p className="whitespace-pre-wrap break-words text-sm leading-6">{note.body}</p><p className="mt-2 text-xs leading-5 text-muted">{note.author?.name ?? note.author?.email ?? "Admin"} · {formatIndiaDateTime(note.createdAt)}</p></li>)}</ul> : <p className="text-sm text-muted">No internal notes yet.</p>}
          </DetailSection>
        </aside>
      </div>
    </main>
  );
}

function DetailSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-border bg-surface"><header className="flex items-center gap-2.5 border-b border-border px-4 py-4 sm:px-5"><Icon aria-hidden="true" className="shrink-0 text-accent" size={18} /><h2 className="font-serif text-2xl">{title}</h2></header><div className="p-4 sm:p-5">{children}</div></section>;
}
function Summary({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-3 ${strong ? "border-t border-border pt-3 font-semibold" : "text-muted"}`}><dt>{label}</dt><dd className="tabular-nums">{formatPaise(amount)}</dd></div>;
}