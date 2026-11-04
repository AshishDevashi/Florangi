"use client";

import { useState } from "react";
import { useFragmentToken } from "@/components/auth/use-fragment-token";

export function CodConfirmationForm({ orderId }: { orderId: string }) {
  const token = useFragmentToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${orderId}/confirm-cod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { error?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(result.error ?? "Order confirmation could not be recorded.");
      setMessage(result.duplicate ? "Your confirmation has already been recorded." : "Your confirmation is recorded. Your order still awaits owner approval.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order confirmation could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={submit}>
      {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
      {message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
      {!token && <p className="text-sm text-red-800" role="status">This confirmation link is incomplete or expired.</p>}
      <label className="flex items-start gap-2 text-sm leading-6"><input className="mt-1" required type="checkbox" />I confirm that I intend to accept this made-to-measure Cash on Delivery order.</label>
      <button className="min-h-11 bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !token} type="submit">{busy ? "Recording…" : "Confirm custom order"}</button>
    </form>
  );
}