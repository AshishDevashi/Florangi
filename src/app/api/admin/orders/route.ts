import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-error";
import { listAdminOrders } from "@/server/services/admin-orders";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await listAdminOrders({
      status: url.searchParams.get("status") ?? undefined,
      paymentMethod: url.searchParams.get("paymentMethod") ?? undefined,
    }));
  } catch (error) {
    return apiError(error);
  }
}