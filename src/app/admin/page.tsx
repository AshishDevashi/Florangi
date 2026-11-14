import { connection } from "next/server";
import { AdminOverview } from "@/components/admin/admin-overview";
import { getAdminOverview } from "@/server/services/admin-overview";

export const instant = false;

export default async function AdminDashboard() {
  await connection();
  const data = await getAdminOverview();
  return <AdminOverview data={data} />;
}
