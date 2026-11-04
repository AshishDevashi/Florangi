import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { processEmailJobs } from "@/server/email/worker";
import { expireUnpaidOrders } from "@/server/payments/expiry";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "dev-run-jobs", 5, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many job runs." }, { status: 429 });
  try {
    const [expiry, email] = await Promise.all([expireUnpaidOrders(), processEmailJobs()]);
    return NextResponse.json({ expiredOrders: expiry.expiredCount, emailJobsProcessed: email.processed });
  } catch {
    return NextResponse.json({ error: "Development jobs could not be run." }, { status: 500 });
  }
}