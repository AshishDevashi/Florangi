"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState, type FormEvent } from "react";

type ClockState = { offsetMs: number; now: string };

export function DevTools() {
  const [offsetHours, setOffsetHours] = useState("0");
  const [clock, setClock] = useState<ClockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadClock = useEffectEvent(async () => {
    const response = await fetch("/api/dev/clock", { cache: "no-store" });
    if (!response.ok) throw new Error("Development clock could not be loaded.");
    const state = await response.json() as ClockState;
    setClock(state);
    setOffsetHours(String(state.offsetMs / (60 * 60 * 1000)));
  });

  useEffect(() => {
    startTransition(() => {
      void loadClock().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Development clock could not be loaded."));
    });
  }, []);

  async function setOffset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/dev/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offsetHours: Number(offsetHours) }),
      });
      const result = await response.json() as ClockState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Clock offset could not be updated.");
      setClock(result);
      setMessage("Development clock updated for this web process.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Clock offset could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function runJobs() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/dev/run-jobs", { method: "POST" });
      const result = await response.json() as { expiredOrders?: number; emailJobsProcessed?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Jobs could not be run.");
      setMessage(`Expired ${result.expiredOrders} order(s); processed ${result.emailJobsProcessed} email job(s).`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Jobs could not be run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {(message || error) && <p className={`text-sm ${error ? "text-danger" : "text-success"}`} role={error ? "alert" : "status"}>{error || message}</p>}
      <section className="border-t border-border pt-5">
        <h2 className="font-serif text-2xl">Development clock</h2>
        <p className="mt-2 text-sm text-muted">Current simulated time: {clock?.now ?? "Loading…"}</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={setOffset}>
          <label className="text-sm" htmlFor="clockOffset">Offset (hours, ±720)<input className="mt-1 block min-h-11 w-40 border border-border-strong bg-surface px-3" id="clockOffset" max="720" min="-720" onChange={(event) => setOffsetHours(event.target.value)} step="0.25" type="number" value={offsetHours} /></label>
          <button className="min-h-11 border border-border-strong px-4 text-sm font-semibold disabled:opacity-50" disabled={busy} type="submit">Set offset</button>
          <button className="min-h-11 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={busy} onClick={() => setOffsetHours("0")} type="button">Reset</button>
        </form>
        <p className="mt-3 text-xs text-muted">The offset is held in this web process and resets on restart. The worker process uses its own clock.</p>
      </section>
      <section className="border-t border-border pt-5">
        <h2 className="font-serif text-2xl">Scheduled jobs</h2>
        <button className="mt-4 min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy} onClick={() => void runJobs()} type="button">{busy ? "Running…" : "Run jobs now"}</button>
      </section>
      <section className="border-t border-border pt-5">
        <h2 className="font-serif text-2xl">Email outbox</h2>
        <Link className="mt-4 inline-block text-sm underline" href="/dev/emails">Open development emails</Link>
      </section>
    </div>
  );
}