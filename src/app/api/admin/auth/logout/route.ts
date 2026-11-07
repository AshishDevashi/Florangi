import { NextResponse } from "next/server";
import { destroyCurrentAdminSession } from "@/server/auth/session";
import { isSameOriginMutation } from "@/server/auth/request-security";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  await destroyCurrentAdminSession();
  return NextResponse.json({ ok: true });
}
