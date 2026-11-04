import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Customer email verification is not required for guest checkout." }, { status: 410 });
}