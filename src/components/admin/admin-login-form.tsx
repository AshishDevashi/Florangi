"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Admin sign in failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin sign in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <Link className="w-fit font-serif text-2xl font-medium" href="/">Florangi</Link>
      <section className="flex flex-1 items-center justify-center py-14">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private workspace</p>
          <h1 className="mt-3 font-serif text-4xl">Admin sign in</h1>
          <form className="mt-7 space-y-5" onSubmit={submit}>
            <label className="block text-sm" htmlFor="adminUsername">Admin username
              <input autoComplete="username" className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3 outline-none focus:border-accent" id="adminUsername" name="username" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </label>
            <label className="block text-sm" htmlFor="adminPassword">Password
              <input autoComplete="current-password" className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3 outline-none focus:border-accent" id="adminPassword" name="password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </label>
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <button className="min-h-11 w-full bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in to admin"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}