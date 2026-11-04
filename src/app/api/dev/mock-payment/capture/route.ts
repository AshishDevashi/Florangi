import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { captureMockPaymentForCustomer } from "@/server/payments/service";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "mock-payment", 5, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many payment simulations." }, { status: 429 });
  try {
    const body = await request.json() as { orderId?: unknown };
    if (typeof body.orderId !== "string") return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    return NextResponse.json(await captureMockPaymentForCustomer(body.orderId));
  } catch (error) {
    return apiError(error);
  }
}