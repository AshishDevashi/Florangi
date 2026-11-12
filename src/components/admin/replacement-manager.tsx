"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";

type Replacement = {
  id: string;
  status: "OPEN" | "ACCEPTED" | "REJECTED" | "RESOLVED";
  reason: string;
  notes: string | null;
  decisionReason: string | null;
  logisticsNote: string | null;
  createdAt: string | Date;
  order: { id: string; orderNumber: string; firstName: string; lastName: string; email: string; fulfillmentStatus: string; shipment: { deliveredAt: string | Date | null } | null };
  lines: Array<{ id: string; desiredSize: string | null; fitCorrection: string | null; allocatedVariant: { size: string } | null; orderLine: { productName: string; productType: string; size: string | null } }>;
  photos: Array<{ id: string; signedUrl: string | null; mimeType: string }>;
};

export function ReplacementManager({ initialRequests }: { initialRequests: Replacement[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [exception, setException] = useState({ orderId: "", orderLineId: "", productType: "DESIGNER_DRESS", currentSize: "XS", desiredSize: "S", fitCorrection: "", reason: "", notes: "" });
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [logisticsNotes, setLogisticsNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createException(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("exception");
    setError("");
    setMessage("");
    const line = exception.productType === "DESIGNER_DRESS"
      ? { orderLineId: exception.orderLineId, desiredSize: exception.desiredSize }
      : { orderLineId: exception.orderLineId, fitCorrection: exception.fitCorrection };
    try {
      const response = await fetch("/api/admin/replacements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: exception.orderId,
          reason: exception.reason,
          notes: exception.notes,
          lines: [line],
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Exception request could not be created.");
      const updatedRequests = await fetch("/api/admin/replacements", { cache: "no-store" }).then((result) => result.json() as Promise<Replacement[]>);
      setRequests(updatedRequests);
      setException((current) => ({ ...current, orderId: "", orderLineId: "", reason: "", notes: "", fitCorrection: "" }));
      setMessage("Replacement exception created and customer notified.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Exception request could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function update(request: Replacement, status: Replacement["status"]) {
    setBusy(request.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/replacements/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          decisionReason: decisionReasons[request.id],
          logisticsNote: logisticsNotes[request.id],
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Replacement request could not be updated.");
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status, decisionReason: decisionReasons[request.id] ?? null, logisticsNote: logisticsNotes[request.id] ?? null } : item));
      setMessage("Replacement request updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replacement request could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function releaseAllocation(request: Replacement, lineId: string) {
    const note = window.prompt("Why is this exchange-size allocation being released?");
    if (!note) return;
    setBusy(request.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/replacements/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release-allocation", lineId, note }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Exchange allocation could not be released.");
      const updatedRequests = await fetch("/api/admin/replacements", { cache: "no-store" }).then((result) => result.json() as Promise<Replacement[]>);
      setRequests(updatedRequests);
      setMessage("Reserved exchange stock released and audited.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Exchange allocation could not be released.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {(error || message) && <p className={`mb-4 text-sm ${error ? "text-danger" : "text-success"}`} role={error ? "alert" : "status"}>{error || message}</p>}
      <form className="mb-8 grid gap-3 border-b border-border pb-7 sm:grid-cols-2" onSubmit={createException}>
        <h2 className="font-serif text-2xl sm:col-span-2">Create customer exception</h2>
        <label className="text-sm" htmlFor="exceptionOrder">Order ID<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id="exceptionOrder" onChange={(event) => setException((current) => ({ ...current, orderId: event.target.value }))} required value={exception.orderId} /></label>
        <label className="text-sm" htmlFor="exceptionLine">Order line ID<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id="exceptionLine" onChange={(event) => setException((current) => ({ ...current, orderLineId: event.target.value }))} required value={exception.orderLineId} /></label>
        <label className="text-sm" htmlFor="exceptionType">Item type<Select aria-label="Item type" className="mt-1" id="exceptionType" onValueChange={(productType) => setException((current) => ({ ...current, productType }))} options={[{ value: "DESIGNER_DRESS", label: "Designer dress" }, { value: "CUSTOM_DRESS", label: "Custom dress" }]} value={exception.productType} /></label>
        {exception.productType === "DESIGNER_DRESS" ? <>
          <label className="text-sm" htmlFor="exceptionCurrentSize">Current size<Select aria-label="Current size" className="mt-1" id="exceptionCurrentSize" onValueChange={(currentSize) => setException((current) => ({ ...current, currentSize, desiredSize: current.desiredSize === currentSize ? ["XS", "S", "M"].find((size) => size !== currentSize)! : current.desiredSize }))} options={["XS", "S", "M"].map((size) => ({ value: size, label: size }))} value={exception.currentSize} /></label>
          <label className="text-sm" htmlFor="exceptionDesiredSize">Requested exchange size<Select aria-label="Requested exchange size" className="mt-1" id="exceptionDesiredSize" onValueChange={(desiredSize) => setException((current) => ({ ...current, desiredSize }))} options={["XS", "S", "M"].filter((size) => size !== exception.currentSize).map((size) => ({ value: size, label: size }))} value={exception.desiredSize} /></label>
        </> : <label className="text-sm sm:col-span-2" htmlFor="exceptionFit">Fit adjustment<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id="exceptionFit" maxLength={1000} onChange={(event) => setException((current) => ({ ...current, fitCorrection: event.target.value }))} required value={exception.fitCorrection} /></label>}
        <label className="text-sm sm:col-span-2" htmlFor="exceptionReason">Documented exception reason<textarea className="mt-1 min-h-16 w-full border border-border-strong bg-surface px-3 py-2" id="exceptionReason" maxLength={500} onChange={(event) => setException((current) => ({ ...current, reason: event.target.value }))} required value={exception.reason} /></label>
        <label className="text-sm sm:col-span-2" htmlFor="exceptionNotes">Customer notes (optional)<textarea className="mt-1 min-h-16 w-full border border-border-strong bg-surface px-3 py-2" id="exceptionNotes" maxLength={2000} onChange={(event) => setException((current) => ({ ...current, notes: event.target.value }))} value={exception.notes} /></label>
        <button className="min-h-10 w-fit bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy === "exception"} type="submit">{busy === "exception" ? "Creating…" : "Create exception"}</button>
      </form>
      {requests.length === 0 ? <p className="border-t border-border py-7 text-sm text-muted">No replacement requests.</p> : (
        <ul className="divide-y divide-border">
          {requests.map((request) => (
            <li className="py-6" key={request.id}>
              <header className="flex flex-wrap justify-between gap-3">
                <div><h2 className="font-medium">{request.order.orderNumber} · {request.status}</h2><p className="mt-1 text-sm text-muted">{request.order.firstName} {request.order.lastName} · {request.order.email}</p></div>
                <a className="text-sm underline" href={`/admin/orders/${request.order.id}`}>Open order</a>
              </header>
              <p className="mt-4 text-sm"><span className="font-medium">Reason:</span> {request.reason}</p>
              {request.notes && <p className="mt-2 text-sm text-muted">{request.notes}</p>}
              <ul className="mt-3 space-y-2 text-sm">{request.lines.map((line) => <li className="flex flex-wrap items-center gap-3" key={line.id}><span>{line.orderLine.productName} · {line.orderLine.productType === "CUSTOM_DRESS" ? `Fit adjustment: ${line.fitCorrection}` : `Size ${line.orderLine.size} → ${line.desiredSize}`}{line.allocatedVariant && <span className="text-muted"> · {line.allocatedVariant.size} allocated</span>}</span>{line.allocatedVariant && <button className="border border-border-strong px-2 py-1 text-xs disabled:opacity-50" disabled={busy === request.id} onClick={() => void releaseAllocation(request, line.id)} type="button">Release allocation</button>}</li>)}</ul>
              {request.photos.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{request.photos.map((photo) => photo.signedUrl && <a className="border border-border-strong px-3 py-2 text-xs underline" href={photo.signedUrl} key={photo.id} rel="noreferrer" target="_blank">Open customer photo ({photo.mimeType})</a>)}</div>}
              {(request.status === "OPEN" || request.status === "ACCEPTED") && (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {request.status === "OPEN" && <label className="text-sm" htmlFor={`decision-${request.id}`}>Decision/rejection reason<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id={`decision-${request.id}`} maxLength={1000} onChange={(event) => setDecisionReasons((current) => ({ ...current, [request.id]: event.target.value }))} value={decisionReasons[request.id] ?? ""} /></label>}
                  {request.status === "OPEN" && <label className="text-sm" htmlFor={`logistics-${request.id}`}>Agreed logistics and customer next steps<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id={`logistics-${request.id}`} maxLength={2000} onChange={(event) => setLogisticsNotes((current) => ({ ...current, [request.id]: event.target.value }))} value={logisticsNotes[request.id] ?? ""} /></label>}
                  <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                    {request.status === "OPEN" && <><button className="min-h-10 bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy === request.id || !logisticsNotes[request.id]} onClick={() => void update(request, "ACCEPTED")} type="button">Accept</button><button className="min-h-10 border border-danger px-4 text-sm text-danger disabled:opacity-50" disabled={busy === request.id || !decisionReasons[request.id]} onClick={() => void update(request, "REJECTED")} type="button">Reject</button></>}
                    {request.status === "ACCEPTED" && <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={busy === request.id} onClick={() => void update(request, "RESOLVED")} type="button">Mark resolved / re-dispatched</button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}