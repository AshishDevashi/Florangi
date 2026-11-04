import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Customer password recovery is disabled." }, { status: 410 });
}