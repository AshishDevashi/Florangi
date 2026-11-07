import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/server/http/api-error";
import { getGuestCheckoutQuote } from "@/server/services/orders";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = z.object({ paymentMethod: z.enum(["ONLINE", "COD"]), lines: z.array(z.unknown()).min(1) }).parse(body);
    return NextResponse.json(await getGuestCheckoutQuote(parsed.lines, parsed.paymentMethod));
  } catch (error) {
    return apiError(error);
  }
}