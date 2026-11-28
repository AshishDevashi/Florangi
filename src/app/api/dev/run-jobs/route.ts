import { NextResponse } from "next/server";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { processEmailJobs } from "@/server/email/worker";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "dev-run-jobs", 5, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many job runs." }, { status: 429 });
  try {
    const email = await processEmailJobs();
    return NextResponse.json({ emailJobsProcessed: email.processed });
  } catch (error) {
    console.error("email.dev_jobs_failed", { errorName: error instanceof Error ? error.name : "JobError" });
    return NextResponse.json({ error: "Development jobs could not be run." }, { status: 500 });
  }
}