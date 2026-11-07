"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Admin sign out could not be completed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="text-sm underline disabled:opacity-50" disabled={busy} onClick={() => void logout()} type="button">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
