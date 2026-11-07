import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { attachGuestOrderAccessCookie } from "@/server/guest-order-access";
import { createOrderForGuest } from "@/server/services/orders";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "checkout", 6, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  try {
    const result = await createOrderForGuest(await request.json());
    const response = NextResponse.json({ order: result.order, reused: result.reused }, { status: result.reused ? 200 : 201 });
    attachGuestOrderAccessCookie(response, result.order.id, result.accessToken);
    return response;
  } catch (error) {
    return apiError(error);
  }
}