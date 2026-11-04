import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-error";
import { createAdminReplacementException, listAdminReplacementRequests } from "@/server/services/replacements";
import { isSameOriginMutation } from "@/server/auth/request-security";

export async function GET() {
  try {
    return NextResponse.json(await listAdminReplacementRequests());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    return NextResponse.json(await createAdminReplacementException(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}