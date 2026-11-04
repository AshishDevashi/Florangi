import { NextResponse } from "next/server";
import { verifyPaymentWebhookSignature, processPaymentWebhook } from "@/server/payments/service";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyPaymentWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  try {
    const eventId = request.headers.get("x-razorpay-event-id");
    return NextResponse.json(await processPaymentWebhook(rawBody, eventId));
  } catch {
    return NextResponse.json({ error: "Webhook processing failed and may be retried." }, { status: 500 });
  }
}