import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { acceptCustomerCartQuotes } from "@/server/services/cart";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    return NextResponse.json(await acceptCustomerCartQuotes());
  } catch (error) {
    return apiError(error);
  }
}