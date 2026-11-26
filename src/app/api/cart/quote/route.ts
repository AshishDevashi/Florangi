import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-error";
import { quoteCartLines } from "@/server/services/cart";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await quoteCartLines(await request.json(), undefined, { includeDisplayDetails: true }));
  } catch (error) {
    return apiError(error);
  }
}