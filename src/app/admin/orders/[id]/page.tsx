import { notFound } from "next/navigation";
import { getAdminOrder } from "@/server/services/admin-orders";
import { AdminOrderDetail } from "@/components/admin/order-detail";

export const instant = false;

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) notFound();
  return <AdminOrderDetail order={order} />;
}
