import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Saved address books are disabled; enter a delivery address at checkout." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Saved address books are disabled; enter a delivery address at checkout." }, { status: 410 });
}