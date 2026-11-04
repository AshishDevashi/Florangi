import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createSettingVersion, listAdminEffectiveSettings } from "@/server/services/settings";

export async function GET() {
  try {
    return NextResponse.json(await listAdminEffectiveSettings());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = await request.json() as { key?: unknown; value?: unknown };
    if (typeof body.key !== "string") return NextResponse.json({ error: "Setting key is required." }, { status: 400 });
    return NextResponse.json(await createSettingVersion(body.key, body.value), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}