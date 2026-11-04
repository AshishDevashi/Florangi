import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { clearCustomerCart } from "@/server/services/cart";

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    await clearCustomerCart();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}