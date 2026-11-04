import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { getDevelopmentClockOffsetMs, setDevelopmentClockOffsetMs, systemClock } from "@/server/domain/clock";

export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ offsetMs: getDevelopmentClockOffsetMs(), now: systemClock.now().toISOString() });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const body = z.object({ offsetHours: z.number().finite().min(-720).max(720) }).parse(await request.json());
    setDevelopmentClockOffsetMs(Math.round(body.offsetHours * 60 * 60 * 1000));
    return NextResponse.json({ offsetMs: getDevelopmentClockOffsetMs(), now: systemClock.now().toISOString() });
  } catch {
    return NextResponse.json({ error: "Clock offset must be between -720 and 720 hours." }, { status: 400 });
  }
}