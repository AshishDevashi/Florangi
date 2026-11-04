import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json({ error: "Customer profile editing is disabled; contact details are collected at checkout." }, { status: 410 });
}