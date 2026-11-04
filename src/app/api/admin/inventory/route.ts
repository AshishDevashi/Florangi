import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { listAdminInventory, setInventoryOnHand } from "@/server/services/catalog";

export async function GET() {
  try {
    return NextResponse.json(await listAdminInventory());
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const variant = await setInventoryOnHand(await request.json());
    if (!variant) return NextResponse.json({ error: "Size variant not found." }, { status: 404 });
    return NextResponse.json(variant);
  } catch (error) {
    return apiError(error);
  }
}