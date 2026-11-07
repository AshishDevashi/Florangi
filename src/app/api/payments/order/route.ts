import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createProviderOrderForGuest } from "@/server/payments/service";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json() as { orderId?: unknown };
    if (typeof body.orderId !== "string") return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    return NextResponse.json(await createProviderOrderForGuest(body.orderId));
  } catch (error) {
    return apiError(error);
  }
}