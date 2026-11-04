"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useFragmentToken } from "@/components/auth/use-fragment-token";

type AuthMode = "login" | "register" | "forgot" | "reset";

const copy: Record<AuthMode, { title: string; submit: string; endpoint: string }> = {
  login: { title: "Welcome back", submit: "Sign in", endpoint: "/api/auth/login" },
  register: { title: "Create your account", submit: "Create account", endpoint: "/api/auth/register" },
  forgot: { title: "Reset your password", submit: "Send reset link", endpoint: "/api/auth/forgot-password" },
  reset: { title: "Choose a new password", submit: "Update password", endpoint: "/api/auth/reset-password" },
};

export function AuthForm({ mode, token, returnTo }: { mode: AuthMode; token?: string; returnTo?: string }) {
  const router = useRouter();
  const resetToken = useFragmentToken(token ?? "");
  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const body = mode === "register"
      ? values
      : mode === "login"
        ? { email: values.email, password: values.password }
        : mode === "forgot"
          ? { email: values.email }
          : { token: resetToken, password: values.password };

    try {
      const response = await fetch(copy[mode].endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string; message?: string; user?: unknown };
      if (!response.ok) {
        setError(result.error ?? "The request could not be completed.");
        return;
      }
      if (mode === "login") {
        const savedCart = localStorage.getItem("florangi-cart-v1");
        if (savedCart) {
          try {
            const guestLines: unknown = JSON.parse(savedCart);
            if (Array.isArray(guestLines) && guestLines.length > 0) {
              const mergeResponse = await fetch("/api/cart/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(guestLines),
              });
              if (!mergeResponse.ok) {
                setError("You are signed in, but your guest cart could not be merged yet. Open your cart to review it.");
                router.push("/cart");
                return;
              }
              const mergeResult = await mergeResponse.json() as { merged?: boolean; requiresReview?: boolean; excess?: unknown[] };
              if (mergeResult.merged) {
                localStorage.removeItem("florangi-cart-v1");
                if (mergeResult.excess?.length) {
                  localStorage.setItem("florangi-cart-merge-warning", "Some quantities exceeded current stock and need review.");
                }
              }
              router.push("/cart");
              return;
            }
          } catch {
            setError("Your guest cart needs review. It has been kept in this browser.");
            router.push("/cart");
            return;
          }
        }
        const destination = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account";
        router.push(destination);
        return;
      }
      if (mode === "reset") {
        router.push("/login?passwordReset=1");
        return;
      }
      setMessage(result.message ?? "Request completed.");
      if (mode === "register" || mode === "forgot") setValues((current) => ({ ...current, password: "" }));
    } catch {
      setError("A network error interrupted the request. Your entries are still here; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full max-w-md">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Florangi account</p>
      <h1 className="mt-3 font-serif text-4xl">{copy[mode].title}</h1>
      {mode === "login" && <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sign in to follow your orders and manage your details.</p>}
      <form className="mt-8 space-y-5" onSubmit={submit}>
        {mode === "register" && (
          <Field label="Full name" name="name" autoComplete="name" value={values.name} onChange={(name) => setValues({ ...values, name })} required />
        )}
        {mode !== "reset" && (
          <Field label="Email address" name="email" type="email" autoComplete="email" value={values.email} onChange={(email) => setValues({ ...values, email })} required />
        )}
        {mode === "register" && (
          <Field label="Phone number" name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={(phone) => setValues({ ...values, phone })} />
        )}
        {(mode === "login" || mode === "register" || mode === "reset") && (
          <Field label={mode === "login" ? "Password" : "Password (at least 12 characters)"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 12} value={values.password} onChange={(password) => setValues({ ...values, password })} required />
        )}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <button className="w-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[#194733] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>
          {busy ? "Please wait…" : copy[mode].submit}
        </button>
      </form>
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--muted)]">
        {mode === "login" && <Link className="underline" href="/forgot-password">Forgot password?</Link>}
        {mode === "login" && <Link className="underline" href="/register">Create account</Link>}
        {mode !== "login" && <Link className="underline" href="/login">Back to sign in</Link>}
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  minLength,
  value,
  onChange,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium" htmlFor={name}>
      {label}
      <input
        className="mt-2 block min-h-11 w-full border border-stone-300 bg-white px-3 text-base outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        autoComplete={autoComplete}
        id={name}
        minLength={minLength}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}