"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Mail, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIndiaDateTime } from "@/server/domain/clock";

type EmailJob = { id: string; template: string; recipient: string; status: string; attemptCount: number; errorDetail: string | null; createdAt: string | Date };

export function EmailJobList({ jobs }: { jobs: EmailJob[] }) {
  const [queuedIds, setQueuedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  async function retry(jobId: string) {
    if (lock.current) return;
    lock.current = true; setBusy(jobId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/email-jobs/${jobId}/retry`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Email could not be queued for retry.");
      setQueuedIds((current) => new Set([...current, jobId]));
      setMessage("Email queued for retry. Check this order again for delivery status.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Check your connection and try again."); }
    finally { lock.current = false; setBusy(null); }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-4 sm:px-5"><Mail aria-hidden="true" className="text-accent" size={18} /><h2 className="font-serif text-2xl">Transactional emails</h2><span className="ml-auto text-xs text-muted">{jobs.length}</span></header>
      <div className="p-4 sm:p-5">
        {error && <p className="mb-3 rounded-lg bg-danger-bg p-3 text-sm text-danger" role="alert">{error}</p>}
        {message && <p className="mb-3 flex items-start gap-2 rounded-lg bg-success-bg p-3 text-sm text-success" role="status"><Check aria-hidden="true" className="shrink-0" size={16} />{message}</p>}
        {jobs.length ? <ul className="divide-y divide-border">{jobs.map((job) => {
          const status = queuedIds.has(job.id) && job.status === "FAILED" ? "QUEUED" : job.status;
          return <li className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0" key={job.id}>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-medium">{job.template.replaceAll("-", " ")}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status === "FAILED" ? "bg-danger-bg text-danger" : "bg-surface-muted text-muted"}`}>{status}</span></div><p className="mt-2 break-all text-xs text-muted">{job.recipient}</p><p className="mt-1 text-xs leading-5 text-muted">{formatIndiaDateTime(new Date(job.createdAt))} · {job.attemptCount} {job.attemptCount === 1 ? "attempt" : "attempts"}</p>{job.errorDetail && status === "FAILED" && <p className="mt-2 break-words text-xs leading-5 text-danger">{job.errorDetail}</p>}</div>
            {status === "FAILED" && <Button disabled={busy !== null} onClick={() => void retry(job.id)} size="sm">{busy === job.id ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <RotateCcw aria-hidden="true" size={14} />}{busy === job.id ? "Retrying…" : "Retry"}</Button>}
          </li>;
        })}</ul> : <p className="text-sm text-muted">No email jobs for this order.</p>}
      </div>
    </section>
  );
}
