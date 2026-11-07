import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { attachGuestOrderAccessCookie, validateGuestOrderAccessToken } from "@/server/guest-order-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "order-access", 10, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const { id } = await params;
    const { token } = z.object({ token: z.string().min(40).max(64) }).parse(await request.json());
    if (!await validateGuestOrderAccessToken(id, token)) {
      return NextResponse.json({ error: "This guest order link is invalid or has been revoked." }, { status: 404 });
    }
    const response = NextResponse.json({ ok: true });
    attachGuestOrderAccessCookie(response, id, token);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
