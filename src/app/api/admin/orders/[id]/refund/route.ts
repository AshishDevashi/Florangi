import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { createOrReconcileFullRefund } from "@/server/payments/refunds";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    return NextResponse.json(await createOrReconcileFullRefund(id));
  } catch (error) {
    return apiError(error);
  }
}