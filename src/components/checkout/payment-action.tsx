"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { openRazorpayCheckout, type RazorpayClientOrder, type RazorpayPaymentResponse } from "@/components/checkout/payment-client";

export function PaymentAction({ orderId, mode }: { orderId: string; mode: "mock" | "razorpay" }) {
  const router = useRouter();
  const lock = useRef(false);
  const [phase, setPhase] = useState<"opening" | "payment" | "verifying" | null>(null);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function handleSuccess(response: RazorpayPaymentResponse) {
    setPhase("verifying");
    try {
      const verified = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      const result = await verified.json() as { error?: string };
      if (!verified.ok) throw new Error(result.error ?? "Payment could not be verified yet.");
      localStorage.removeItem("florangi-cart-v1");
      startTransition(() => router.refresh());
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "The verification request was interrupted.";
      setError(`${detail} Check your order status before retrying payment.`);
    } finally {
      lock.current = false;
      setPhase(null);
    }
  }

  async function retryPayment() {
    if (lock.current || refreshing) return;
    lock.current = true;
    setPhase("opening");
    setError("");
    try {
      if (mode === "mock") {
        const response = await fetch("/api/dev/mock-payment/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Mock payment could not be captured.");
        localStorage.removeItem("florangi-cart-v1");
        startTransition(() => router.refresh());
        lock.current = false;
        setPhase(null);
        return;
      }

      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json() as RazorpayClientOrder & { driver?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Payment could not be started.");
      let verificationStarted = false;
      let dismissed = false;
      let paymentFailure = "";
      await openRazorpayCheckout(result, {
        onSuccess: (payment) => {
          if (verificationStarted) return;
          verificationStarted = true;
          lock.current = true;
          setError("");
          return handleSuccess(payment);
        },
        onFailure: (message) => {
          if (verificationStarted || dismissed) return;
          paymentFailure = message;
        },
        onDismiss: () => {
          if (verificationStarted || dismissed) return;
          dismissed = true;
          if (paymentFailure) setError(`${paymentFailure} Check your order status before retrying payment.`);
          lock.current = false;
          setPhase(null);
        },
      });
      if (!verificationStarted && !dismissed) setPhase("payment");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment could not be started.");
      lock.current = false;
      setPhase(null);
    }
  }

  return (
    <div className="mt-5">
      <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={Boolean(phase) || refreshing} onClick={() => void retryPayment()} type="button">
        {phase === "verifying" ? "Verifying payment…" : refreshing ? "Updating order…" : phase === "payment" ? "Payment window open…" : phase === "opening" ? "Opening payment…" : mode === "mock" ? "Simulate captured payment" : "Retry payment"}
      </button>
      {(phase === "verifying" || refreshing) && <p className="mt-2 text-sm text-muted" role="status">Please wait and keep this page open while we update your order.</p>}
      {mode === "mock" && <p className="mt-2 text-xs text-muted">Development payment simulation only.</p>}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}