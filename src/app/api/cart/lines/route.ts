import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { addCustomerCartLine, updateCustomerCartLine } from "@/server/services/cart";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    return NextResponse.json(await addCustomerCartLine(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json() as { lineId?: unknown; quantity?: unknown };
    if (typeof body.lineId !== "string" || typeof body.quantity !== "number") {
      return NextResponse.json({ error: "A cart line and whole-number quantity are required." }, { status: 400 });
    }
    const line = await updateCustomerCartLine(body.lineId, body.quantity);
    if (!line) return NextResponse.json({ error: "Cart line not found." }, { status: 404 });
    return NextResponse.json(line);
  } catch (error) {
    return apiError(error);
  }
}