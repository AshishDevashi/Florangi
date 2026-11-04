import "server-only";

import { randomUUID } from "node:crypto";
import Razorpay from "razorpay";
import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";

export type ProviderOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
};

export type ProviderPayment = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
};

export type ProviderRefund = {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
};

export interface PaymentProvider {
  createOrder(input: { amount: number; currency: "INR"; receipt: string }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchCapturedPaymentForOrder(providerOrderId: string): Promise<ProviderPayment>;
  createRefund(paymentId: string, amount: number, idempotencyKey: string): Promise<ProviderRefund>;
  fetchRefund(refundId: string): Promise<ProviderRefund>;
}

function amountToPaise(value: number | string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Payment provider returned an invalid paise amount.");
  return amount;
}

class RazorpayProvider implements PaymentProvider {
  private readonly client: Razorpay;
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(keyId: string, keySecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createOrder(input: { amount: number; currency: "INR"; receipt: string }): Promise<ProviderOrder> {
    const order = await this.client.orders.create(input);
    return { id: order.id, amount: amountToPaise(order.amount), currency: order.currency, receipt: order.receipt ?? input.receipt };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const payment = await this.client.payments.fetch(paymentId);
    return {
      id: payment.id,
      orderId: typeof payment.order_id === "string" ? payment.order_id : "",
      amount: amountToPaise(payment.amount),
      currency: payment.currency,
      status: payment.status,
      captured: payment.captured === true,
    };
  }

  async fetchCapturedPaymentForOrder(providerOrderId: string): Promise<ProviderPayment> {
    const result = await this.client.orders.fetchPayments(providerOrderId);
    const captured = result.items.find((payment) => payment.captured === true && payment.status === "captured");
    if (!captured) throw new Error("No captured payment was found for this Razorpay order.");
    return {
      id: captured.id,
      orderId: typeof captured.order_id === "string" ? captured.order_id : "",
      amount: amountToPaise(captured.amount),
      currency: captured.currency,
      status: captured.status,
      captured: true,
    };
  }

  async createRefund(paymentId: string, amount: number, idempotencyKey: string): Promise<ProviderRefund> {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "X-Razorpay-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ amount }),
    });
    const result = await response.json() as { id?: string; payment_id?: string; amount?: number; status?: string; error?: { description?: string } };
    if (!response.ok || !result.id || !result.payment_id || typeof result.amount !== "number" || !result.status) {
      throw new Error(result.error?.description ?? "Razorpay refund request failed.");
    }
    return { id: result.id, paymentId: result.payment_id, amount: result.amount, status: result.status };
  }

  async fetchRefund(refundId: string): Promise<ProviderRefund> {
    const response = await fetch(`https://api.razorpay.com/v1/refunds/${encodeURIComponent(refundId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}` },
    });
    const result = await response.json() as { id?: string; payment_id?: string; amount?: number; status?: string; error?: { description?: string } };
    if (!response.ok || !result.id || !result.payment_id || typeof result.amount !== "number" || !result.status) {
      throw new Error(result.error?.description ?? "Razorpay refund lookup failed.");
    }
    return { id: result.id, paymentId: result.payment_id, amount: result.amount, status: result.status };
  }
}

class MockPaymentProvider implements PaymentProvider {
  async createOrder(input: { amount: number; currency: "INR"; receipt: string }): Promise<ProviderOrder> {
    return { id: `mock_order_${randomUUID()}`, ...input };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const attempt = await db.paymentAttempt.findUnique({ where: { providerPaymentId: paymentId } });
    if (!attempt || attempt.provider !== "mock" || !attempt.providerOrderId) throw new Error("Mock payment was not found.");
    return {
      id: paymentId,
      orderId: attempt.providerOrderId,
      amount: attempt.amountPaise,
      currency: attempt.currency,
      status: attempt.status === "CAPTURED" ? "captured" : attempt.status.toLowerCase(),
      captured: attempt.status === "CAPTURED",
    };
  }

  async fetchCapturedPaymentForOrder(providerOrderId: string): Promise<ProviderPayment> {
    const attempt = await db.paymentAttempt.findFirst({
      where: { providerOrderId, status: "CAPTURED", providerPaymentId: { not: null } },
      orderBy: { verifiedAt: "desc" },
    });
    if (!attempt?.providerPaymentId) throw new Error("No captured mock payment was found for this order.");
    return this.fetchPayment(attempt.providerPaymentId);
  }

  async createRefund(paymentId: string, amount: number, idempotencyKey: string): Promise<ProviderRefund> {
    const existing = await db.refund.findUnique({ where: { idempotencyKey } });
    return {
      id: existing?.providerRefundId ?? `mock_refund_${randomUUID()}`,
      paymentId,
      amount,
      status: "processed",
    };
  }

  async fetchRefund(refundId: string): Promise<ProviderRefund> {
    const refund = await db.refund.findUnique({ where: { providerRefundId: refundId } });
    if (!refund) throw new Error("Mock refund was not found.");
    const payment = await db.paymentAttempt.findFirst({ where: { orderId: refund.orderId, status: "CAPTURED" } });
    if (!payment?.providerPaymentId) throw new Error("Mock captured payment was not found.");
    return { id: refundId, paymentId: payment.providerPaymentId, amount: refund.amountPaise, status: "processed" };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const environment = getEnvironment();
  if (environment.PAYMENT_DRIVER === "mock") {
    if (environment.NODE_ENV === "production") throw new Error("Mock payments cannot run in production.");
    return new MockPaymentProvider();
  }
  return new RazorpayProvider(environment.RAZORPAY_KEY_ID!, environment.RAZORPAY_KEY_SECRET!);
}