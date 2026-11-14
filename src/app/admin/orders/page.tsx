import { connection } from "next/server";
import { OrdersList } from "@/components/admin/orders-list";
import { listAdminOrders } from "@/server/services/admin-orders";

export const instant = false;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; paymentMethod?: string }> }) {
  await connection();
  const filters = await searchParams;
  const orders = await listAdminOrders(filters);
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Fulfillment</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Orders</h1>
      <div className="mt-4"><OrdersList filters={filters} orders={orders} /></div>
    </main>
  );
}
