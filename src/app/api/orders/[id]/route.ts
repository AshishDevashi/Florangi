import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-error";
import { getGuestOrder } from "@/server/services/orders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await getGuestOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) {
    return apiError(error);
  }
}