import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/server/http/api-error";
import { getCustomerCheckoutQuote, getGuestCheckoutQuote } from "@/server/services/orders";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = z.object({ paymentMethod: z.enum(["ONLINE", "COD"]), lines: z.array(z.unknown()).optional() }).parse(body);
    return NextResponse.json(parsed.lines
      ? await getGuestCheckoutQuote(parsed.lines, parsed.paymentMethod)
      : await getCustomerCheckoutQuote(parsed.paymentMethod));
  } catch (error) {
    return apiError(error);
  }
}