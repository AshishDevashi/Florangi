import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { confirmCustomCodOrder } from "@/server/services/cod-confirmation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "cod-confirmation", 5, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many confirmation attempts." }, { status: 429 });
  try {
    const body = await request.json() as { token?: unknown };
    if (typeof body.token !== "string") return NextResponse.json({ error: "Confirmation token is required." }, { status: 400 });
    const { id } = await params;
    return NextResponse.json(await confirmCustomCodOrder(id, body.token));
  } catch (error) {
    return apiError(error);
  }
}