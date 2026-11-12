import Link from "next/link";
import { getOrderTracking } from "@/server/services/order-tracking";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";

export const instant = false;
export const metadata = { title: "Track order | Florangi", robots: { index: false, follow: false } };

export default async function TrackOrderPage({ searchParams }: {
  searchParams: Promise<{ orderNumber?: string | string[] }>;
}) {
  const query = await searchParams;
  const orderNumber = typeof query.orderNumber === "string" ? query.orderNumber.trim().toUpperCase() : "";
  const order = orderNumber ? await getOrderTracking(orderNumber) : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <Link className="font-serif text-2xl font-medium" href="/">Florangi</Link>
        <Link className="text-sm underline" href="/cart">Bag</Link>
      </header>
      <section className="py-9">
        <h1 className="font-serif text-4xl">Track order</h1>
        <form action="/track-order" className="mt-7 flex max-w-xl flex-col items-start gap-3 sm:flex-row sm:items-end" method="get">
          <label className="w-full text-sm" htmlFor="orderNumber">
            Order number
            <input autoCapitalize="characters" autoComplete="off" className="mt-2 block min-h-11 w-full border border-border-strong bg-surface px-3 uppercase" defaultValue={orderNumber} id="orderNumber" maxLength={40} name="orderNumber" placeholder="FLR-2026-000001" required />
          </label>
          <button className="min-h-11 shrink-0 bg-accent px-5 text-sm font-semibold text-on-accent" type="submit">Track order</button>
        </form>
        {orderNumber && !order && <p className="mt-6 text-sm text-danger" role="alert">No order found. Check your order number.</p>}
        {order && (
          <article className="mt-9 border-t border-border pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl">{order.orderNumber}</h2>
                <p className="mt-2 text-sm text-muted">Placed {formatIndiaDateTime(order.createdAt)}</p>
              </div>
              <p className="border-l-2 border-accent pl-3 text-sm font-medium" role="status">{order.fulfillmentStatus.replaceAll("_", " ")}</p>
            </div>
            <p className="mt-4 text-sm text-muted">Payment: {order.paymentStatus.replaceAll("_", " ")} · {order.paymentMethod === "COD" ? "Cash on Delivery" : "Online"}</p>
            <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
              <section className="min-w-0">
                <h3 className="font-serif text-2xl">Items</h3>
                <ul className="mt-3 divide-y divide-border">
                  {order.lines.map((line, index) => (
                    <li className="flex justify-between gap-4 py-4 text-sm" key={index}>
                      <div className="min-w-0 break-words">
                        <p className="font-medium">{line.productName}</p>
                        <p className="mt-1 text-xs text-muted">{line.productType === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size}`} · Qty {line.quantity}</p>
                      </div>
                      <p className="shrink-0">{formatPaise(line.unitPricePaise * line.quantity)}</p>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
                  <SummaryRow label="Subtotal" value={order.subtotalPaise} />
                  <SummaryRow label="Shipping" value={order.shippingFeePaise + order.codSurchargePaise} />
                  <div className="flex justify-between border-t border-border pt-3 font-semibold"><dt>Total</dt><dd>{formatPaise(order.totalPaise)}</dd></div>
                </dl>
              </section>
              <section className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <h3 className="font-serif text-2xl">Shipping progress</h3>
                {order.shipment ? (
                  <div className="mt-3 space-y-3 text-sm">
                    <p className="font-medium break-words">{order.shipment.courierName}</p>
                    <p>Shipped {formatIndiaDateTime(order.shipment.shippedAt)}</p>
                    <p>{order.shipment.deliveredAt ? `Delivered ${formatIndiaDateTime(order.shipment.deliveredAt)}` : "Delivery pending"}</p>
                  </div>
                ) : <p className="mt-3 text-sm text-muted">{["CANCELLED", "REJECTED", "EXPIRED"].includes(order.fulfillmentStatus) ? "This order was not shipped." : "Not shipped yet."}</p>}
              </section>
            </div>
          </article>
        )}
      </section>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><dt>{label}</dt><dd>{formatPaise(value)}</dd></div>;
}