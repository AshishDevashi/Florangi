import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnvironment } from "@/server/env";
import { processEmailJobs } from "@/server/email/worker";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const secret = getEnvironment().CRON_SECRET;
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || !supplied) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const email = await processEmailJobs();
    return NextResponse.json({ emailJobsProcessed: email.processed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("email.cron_failed", { errorName: error instanceof Error ? error.name : "CronError" });
    return NextResponse.json({ error: "Scheduled email processing failed." }, { status: 500 });
  }
}