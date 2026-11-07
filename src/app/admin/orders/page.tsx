import Link from "next/link";
import { connection } from "next/server";
import { formatIndiaDateTime } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import { listAdminOrders } from "@/server/services/admin-orders";

export const instant = false;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; paymentMethod?: string }> }) {
  await connection();
  const filters = await searchParams;
  const orders = await listAdminOrders(filters);

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Fulfillment</p>
      <h1 className="mt-2 font-serif text-4xl">Orders</h1>
      <form className="mt-6 grid gap-3 border-b border-stone-200 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action="/admin/orders">
        <label className="text-sm" htmlFor="statusFilter">Status
          <select className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" defaultValue={filters.status ?? ""} id="statusFilter" name="status">
            <option value="">All statuses</option>
            {[
              ["PENDING_PAYMENT", "Pending payment"], ["PENDING_APPROVAL", "Pending approval"], ["APPROVED", "Approved"],
              ["IN_PRODUCTION", "In production"], ["READY_TO_SHIP", "Ready to ship"], ["SHIPPED", "Shipped"],
              ["DELIVERED", "Delivered"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"],
            ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm" htmlFor="paymentFilter">Payment
          <select className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" defaultValue={filters.paymentMethod ?? ""} id="paymentFilter" name="paymentMethod">
            <option value="">All methods</option><option value="ONLINE">Online</option><option value="COD">Cash on Delivery</option>
          </select>
        </label>
        <button className="min-h-11 border border-stone-300 px-4 text-sm font-medium hover:border-[var(--accent)]" type="submit">Apply filters</button>
      </form>
      {orders.length === 0 ? <p className="py-8 text-sm text-[var(--muted)]">No orders match these filters.</p> : (
        <ul className="divide-y divide-stone-200">
          {orders.map((order) => (
            <li className={`py-5 ${order.awaitingApprovalHours >= 24 ? "border-l-2 border-amber-700 pl-4" : ""}`} key={order.id}>
              <Link className="grid gap-3 sm:grid-cols-[1fr_auto]" href={`/admin/orders/${order.id}`}>
                <div>
                  <div className="flex flex-wrap items-baseline gap-2"><h2 className="font-medium underline">{order.orderNumber}</h2><span className="text-xs text-[var(--muted)]">{order.fulfillmentStatus.replaceAll("_", " ")}</span>{order.awaitingApprovalHours >= 24 && <span className="text-xs font-semibold text-amber-900">Waiting {order.awaitingApprovalHours}h</span>}</div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{order.firstName} {order.lastName} · {order.email} · {formatIndiaDateTime(order.createdAt)}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{order.paymentMethod === "COD" ? "COD" : "Online"} · {order.paymentStatus.replaceAll("_", " ")} · {order.lines.map((line) => `${line.productName} × ${line.quantity}`).join(", ")}</p>
                </div>
                <p className="font-medium sm:text-right">{formatPaise(order.totalPaise)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}