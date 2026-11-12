"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function GuestOrderAccessGate({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("This order needs the secure link from your order email.");

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("access");
    if (!token) return;

    let active = true;
    void fetch(`/api/orders/${encodeURIComponent(orderId)}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This guest order link could not be verified.");
      fragment.delete("access");
      const remainingFragment = fragment.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${remainingFragment ? `#${remainingFragment}` : ""}`);
      router.refresh();
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "This guest order link could not be verified.");
    });

    return () => {
      active = false;
    };
  }, [orderId, router]);

  return <p className="mt-8 text-sm text-muted" role="status">{message}</p>;
}
