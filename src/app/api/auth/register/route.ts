import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Customer registration is disabled. Enter your contact details at checkout." }, { status: 410 });
}