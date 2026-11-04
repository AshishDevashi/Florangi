"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setBusy(false);
  }

  return (
    <button className="border border-stone-300 px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-60" disabled={busy} onClick={logout} type="button">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}