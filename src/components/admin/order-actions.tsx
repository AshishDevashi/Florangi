"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaise, parseRupeesToPaise } from "@/server/domain/money";

type Line = {
  id: string;
  productName: string;
  productType: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  isReady: boolean;
  qcCompletedAt: string | Date | null;
  measurements: Record<string, unknown> | null;
};

type OrderActionsProps = {
  orderId: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  paymentMethod: "ONLINE" | "COD";
  totalPaise: number;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  lines: Line[];
  hasShipment: boolean;
};

export function OrderActions(props: OrderActionsProps) {
  const router = useRouter();
  const lock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [refreshing, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmByPhone, setConfirmByPhone] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [productionWarningAccepted, setProductionWarningAccepted] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState((props.totalPaise / 100).toFixed(2));
  const [privateNote, setPrivateNote] = useState("");
  const [qcNotes, setQcNotes] = useState<Record<string, string>>({});
  const [measurementInputs, setMeasurementInputs] = useState<Record<string, string>>({});
  const [measurementReasons, setMeasurementReasons] = useState<Record<string, string>>({});

  async function submitAction(action: string, data: Record<string, unknown> = {}) {
    if (lock.current || refreshing) return false;
    lock.current = true;
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${props.orderId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Order action could not be completed.");
      setMessage("Order updated.");
      startTransition(() => router.refresh());
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order action could not be completed.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return false;
    } finally {
      lock.current = false;
      setBusyAction("");
    }
  }

  async function submitRefund() {
    if (lock.current || refreshing) return;
    lock.current = true;
    setBusyAction("refund");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${props.orderId}/refund`, { method: "POST" });
      const result = await response.json() as { refund?: { status: string }; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Refund could not be verified.");
      setMessage(result.refund?.status === "PROCESSED" ? "Full refund verified." : "Refund is pending provider verification.");
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refund could not be verified.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      lock.current = false;
      setBusyAction("");
    }
  }

  async function submitDelivered(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const localDate = String(formData.get("deliveredAt") ?? "");
    await submitAction("delivered", { deliveredAt: localDate ? new Date(localDate).toISOString() : undefined });
  }

  const canApprove = props.fulfillmentStatus === "PENDING_APPROVAL";
  const canStartProduction = props.fulfillmentStatus === "APPROVED" && props.lines.some((line) => line.productType === "CUSTOM_DRESS");
  const canPackDesigner = props.fulfillmentStatus === "APPROVED" || props.fulfillmentStatus === "IN_PRODUCTION";
  const canShip = props.fulfillmentStatus === "READY_TO_SHIP";
  const canDeliver = props.fulfillmentStatus === "SHIPPED";
  const canCancel = ["PENDING_PAYMENT", "PENDING_APPROVAL", "APPROVED", "IN_PRODUCTION", "READY_TO_SHIP"].includes(props.fulfillmentStatus);
  const canCollectCod = props.fulfillmentStatus === "DELIVERED" && props.paymentMethod === "COD" && props.paymentStatus === "COD_PENDING";
  const hasCustom = props.lines.some((line) => line.productType === "CUSTOM_DRESS");
  const productionCancellation = props.fulfillmentStatus === "IN_PRODUCTION" && hasCustom;
  const freezeEnds = new Date(new Date(props.createdAt).getTime() + 12 * 60 * 60 * 1000);
  const canStartAt = freezeEnds.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", timeZoneName: "short" });

  return (
    <section aria-labelledby="order-actions-title" className="space-y-4" id="order-actions">
      <div><h2 className="font-serif text-2xl" id="order-actions-title">Manage order</h2><p className="mt-1 text-xs leading-5 text-muted">Available actions follow the current fulfillment and payment status.</p></div>
      {error && <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger" ref={errorRef} role="alert" tabIndex={-1}><AlertCircle aria-hidden="true" className="shrink-0" size={17} />{error}</p>}
      {message && <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success" role="status"><Check aria-hidden="true" className="shrink-0" size={17} />{message}</p>}
      {(busyAction || refreshing) && <p className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 aria-hidden="true" className="animate-spin" size={16} />{refreshing ? "Refreshing order details…" : "Saving order changes…"}</p>}
      <fieldset className="grid min-w-0 items-start gap-4 md:grid-cols-2" disabled={Boolean(busyAction) || refreshing}><legend className="sr-only">Available order actions</legend>
        {canApprove && (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5 md:col-span-2" onSubmit={(event) => { event.preventDefault(); void submitAction("approve", { note }); }}>
            <h3 className="font-medium">Approve order</h3>
            <label className="block text-sm" htmlFor="approvalNote">Approval note (optional)<textarea aria-label="Approval note (optional)" className="mt-1 min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id="approvalNote" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label>
            <Button variant="primary" disabled={Boolean(busyAction)} type="submit">Approve</Button>
          </form>
        )}

        {canStartProduction && (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void submitAction("start-production", { customerConfirmed: confirmByPhone, confirmationNote }); }}>
            <h3 className="font-medium">Start custom production</h3>
            <p className="text-xs text-muted">12-hour check ends at {canStartAt}.</p>
            {props.paymentMethod === "COD" && !props.confirmedAt && <>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" checked={confirmByPhone} onChange={(event) => setConfirmByPhone(event.target.checked)} type="checkbox" />Customer confirmed by phone</label>
              <label className="block text-sm" htmlFor="confirmationNote">Confirmation note<textarea aria-label="Confirmation note" className="mt-1 min-h-16 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id="confirmationNote" maxLength={1000} onChange={(event) => setConfirmationNote(event.target.value)} value={confirmationNote} /></label>
            </>}
            <Button variant="primary" disabled={Boolean(busyAction)} type="submit">Start production</Button>
          </form>
        )}
        {!["IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"].includes(props.fulfillmentStatus) && props.lines.filter((line) => line.productType === "CUSTOM_DRESS").map((line) => (
          <details className="group min-w-0 overflow-hidden rounded-xl border border-border bg-surface md:col-span-2" key={`measurements-${line.id}`}><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium sm:px-5 [&::-webkit-details-marker]:hidden"><span>Correct measurements · {line.productName}</span><ChevronDown aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" size={16} /></summary><form className="space-y-3 border-t border-border p-4 sm:p-5" onSubmit={(event) => {
            event.preventDefault();
            try {
              const values: unknown = JSON.parse(measurementInputs[line.id] ?? JSON.stringify(line.measurements ?? {}));
              void submitAction("correct-measurements", { lineId: line.id, values, reason: measurementReasons[line.id] });
            } catch {
              setError("Enter measurement values as valid JSON.");
            }
          }}>

            <p className="text-xs text-muted">Each correction is saved as a new version; earlier values are retained.</p>
            <label className="block text-sm" htmlFor={`measurementValues-${line.id}`}>Measurement values (JSON)<textarea aria-label="Measurement values (JSON)" className="mt-1 min-h-32 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2 font-mono text-xs" id={`measurementValues-${line.id}`} onChange={(event) => setMeasurementInputs((current) => ({ ...current, [line.id]: event.target.value }))} value={measurementInputs[line.id] ?? JSON.stringify(line.measurements ?? {}, null, 2)} /></label>
            <label className="block text-sm" htmlFor={`measurementReason-${line.id}`}>Customer correction reason<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id={`measurementReason-${line.id}`} maxLength={1000} onChange={(event) => setMeasurementReasons((current) => ({ ...current, [line.id]: event.target.value }))} required value={measurementReasons[line.id] ?? ""} /></label>
            <Button disabled={Boolean(busyAction)} type="submit">Save measurement version</Button>
          </form></details>
        ))}
        {props.fulfillmentStatus === "IN_PRODUCTION" && props.lines.filter((line) => line.productType === "CUSTOM_DRESS" && !line.qcCompletedAt).map((line) => (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" key={line.id} onSubmit={(event) => { event.preventDefault(); void submitAction("complete-qc", { lineId: line.id, measuredWithinTolerance: true, qcCardIncluded: true, note: qcNotes[line.id] }); }}>
            <h3 className="font-medium font-sans">QC · {line.productName}</h3>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" required type="checkbox" />Finished garment checked against measurements within ±0.5 inches</label>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" required type="checkbox" />Signed QC card included</label>
            <label className="block text-sm" htmlFor={`qc-${line.id}`}>QC note<textarea aria-label="QC note" className="mt-1 min-h-16 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id={`qc-${line.id}`} maxLength={1000} onChange={(event) => setQcNotes((current) => ({ ...current, [line.id]: event.target.value }))} required value={qcNotes[line.id] ?? ""} /></label>
            <Button disabled={Boolean(busyAction)} type="submit">Record QC and mark ready</Button>
          </form>
        ))}
        {canPackDesigner && props.lines.filter((line) => line.productType === "DESIGNER_DRESS" && !line.isReady).map((line) => (
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" key={line.id}>
            <h3 className="font-medium font-sans">Pack · {line.productName}</h3>
            <Button disabled={Boolean(busyAction)} onClick={() => void submitAction("line-ready", { lineId: line.id })} type="button">Mark packed and ready</Button>
          </div>
        ))}
        {canShip && (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void submitAction("ship", { courierName: courier, awbNumber: awb, trackingUrl }); }}>
            <h3 className="font-medium">Ship order</h3>
            <label className="block text-sm" htmlFor="courier">Courier<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id="courier" maxLength={120} onChange={(event) => setCourier(event.target.value)} required value={courier} /></label>
            <label className="block text-sm" htmlFor="awb">AWB number<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id="awb" maxLength={120} onChange={(event) => setAwb(event.target.value)} required value={awb} /></label>
            <label className="block text-sm" htmlFor="trackingUrl">Tracking URL (optional)<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id="trackingUrl" onChange={(event) => setTrackingUrl(event.target.value)} type="url" value={trackingUrl} /></label>
            <Button variant="primary" disabled={Boolean(busyAction)} type="submit">Mark shipped</Button>
          </form>
        )}
        {canDeliver && (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" onSubmit={(event) => void submitDelivered(event)}>
            <h3 className="font-medium">Record delivery</h3><p className="text-xs leading-5 text-muted">Leave the date blank to use the current time. The input uses the timezone of your device.</p>
            <label className="block text-sm" htmlFor="deliveredAt">Delivered at (optional)<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id="deliveredAt" name="deliveredAt" type="datetime-local" /></label>
            <Button variant="primary" disabled={Boolean(busyAction)} type="submit">Mark delivered</Button>
          </form>
        )}
        {canCollectCod && (
          <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); try { void submitAction("cod-collected", { amountPaise: parseRupeesToPaise(collectedAmount) }); } catch { setError("Enter a valid rupee amount with at most two decimals."); } }}>
            <h3 className="font-medium">Collect COD</h3><p className="text-xs leading-5 text-muted">Expected collection: {formatPaise(props.totalPaise)}. Enter the amount in rupees.</p>
            <label className="block text-sm" htmlFor="collectedAmount">Amount collected (₹)<input className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30" id="collectedAmount" inputMode="decimal" min="0.01" step="0.01" onChange={(event) => setCollectedAmount(event.target.value)} required type="number" value={collectedAmount} /></label>
            <Button disabled={Boolean(busyAction)} type="submit">Mark cash collected</Button>
          </form>
        )}
        {props.paymentStatus === "REFUND_REQUIRED" && <div className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"><h3 className="font-medium">Refund required</h3><Button disabled={Boolean(busyAction)} onClick={() => void submitRefund()} type="button">{busyAction === "refund" ? "Verifying…" : `Full refund · ${formatPaise(props.totalPaise)}`}</Button></div>}

        <form className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5 md:col-span-2" onSubmit={(event) => { event.preventDefault(); void submitAction("note", { body: privateNote }).then((success) => { if (success) setPrivateNote(""); }); }}>
          <h3 className="font-medium">Internal note</h3>
          <label className="block text-sm" htmlFor="privateNote">Visible to admins only<textarea aria-label="Visible to admins only" className="mt-1 min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id="privateNote" maxLength={4000} onChange={(event) => setPrivateNote(event.target.value)} required value={privateNote} /></label>
          <Button disabled={Boolean(busyAction)} type="submit">Add note</Button>
        </form>
        {(canApprove || canCancel) && <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
        {canApprove && (
          <details className="group min-w-0 overflow-hidden rounded-xl border border-danger-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-danger sm:px-5 [&::-webkit-details-marker]:hidden">Reject order<ChevronDown aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" size={16} /></summary><form className="space-y-3 border-t border-border p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void submitAction("reject", { reason: rejectReason }); }}>

            <label className="block text-sm" htmlFor="rejectReason">Reason<textarea aria-label="Rejection reason" className="mt-1 min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id="rejectReason" maxLength={1000} onChange={(event) => setRejectReason(event.target.value)} required value={rejectReason} /></label>
            <Button variant="danger" disabled={Boolean(busyAction)} type="submit">Reject and release stock</Button>
          </form></details>
        )}
        {canCancel && (
          <details className="group min-w-0 overflow-hidden rounded-xl border border-danger-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-danger sm:px-5 [&::-webkit-details-marker]:hidden">Cancel order<ChevronDown aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" size={16} /></summary><form className="space-y-3 border-t border-border p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void submitAction("cancel", { reason: cancelReason, productionCostWarningAccepted: productionWarningAccepted }); }}>

            {productionCancellation && <><p className="text-xs text-warning">Cancelling during production may incur unrecoverable custom-dress costs.</p><label className="flex items-start gap-2 text-sm"><input className="mt-1" checked={productionWarningAccepted} onChange={(event) => setProductionWarningAccepted(event.target.checked)} type="checkbox" />I understand custom production costs may not be recoverable.</label></>}
            <label className="block text-sm" htmlFor="cancelReason">Reason<textarea aria-label="Cancellation reason" className="mt-1 min-h-16 w-full rounded-lg border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-rose/30 py-2" id="cancelReason" maxLength={1000} onChange={(event) => setCancelReason(event.target.value)} required value={cancelReason} /></label>
            <Button variant="danger" disabled={Boolean(busyAction) || (productionCancellation && !productionWarningAccepted)} type="submit">Cancel and release stock</Button>
          </form></details>
        )}
        </div>}
      </fieldset>
    </section>
  );
}