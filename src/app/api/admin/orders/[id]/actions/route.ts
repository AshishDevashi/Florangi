import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import {
  addAdminOrderNote,
  approveOrder,
  cancelOrderAsAdmin,
  completeOrderLineQC,
  correctOrderMeasurements,
  markCodCollected,
  markOrderDelivered,
  markOrderLineReady,
  rejectOrder,
  shipOrder,
  startProduction,
} from "@/server/services/admin-orders";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json() as { action?: unknown; [key: string]: unknown };
    if (typeof body.action !== "string") return NextResponse.json({ error: "Choose an order action." }, { status: 400 });
    const { action, ...data } = body;

    switch (action) {
      case "approve":
        return NextResponse.json(await approveOrder(id, data.note));
      case "reject":
        return NextResponse.json(await rejectOrder(id, data));
      case "start-production":
        return NextResponse.json(await startProduction(id, data));
      case "complete-qc":
        if (typeof data.lineId !== "string") return NextResponse.json({ error: "Order line is required." }, { status: 400 });
        return NextResponse.json(await completeOrderLineQC(id, data.lineId, data));
      case "correct-measurements":
        if (typeof data.lineId !== "string") return NextResponse.json({ error: "Order line is required." }, { status: 400 });
        return NextResponse.json(await correctOrderMeasurements(id, data.lineId, data));
      case "line-ready":
        if (typeof data.lineId !== "string") return NextResponse.json({ error: "Order line is required." }, { status: 400 });
        return NextResponse.json(await markOrderLineReady(id, data.lineId));
      case "ship":
        return NextResponse.json(await shipOrder(id, data));
      case "delivered":
        return NextResponse.json(await markOrderDelivered(id, typeof data.deliveredAt === "string" ? data.deliveredAt : undefined));
      case "cod-collected":
        return NextResponse.json(await markCodCollected(id, data));
      case "cancel":
        return NextResponse.json(await cancelOrderAsAdmin(id, data));
      case "note": {
        const note = await addAdminOrderNote(id, data);
        if (!note) return NextResponse.json({ error: "Order not found." }, { status: 404 });
        return NextResponse.json(note, { status: 201 });
      }
      default:
        return NextResponse.json({ error: "Unsupported order action." }, { status: 400 });
    }
  } catch (error) {
    return apiError(error);
  }
}