import Link from "next/link";
import { connection } from "next/server";
import { getGuestOrder } from "@/server/services/orders";
import { formatIndiaDateTime, systemClock } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { PaymentAction } from "@/components/checkout/payment-action";
import { getEnvironment } from "@/server/env";
import { ReplacementRequestForm } from "@/components/orders/replacement-request-form";
import { GuestOrderAccessGate } from "@/components/orders/guest-order-access-gate";

export const instant = false;

export default async function CustomerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const order = await getGuestOrder(id);
  if (!order) {
    return <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8"><GuestOrderAccessGate orderId={id} /></main>;
  }
  const environment = getEnvironment();

  const address = order.addressSnapshot as { line1?: string; line2?: string | null; landmark?: string | null; city?: string; state?: string; pinCode?: string };
  const settingsSnapshot = order.settingsSnapshot && typeof order.settingsSnapshot === "object" && !Array.isArray(order.settingsSnapshot)
    ? order.settingsSnapshot as Record<string, unknown>
    : {};
  const replacementWindowHours = typeof settingsSnapshot.replacementWindowHours === "number" ? settingsSnapshot.replacementWindowHours : 96;
  const deliveredAt = order.shipment?.deliveredAt ?? null;
  const replacementOpen = Boolean(deliveredAt && systemClock.now().getTime() < deliveredAt.getTime() + replacementWindowHours * 60 * 60 * 1000);
  const alreadyRequestedLineIds = new Set(order.replacementRequests.flatMap((request) => request.lines.map((line) => line.orderLineId)));
  const eligibleReplacementLines = order.lines
    .filter((line) => !alreadyRequestedLineIds.has(line.id))
    .map((line) => ({ id: line.id, productName: line.productName, productType: line.productType, size: line.size }));
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <Link className="font-serif text-2xl font-medium" href="/">Florangi</Link>
        <Link className="text-sm underline" href="/track-order">Track order</Link>
      </header>
      <section className="py-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Order details</p>
        <h1 className="mt-2 font-serif text-4xl">{order.orderNumber}</h1>
        <p className="mt-2 text-sm text-muted">Placed {formatIndiaDateTime(order.createdAt)} · {order.fulfillmentStatus.replaceAll("_", " ")}</p>
        <p className="mt-2 text-sm text-muted">Payment: {order.paymentStatus.replaceAll("_", " ")} · {order.paymentMethod === "COD" ? "Cash on Delivery" : "Online"}</p>
        {order.fulfillmentStatus === "PENDING_PAYMENT" && <p className="mt-4 border-l-2 border-warning-border bg-surface px-4 py-3 text-sm">Payment is pending. Your order remains reserved until it is paid or cancelled.</p>}
        {order.fulfillmentStatus === "PENDING_PAYMENT" && <PaymentAction orderId={order.id} mode={environment.PAYMENT_DRIVER} />}
        {order.fulfillmentStatus === "PENDING_PAYMENT" && <CancelOrderButton orderId={order.id} />}
        {order.paymentStatus === "REFUND_REQUIRED" && <p className="mt-4 text-sm">Refund in progress.</p>}

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_18rem]">
          <div>
            <h2 className="font-serif text-2xl">Items</h2>
            <ul className="mt-3 divide-y divide-border">
              {order.lines.map((line) => {
                const latestMeasurements = line.measurementVersions.at(-1)?.values ?? line.measurementsSnapshot;
                const measurements = latestMeasurements && typeof latestMeasurements === "object" && !Array.isArray(latestMeasurements)
                  ? latestMeasurements as Record<string, unknown>
                  : null;
                return (
                  <li className="py-4" key={line.id}>
                    <div className="flex justify-between gap-4 text-sm">
                      <div><h3 className="font-medium font-sans">{line.productName}</h3><p className="mt-1 text-xs text-muted">{line.productType === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size}`} · Qty {line.quantity}</p></div>
                      <p className="shrink-0">{formatPaise(line.unitPricePaise * line.quantity)}</p>
                    </div>
                    {measurements && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">{Object.entries(measurements).filter(([key]) => key !== "fitNotes").map(([key, value]) => <div className="flex justify-between gap-2" key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
              <SummaryRow label="Subtotal" value={order.subtotalPaise} />
              <SummaryRow label="Shipping" value={order.shippingFeePaise + order.codSurchargePaise} />
              <div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Total</span><span>{formatPaise(order.totalPaise)}</span></div>
            </div>
          </div>
          <aside className="space-y-7">
            <section>
              <h2 className="font-medium">Delivery address</h2>
              <address className="mt-2 text-sm not-italic leading-6 text-muted">
                {address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.landmark && <>{address.landmark}<br /></>}{address.city}, {address.state} {address.pinCode}
              </address>
            </section>
            {order.shipment && (
              <section>
                <h2 className="font-medium">Shipment</h2>
                <p className="mt-2 text-sm leading-6">{order.shipment.courierName}<br />AWB {order.shipment.awbNumber}</p>
                {order.shipment.trackingUrl && <a className="mt-2 inline-block text-sm underline" href={order.shipment.trackingUrl} rel="noreferrer" target="_blank">Track shipment</a>}
              </section>
            )}
          </aside>
        </div>

        <section className="mt-10 border-t border-border pt-6">
          <h2 className="font-serif text-2xl">Order timeline</h2>
          <ol className="mt-4 space-y-4">
            {order.timeline.map((event) => <li className="border-l border-border-strong pl-4" key={event.id}><p className="text-sm font-medium">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{formatIndiaDateTime(event.createdAt)}</p>{event.note && <p className="mt-1 text-sm text-muted">{event.note}</p>}</li>)}
          </ol>
        </section>
        {order.replacementRequests.length > 0 && (
          <section className="mt-10 border-t border-border pt-6">
            <h2 className="font-serif text-2xl">Replacement requests</h2>
            <ul className="mt-3 space-y-3">{order.replacementRequests.map((request) => <li className="border-l-2 border-border-strong pl-4" key={request.id}><p className="text-sm font-medium">{request.status}</p><p className="mt-1 text-xs text-muted">{request.lines.map((line) => line.orderLineId).length} item(s) · {formatIndiaDateTime(request.createdAt)}</p>{request.decisionReason && <p className="mt-1 text-sm text-muted">{request.decisionReason}</p>}</li>)}</ul>
          </section>
        )}
        {order.fulfillmentStatus === "DELIVERED" && (
          <section className="mt-10 border-t border-border pt-6">
            <h2 className="font-serif text-2xl">Replacement request</h2>
            {replacementOpen && eligibleReplacementLines.length > 0
              ? <ReplacementRequestForm orderId={order.id} lines={eligibleReplacementLines} />
              : <p className="mt-3 text-sm text-muted">{replacementOpen ? "All order items already have a replacement decision." : "The replacement request window has ended."}</p>}
          </section>
        )}
      </section>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span>{label}</span><span>{formatPaise(value)}</span></div>;
}