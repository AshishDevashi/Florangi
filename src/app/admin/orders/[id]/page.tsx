import Link from "next/link";
import { notFound } from "next/navigation";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import { getAdminOrder } from "@/server/services/admin-orders";
import { OrderActions } from "@/components/admin/order-actions";
import { EmailJobList } from "@/components/admin/email-job-list";

export const instant = false;

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) notFound();
  const address = order.addressSnapshot as { fullName?: string; phone?: string; line1?: string; line2?: string | null; landmark?: string | null; city?: string; state?: string; pinCode?: string };
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <Link className="text-sm underline" href="/admin/orders">Back to orders</Link>
      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{order.fulfillmentStatus.replaceAll("_", " ")}</p><h1 className="mt-2 font-serif text-4xl">{order.orderNumber}</h1></div>
        <div className="text-right"><p className="text-xl font-medium">{formatPaise(order.totalPaise)}</p><p className="mt-1 text-xs text-[var(--muted)]">{order.paymentMethod} · {order.paymentStatus.replaceAll("_", " ")}</p></div>
      </header>
      <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <section>
            <h2 className="font-serif text-2xl">Items</h2>
            <ul className="mt-3 divide-y divide-stone-200">
              {order.lines.map((line) => {
                const measurements = line.measurementsSnapshot && typeof line.measurementsSnapshot === "object" && !Array.isArray(line.measurementsSnapshot)
                  ? line.measurementsSnapshot as Record<string, unknown>
                  : null;
                return (
                  <li className="py-4" key={line.id}>
                    <div className="flex flex-wrap justify-between gap-3 text-sm">
                      <div><h3 className="font-medium">{line.productName}</h3><p className="mt-1 text-xs text-[var(--muted)]">{line.productType === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size}`} · Qty {line.quantity} · {line.isReady ? "Ready" : "Not ready"}</p></div>
                      <p>{formatPaise(line.unitPricePaise * line.quantity)}</p>
                    </div>
                    {measurements && <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(measurements).filter(([key]) => key !== "fitNotes").map(([key, value]) => <div className="flex justify-between gap-3" key={key}><dt className="text-[var(--muted)]">{key}</dt><dd>{String(value)}</dd></div>)}</dl>}
                    {line.qcNotes && <p className="mt-2 text-xs text-[var(--muted)]">QC: {line.qcNotes}</p>}
                  </li>
                );
              })}
            </ul>
            <div className="ml-auto mt-3 max-w-xs space-y-2 border-t border-stone-200 pt-4 text-sm">
              <Summary label="Subtotal" amount={order.subtotalPaise} />
              <Summary label="Shipping" amount={order.shippingFeePaise + order.codSurchargePaise} />
              <Summary label="Total" amount={order.totalPaise} strong />
            </div>
          </section>
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
          <EmailJobList jobs={order.emailJobs} />
        </div>
        <aside className="space-y-7 border-t border-stone-200 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <section>
            <h2 className="font-medium">Customer</h2>
            <p className="mt-2 text-sm leading-6">{order.customer.name ?? "Customer"}<br /><a className="underline" href={`mailto:${order.customer.email}`}>{order.customer.email}</a><br />{order.customer.phone ?? "No profile phone"}</p>
          </section>
          <section>
            <h2 className="font-medium">Delivery address</h2>
            <address className="mt-2 text-sm not-italic leading-6 text-[var(--muted)]">{address.fullName}<br />{address.phone}<br />{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.landmark && <>{address.landmark}<br /></>}{address.city}, {address.state} {address.pinCode}</address>
          </section>
          {order.shipment && <section><h2 className="font-medium">Shipment</h2><p className="mt-2 text-sm leading-6">{order.shipment.courierName}<br />AWB {order.shipment.awbNumber}<br />Shipped {formatIndiaDateTime(order.shipment.shippedAt)}</p>{order.shipment.trackingUrl && <a className="mt-2 inline-block text-sm underline" href={order.shipment.trackingUrl} rel="noreferrer" target="_blank">Tracking link</a>}</section>}
          <section>
            <h2 className="font-medium">Timeline</h2>
            <ol className="mt-3 space-y-3">{order.timeline.map((event) => <li className="border-l border-stone-300 pl-3" key={event.id}><p className="text-xs font-medium">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[var(--muted)]">{formatIndiaDateTime(event.createdAt)} · {event.actorName}</p>{event.note && <p className="mt-1 text-xs text-[var(--muted)]">{event.note}</p>}</li>)}</ol>
          </section>
          <section>
            <h2 className="font-medium">Internal notes</h2>
            {order.notes.length === 0 ? <p className="mt-2 text-xs text-[var(--muted)]">No internal notes.</p> : <ul className="mt-3 space-y-3">{order.notes.map((note) => <li className="border-l-2 border-stone-300 pl-3 text-xs" key={note.id}><p>{note.body}</p><p className="mt-1 text-[var(--muted)]">{note.author?.name ?? note.author?.email ?? "Admin"} · {formatIndiaDateTime(note.createdAt)}</p></li>)}</ul>}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Summary({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "border-t border-stone-200 pt-2 font-semibold" : ""}`}><span>{label}</span><span>{formatPaise(amount)}</span></div>;
}