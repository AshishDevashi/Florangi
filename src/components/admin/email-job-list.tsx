"use client";

import { useState } from "react";

type EmailJob = {
  id: string;
  template: string;
  recipient: string;
  status: string;
  attemptCount: number;
  errorDetail: string | null;
  createdAt: string | Date;
};

export function EmailJobList({ jobs }: { jobs: EmailJob[] }) {
  const [failedIds, setFailedIds] = useState(() => new Set(jobs.filter((job) => job.status === "FAILED").map((job) => job.id)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function retry(jobId: string) {
    setBusy(jobId);
    setError("");
    const response = await fetch(`/api/admin/email-jobs/${jobId}/retry`, { method: "POST" });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Email job could not be retried.");
    else setFailedIds((current) => { const next = new Set(current); next.delete(jobId); return next; });
    setBusy(null);
  }

  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-medium">Transactional emails</h2>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {jobs.length === 0 ? <p className="mt-3 text-sm text-muted">No email jobs for this order.</p> : (
        <ul className="mt-3 divide-y divide-border">
          {jobs.map((job) => (
            <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={job.id}>
              <div><p className="font-medium">{job.template} · {job.status}</p><p className="mt-1 text-xs text-muted">{job.recipient} · {job.attemptCount} attempt(s){job.errorDetail ? ` · ${job.errorDetail}` : ""}</p></div>
              {failedIds.has(job.id) && <button className="border border-border-strong px-3 py-2 text-xs disabled:opacity-50" disabled={busy === job.id} onClick={() => void retry(job.id)} type="button">{busy === job.id ? "Retrying…" : "Retry"}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}