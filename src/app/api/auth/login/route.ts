import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Customer sign-in is disabled. Orders are placed as a guest." }, { status: 410 });
}