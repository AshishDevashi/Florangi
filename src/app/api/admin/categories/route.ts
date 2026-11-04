import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createCategory, listAdminCategories } from "@/server/services/catalog";

export async function GET() {
  try {
    return NextResponse.json(await listAdminCategories());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    return NextResponse.json(await createCategory(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}