import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnvironment } from "@/server/env";
import { expireUnpaidOrders } from "@/server/payments/expiry";
import { processEmailJobs } from "@/server/email/worker";

export async function POST(request: Request) {
  const secret = getEnvironment().CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || !supplied) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const [expiry, email] = await Promise.all([expireUnpaidOrders(), processEmailJobs()]);
    return NextResponse.json({ expiredOrders: expiry.expiredCount, emailJobsProcessed: email.processed });
  } catch {
    return NextResponse.json({ error: "Scheduled payment expiry failed." }, { status: 500 });
  }
}