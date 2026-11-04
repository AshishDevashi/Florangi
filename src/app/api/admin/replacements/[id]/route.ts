import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { releaseReplacementAllocation, updateReplacementRequest } from "@/server/services/replacements";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json() as { action?: unknown; lineId?: unknown; note?: unknown };
    const result = body.action === "release-allocation"
      ? typeof body.lineId === "string"
        ? await releaseReplacementAllocation(id, body.lineId, body.note)
        : null
      : await updateReplacementRequest(id, body);
    if (!result) return NextResponse.json({ error: "Replacement request not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}