import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createCustomerReplacementRequest } from "@/server/services/replacements";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "replacement", 4, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many replacement requests. Try again shortly." }, { status: 429 });
  try {
    const formData = await request.formData();
    const requestValue = formData.get("request");
    if (typeof requestValue !== "string") return NextResponse.json({ error: "Replacement details are required." }, { status: 400 });
    let details: unknown;
    try {
      details = JSON.parse(requestValue) as unknown;
    } catch {
      return NextResponse.json({ error: "Replacement details are invalid." }, { status: 400 });
    }
    const files = formData.getAll("photos");
    if (files.some((file) => !(file instanceof File))) return NextResponse.json({ error: "Each photo must be a file." }, { status: 400 });
    const photos = await Promise.all((files as File[]).filter((file) => file.size > 0).map(async (file) => ({
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      size: file.size,
    })));
    return NextResponse.json(await createCustomerReplacementRequest(details, photos), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}