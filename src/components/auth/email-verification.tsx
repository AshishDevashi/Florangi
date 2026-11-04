"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFragmentToken } from "@/components/auth/use-fragment-token";

export function EmailVerification() {
  const router = useRouter();
  const token = useFragmentToken();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Email could not be verified.");
      router.replace("/login?verified=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email could not be verified.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <Link className="w-fit font-serif text-2xl font-semibold" href="/">Florangi</Link>
      <section className="flex flex-1 items-center justify-center py-14">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Florangi account</p>
          <h1 className="mt-3 font-serif text-4xl">Verify your email</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Confirm your address to finish creating your account.</p>
          {error && <p className="mt-5 text-sm text-red-800" role="alert">{error}</p>}
          <form className="mt-7" onSubmit={submit}>
            <button className="min-h-11 bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || token.length === 0} type="submit">{busy ? "Verifying…" : "Verify email"}</button>
            {!token && <p className="mt-3 text-sm text-red-800" role="status">This link has no verification token. Open the complete link from your email.</p>}
          </form>
        </div>
      </section>
    </main>
  );
}