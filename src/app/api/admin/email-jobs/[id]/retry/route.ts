import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { retryFailedEmailJob } from "@/server/services/admin-email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const job = await retryFailedEmailJob(id);
    if (!job) return NextResponse.json({ error: "Email job not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: job.status });
  } catch (error) {
    return apiError(error);
  }
}