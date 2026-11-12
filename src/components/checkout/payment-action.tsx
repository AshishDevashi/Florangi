"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openRazorpayCheckout, type RazorpayClientOrder, type RazorpayPaymentResponse } from "@/components/checkout/payment-client";

export function PaymentAction({ orderId, mode }: { orderId: string; mode: "mock" | "razorpay" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSuccess(response: RazorpayPaymentResponse) {
    const verified = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    const result = await verified.json() as { error?: string };
    if (!verified.ok) {
      setError(result.error ?? "Payment is not verified yet. Check your order status before retrying.");
      setBusy(false);
      return;
    }
    localStorage.removeItem("florangi-cart-v1");
    router.refresh();
  }

  async function retryPayment() {
    setBusy(true);
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
        router.refresh();
        return;
      }

      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json() as RazorpayClientOrder & { driver?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Payment could not be started.");
      await openRazorpayCheckout(result, {
        onSuccess: handleSuccess,
        onFailure: (message) => {
          setError(message);
          setBusy(false);
        },
        onDismiss: () => setBusy(false),
      });
      setBusy(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy} onClick={() => void retryPayment()} type="button">
        {busy ? "Opening payment…" : mode === "mock" ? "Simulate captured payment" : "Retry payment"}
      </button>
      {mode === "mock" && <p className="mt-2 text-xs text-muted">Development payment simulation only.</p>}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}