import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { removeProductImage } from "@/server/services/catalog";

export async function DELETE(request: Request, { params }: RouteContext<"/api/admin/products/[id]/images/[imageId]">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id, imageId } = await params;
    const removed = await removeProductImage(id, imageId);
    if (!removed) return NextResponse.json({ error: "Product image not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}