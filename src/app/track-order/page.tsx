import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ArrowUpRight, CircleCheck, MessageCircle, Package, Search, Truck } from "lucide-react";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import styles from "@/components/storefront/home.module.css";
import { Button } from "@/components/ui/button";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import { listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import { getOrderTracking } from "@/server/services/order-tracking";

export const instant = false;
export const metadata = { title: "Track order | Florangi", robots: { index: false, follow: false } };

export default async function TrackOrderPage({ searchParams }: {
  searchParams: Promise<{ orderNumber?: string | string[] }>;
}) {
  await connection();
  const query = await searchParams;
  const orderNumber = typeof query.orderNumber === "string" ? query.orderNumber.trim().toUpperCase() : "";
  const [order, categories, products] = await Promise.all([
    orderNumber ? getOrderTracking(orderNumber) : null,
    listVisibleCategories(),
    listHomepageProducts(),
  ]);
  const notShipped = order && ["CANCELLED", "REJECTED"].includes(order.fulfillmentStatus);

  return (
    <div className={styles.home}>
      <StoreHeader homepage={false} categories={categories} products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content" className="mx-auto w-full max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your Florangi order</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] sm:text-6xl">Let&apos;s find your order.</h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-muted">From our studio to your doorstep, find the latest update on your order here.</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section aria-labelledby="lookup-title" className="border border-border bg-surface p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center bg-surface-hover text-accent"><Search size={20} strokeWidth={1.5} aria-hidden="true" /></span>
              <div>
                <h2 className="font-serif text-3xl" id="lookup-title">Track your order</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Enter the order number from your confirmation to see its current status.</p>
              </div>
            </div>
            <form action="/track-order" className="mt-7" method="get">
              <label className="text-sm font-medium" htmlFor="orderNumber">Order number</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input aria-describedby={orderNumber && !order ? "order-help order-error" : "order-help"} autoCapitalize="characters" autoComplete="off" className="min-h-12 min-w-0 flex-1 border border-border-strong bg-background px-4 text-base uppercase placeholder:normal-case placeholder:text-muted sm:text-sm" defaultValue={orderNumber} id="orderNumber" maxLength={40} name="orderNumber" placeholder="FLR-2026-000001" required />
                <Button className="min-h-12 rounded-none px-6" type="submit" variant="primary">Track order <ArrowRight size={16} aria-hidden="true" /></Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted" id="order-help">You can find this in your order confirmation.</p>
              {orderNumber && !order && <p className="mt-4 bg-danger-bg px-4 py-3 text-sm leading-6 text-danger" id="order-error" role="alert">No order found. Please check your order number and try again.</p>}
            </form>
          </section>

          <aside className="flex flex-col justify-between bg-espresso p-6 text-ivory sm:p-8">
            <div>
              <MessageCircle size={23} strokeWidth={1.5} aria-hidden="true" />
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-ivory/75">Here for you</p>
              <h2 className="mt-2 font-serif text-3xl">Need a little help?</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-ivory/80">Can&apos;t find your order number or have a question about your order? We&apos;re happy to help.</p>
            </div>
            <Link className="mt-6 inline-flex min-h-11 w-fit items-center gap-3 border-b border-ivory/50 text-sm" href="/contact">Contact us <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </aside>
        </div>

        {order && (
          <article aria-labelledby="order-title" className="mx-auto mt-10 max-w-5xl">
            <div className="flex flex-wrap items-start justify-between gap-5 bg-surface-muted p-6 sm:p-8">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Order details</p>
                <h2 className="mt-2 break-words font-serif text-3xl sm:text-4xl" id="order-title">{order.orderNumber}</h2>
                <p className="mt-2 text-sm text-muted">Placed {formatIndiaDateTime(order.createdAt)}</p>
              </div>
              <div className="bg-surface px-4 py-3" role="status">
                <p className="text-xs text-muted">Order status</p>
                <p className="mt-1 text-sm font-semibold">{order.fulfillmentStatus.replaceAll("_", " ")}</p>
              </div>
            </div>

            <div className="grid gap-5 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <section aria-labelledby="items-title" className="border border-border bg-surface p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Package size={21} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
                  <h3 className="font-serif text-3xl" id="items-title">Your items</h3>
                </div>
                <ul className="mt-5 divide-y divide-border">
                  {order.lines.map((line, index) => (
                    <li className="flex justify-between gap-4 py-4 text-sm" key={index}>
                      <div className="min-w-0 break-words">
                        <p className="font-medium">{line.productName}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{line.productType === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size}`} · Qty {line.quantity}</p>
                      </div>
                      <p className="shrink-0">{formatPaise(line.unitPricePaise * line.quantity)}</p>
                    </li>
                  ))}
                </ul>
                <dl className="mt-2 space-y-3 border-t border-border pt-5 text-sm">
                  <SummaryRow label="Subtotal" value={order.subtotalPaise} />
                  <SummaryRow label="Shipping" value={order.shippingFeePaise + order.codSurchargePaise} />
                  <div className="flex justify-between gap-4 border-t border-border pt-4 font-semibold"><dt>Total</dt><dd>{formatPaise(order.totalPaise)}</dd></div>
                </dl>
                <div className="mt-6 bg-background p-4 text-sm">
                  <p className="text-xs text-muted">Payment</p>
                  <p className="mt-1 font-medium">{order.paymentStatus.replaceAll("_", " ")} · {order.paymentMethod === "COD" ? "Cash on Delivery" : "Online"}</p>
                </div>
              </section>

              <section aria-labelledby="shipping-title" className="border border-border bg-surface p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Truck size={22} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
                  <h3 className="font-serif text-3xl" id="shipping-title">Shipping progress</h3>
                </div>
                <div className="mt-6 space-y-6">
                  <div className="flex gap-4">
                    <CircleCheck size={20} className="mt-0.5 text-accent" aria-hidden="true" />
                    <div><p className="text-sm font-semibold">Order placed</p><p className="mt-1 text-sm leading-6 text-muted">{formatIndiaDateTime(order.createdAt)}</p></div>
                  </div>
                  {order.shipment ? (
                    <>
                      <div className="flex gap-4">
                        <CircleCheck size={20} className="mt-0.5 text-accent" aria-hidden="true" />
                        <div><p className="text-sm font-semibold">Shipped</p><p className="mt-1 text-sm leading-6 text-muted">{formatIndiaDateTime(order.shipment.shippedAt)}</p><p className="mt-1 break-words text-sm text-muted">Courier: {order.shipment.courierName}</p></div>
                      </div>
                      <div className="flex gap-4">
                        {order.shipment.deliveredAt ? <CircleCheck size={20} className="mt-0.5 text-accent" aria-hidden="true" /> : <span className="mt-1 size-4 shrink-0 rounded-full border border-border-strong" aria-hidden="true" />}
                        <div><p className="text-sm font-semibold">{order.shipment.deliveredAt ? "Delivered" : "Delivery pending"}</p>{order.shipment.deliveredAt && <p className="mt-1 text-sm leading-6 text-muted">{formatIndiaDateTime(order.shipment.deliveredAt)}</p>}</div>
                      </div>
                      <div className="bg-background p-4">
                        <p className="text-sm font-semibold">Track with the courier</p>
                        <p className="mt-2 text-sm leading-6 text-muted">If a courier tracking link is available, you can find it in your secure order details. You may need the secure link from your order email to open them.</p>
                        <Link className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline" href={`/orders/${encodeURIComponent(order.id)}`}>Open secure order details <ArrowUpRight size={16} aria-hidden="true" /></Link>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-4">
                      <span className="mt-1 size-4 shrink-0 rounded-full border border-border-strong" aria-hidden="true" />
                      <p className="text-sm leading-6 text-muted">{notShipped ? "This order was not shipped." : "Not shipped yet."}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </article>
        )}
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted">{label}</dt><dd>{formatPaise(value)}</dd></div>;
}
