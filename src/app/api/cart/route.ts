import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-error";
import { getCustomerCart } from "@/server/services/cart";

export async function GET() {
  try {
    return NextResponse.json(await getCustomerCart());
  } catch (error) {
    return apiError(error);
  }
}