import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { removeCustomerCartLine } from "@/server/services/cart";

export async function DELETE(request: Request, { params }: { params: Promise<{ lineId: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { lineId } = await params;
    const removed = await removeCustomerCartLine(lineId);
    if (!removed) return NextResponse.json({ error: "Cart line not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}