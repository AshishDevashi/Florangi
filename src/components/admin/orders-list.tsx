import Link from "next/link";
import { AlertCircle, ArrowRight, Clock3, CreditCard, PackageOpen, ShoppingBag, UserRound } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { OrderStatusBadge, fulfillmentLabels } from "./order-status";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import type { listAdminOrders } from "@/server/services/admin-orders";

type Props = { orders: Awaited<ReturnType<typeof listAdminOrders>>; filters: { status?: string; paymentMethod?: string } };

export function OrdersList({ orders, filters }: Props) {
  const status = filters.status && Object.hasOwn(fulfillmentLabels, filters.status) ? filters.status : "";
  const method = filters.paymentMethod === "COD" || filters.paymentMethod === "ONLINE" ? filters.paymentMethod : "";
  const filtered = Boolean(status || method);
  const waiting = orders.filter((order) => order.fulfillmentStatus === "PENDING_APPROVAL").length;
  const ready = orders.filter((order) => order.fulfillmentStatus === "READY_TO_SHIP").length;
  const refunds = orders.filter((order) => order.paymentStatus === "REFUND_REQUIRED").length;

  return (
    <div className="space-y-4">
      <form action="/admin/orders" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="w-full min-w-0 text-xs font-medium text-muted sm:w-auto sm:flex-1" htmlFor="statusFilter">Fulfillment status<Select aria-label="Fulfillment status" className="mt-2 sm:min-w-44" defaultValue={status} id="statusFilter" key={`status-${status}`} name="status" options={[{ value: "", label: "All statuses" }, ...Object.entries(fulfillmentLabels).map(([value, label]) => ({ value, label }))]} /></label>
        <label className="w-full min-w-0 text-xs font-medium text-muted sm:w-auto sm:flex-1" htmlFor="paymentFilter">Payment method<Select aria-label="Payment method" className="mt-2 sm:min-w-40" defaultValue={method} id="paymentFilter" key={`method-${method}`} name="paymentMethod" options={[{ value: "", label: "All methods" }, { value: "ONLINE", label: "Online" }, { value: "COD", label: "Cash on delivery" }]} /></label>
        <Button className="w-full sm:w-auto" type="submit" variant="primary">Apply filters</Button>
        {filtered && <Link className={buttonStyles({ variant: "ghost" })} href="/admin/orders">Clear filters</Link>}
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><p><span className="font-semibold text-foreground">{orders.length}</span> {filtered ? "matching" : "recent"} {orders.length === 1 ? "order" : "orders"} · Newest first</p><p>Up to 200 matching orders</p></div>
      {orders.length > 0 && <dl aria-label="Order counts in this view" className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs"><div className="flex gap-2"><dt className="text-muted">Awaiting approval</dt><dd className="font-semibold">{waiting}</dd></div><div className="flex gap-2"><dt className="text-muted">Ready to ship</dt><dd className="font-semibold">{ready}</dd></div><div className="flex gap-2"><dt className="text-muted">Refund required</dt><dd className="font-semibold">{refunds}</dd></div></dl>}
      <ul aria-label="Orders" className="space-y-4">
        {orders.map((order) => {
          const itemCount = order.lines.reduce((count, line) => count + line.quantity, 0);
          const overdue = order.fulfillmentStatus === "PENDING_APPROVAL" && order.awaitingApprovalHours >= 24;
          return <li key={order.id}>
            <Link aria-label={`View order ${order.orderNumber}`} className={`group block overflow-hidden rounded-xl border bg-surface transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${overdue ? "border-warning-border" : "border-border"}`} href={`/admin/orders/${order.id}`} prefetch={false}>
              <article>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all font-sans text-base font-semibold group-hover:text-accent sm:text-lg">{order.orderNumber}</h2><p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-muted"><Clock3 aria-hidden="true" className="mt-0.5 shrink-0" size={13} /><time dateTime={order.createdAt.toISOString()}>{formatIndiaDateTime(order.createdAt)}</time></p></div><div className="shrink-0"><p className="text-lg font-semibold tabular-nums sm:text-right">{formatPaise(order.totalPaise)}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted sm:justify-end"><CreditCard aria-hidden="true" size={13} />{order.paymentMethod === "COD" ? "Cash on delivery" : "Online payment"}</p></div></div>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-2"><UserRound aria-hidden="true" className="mt-0.5 shrink-0 text-muted" size={16} /><div className="min-w-0"><p className="break-words text-sm font-medium">{order.firstName} {order.lastName}</p><p className="mt-1 break-all text-xs text-muted">{order.email}</p></div></div><div className="flex flex-wrap gap-2"><OrderStatusBadge value={order.fulfillmentStatus} /><OrderStatusBadge kind="payment" value={order.paymentStatus} /></div></div>
                  {(overdue || order.paymentStatus === "REFUND_REQUIRED") && <p className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs leading-5 text-warning"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />{overdue ? `Awaiting approval for ${order.awaitingApprovalHours} hours. Open this order to review it.` : "A refund requires attention. Open this order to review payment actions."}</p>}
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 sm:px-5"><div className="flex min-w-0 flex-1 items-start gap-2"><ShoppingBag aria-hidden="true" className="mt-0.5 shrink-0 text-muted" size={15} /><div className="min-w-0"><p className="text-xs font-medium">{itemCount} {itemCount === 1 ? "item" : "items"}</p><p className="mt-1 break-words text-xs leading-5 text-muted">{order.lines.slice(0, 2).map((line) => `${line.productName}${line.productType === "CUSTOM_DRESS" ? " · Custom" : ` · ${line.size}`} × ${line.quantity}`).join("; ")}{order.lines.length > 2 ? `; +${order.lines.length - 2} more` : ""}</p></div></div><span className="inline-flex min-h-11 shrink-0 items-center gap-2 text-xs font-semibold text-accent">View order<ArrowRight aria-hidden="true" size={15} /></span></footer>
              </article>
            </Link>
          </li>;
        })}
      </ul>
      {!orders.length && <div className="rounded-xl border border-dashed border-border-strong bg-surface px-5 py-14 text-center"><PackageOpen aria-hidden="true" className="mx-auto text-muted" size={36} /><h2 className="mt-4 text-2xl">{filtered ? "No orders in this view" : "Your orders will appear here"}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{filtered ? "Try a different fulfillment status or payment method." : "New customer orders will be listed here for review and fulfillment."}</p>{filtered && <Link className={buttonStyles({ className: "mt-5" })} href="/admin/orders">Clear filters</Link>}</div>}
    </div>
  );
}
