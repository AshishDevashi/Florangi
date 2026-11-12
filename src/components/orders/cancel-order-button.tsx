"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancelOrder() {
    if (!window.confirm("Cancel this unpaid order? Its reserved sizes will be released.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Order could not be cancelled.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order could not be cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <button className="border border-border-strong px-4 py-2 text-sm text-danger disabled:opacity-50" disabled={busy} onClick={() => void cancelOrder()} type="button">{busy ? "Cancelling…" : "Cancel unpaid order"}</button>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}