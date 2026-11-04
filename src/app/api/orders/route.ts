import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createGuestOrder, listCustomerOrders } from "@/server/services/orders";

export async function GET() {
  try {
    return NextResponse.json(await listCustomerOrders());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "checkout", 6, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  try {
    const result = await createGuestOrder(await request.json());
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}