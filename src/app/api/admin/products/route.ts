import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createProduct, listAdminProducts } from "@/server/services/catalog";

export async function GET() {
  try {
    return NextResponse.json(await listAdminProducts());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    return NextResponse.json(await createProduct(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}