"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatPaise } from "@/server/domain/money";

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
  const [collectedAmount, setCollectedAmount] = useState(String(props.totalPaise));
  const [privateNote, setPrivateNote] = useState("");
  const [qcNotes, setQcNotes] = useState<Record<string, string>>({});
  const [measurementInputs, setMeasurementInputs] = useState<Record<string, string>>({});
  const [measurementReasons, setMeasurementReasons] = useState<Record<string, string>>({});

  async function submitAction(action: string, data: Record<string, unknown> = {}) {
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
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order action could not be completed.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function submitRefund() {
    setBusyAction("refund");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${props.orderId}/refund`, { method: "POST" });
      const result = await response.json() as { refund?: { status: string }; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Refund could not be verified.");
      setMessage(result.refund?.status === "PROCESSED" ? "Full refund verified." : "Refund is pending provider verification.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refund could not be verified.");
    } finally {
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
    <section className="border-t border-border pt-7">
      <h2 className="font-serif text-2xl">Actions</h2>
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
      {message && <p className="mt-4 text-sm text-success" role="status">{message}</p>}
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {canApprove && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("approve", { note }); }}>
            <h3 className="font-medium">Approve order</h3>
            <label className="block text-sm" htmlFor="approvalNote">Approval note (optional)<textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="approvalNote" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label>
            <button className="min-h-10 bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Approve</button>
          </form>
        )}
        {canApprove && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("reject", { reason: rejectReason }); }}>
            <h3 className="font-medium">Reject order</h3>
            <label className="block text-sm" htmlFor="rejectReason">Reason<textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="rejectReason" maxLength={1000} onChange={(event) => setRejectReason(event.target.value)} required value={rejectReason} /></label>
            <button className="min-h-10 border border-danger px-4 text-sm text-danger disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Reject and release stock</button>
          </form>
        )}
        {canStartProduction && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("start-production", { customerConfirmed: confirmByPhone, confirmationNote }); }}>
            <h3 className="font-medium">Start custom production</h3>
            <p className="text-xs text-muted">12-hour check ends at {canStartAt}.</p>
            {props.paymentMethod === "COD" && !props.confirmedAt && <>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" checked={confirmByPhone} onChange={(event) => setConfirmByPhone(event.target.checked)} type="checkbox" />Customer confirmed by phone</label>
              <label className="block text-sm" htmlFor="confirmationNote">Confirmation note<textarea className="mt-1 min-h-16 w-full border border-border-strong bg-surface px-3 py-2" id="confirmationNote" maxLength={1000} onChange={(event) => setConfirmationNote(event.target.value)} value={confirmationNote} /></label>
            </>}
            <button className="min-h-10 bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Start production</button>
          </form>
        )}
        {!["IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"].includes(props.fulfillmentStatus) && props.lines.filter((line) => line.productType === "CUSTOM_DRESS").map((line) => (
          <form className="space-y-3 border-t border-border pt-4" key={`measurements-${line.id}`} onSubmit={(event) => {
            event.preventDefault();
            try {
              const values: unknown = JSON.parse(measurementInputs[line.id] ?? "{}");
              void submitAction("correct-measurements", { lineId: line.id, values, reason: measurementReasons[line.id] });
            } catch {
              setError("Enter measurement values as valid JSON.");
            }
          }}>
            <h3 className="font-medium font-sans">Correct measurements · {line.productName}</h3>
            <p className="text-xs text-muted">Each correction is saved as a new version; earlier values are retained.</p>
            <label className="block text-sm" htmlFor={`measurementValues-${line.id}`}>Measurement values (JSON)<textarea className="mt-1 min-h-32 w-full border border-border-strong bg-surface px-3 py-2 font-mono text-xs" id={`measurementValues-${line.id}`} onChange={(event) => setMeasurementInputs((current) => ({ ...current, [line.id]: event.target.value }))} value={measurementInputs[line.id] ?? JSON.stringify(line.measurements ?? {}, null, 2)} /></label>
            <label className="block text-sm" htmlFor={`measurementReason-${line.id}`}>Customer correction reason<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id={`measurementReason-${line.id}`} maxLength={1000} onChange={(event) => setMeasurementReasons((current) => ({ ...current, [line.id]: event.target.value }))} required value={measurementReasons[line.id] ?? ""} /></label>
            <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Save measurement version</button>
          </form>
        ))}
        {props.fulfillmentStatus === "IN_PRODUCTION" && props.lines.filter((line) => line.productType === "CUSTOM_DRESS" && !line.qcCompletedAt).map((line) => (
          <form className="space-y-3 border-t border-border pt-4" key={line.id} onSubmit={(event) => { event.preventDefault(); void submitAction("complete-qc", { lineId: line.id, measuredWithinTolerance: true, qcCardIncluded: true, note: qcNotes[line.id] }); }}>
            <h3 className="font-medium font-sans">QC · {line.productName}</h3>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" required type="checkbox" />Finished garment checked against measurements within ±0.5 inches</label>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" required type="checkbox" />Signed QC card included</label>
            <label className="block text-sm" htmlFor={`qc-${line.id}`}>QC note<textarea className="mt-1 min-h-16 w-full border border-border-strong bg-surface px-3 py-2" id={`qc-${line.id}`} maxLength={1000} onChange={(event) => setQcNotes((current) => ({ ...current, [line.id]: event.target.value }))} required value={qcNotes[line.id] ?? ""} /></label>
            <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Record QC and mark ready</button>
          </form>
        ))}
        {canPackDesigner && props.lines.filter((line) => line.productType === "DESIGNER_DRESS" && !line.isReady).map((line) => (
          <div className="space-y-3 border-t border-border pt-4" key={line.id}>
            <h3 className="font-medium font-sans">Pack · {line.productName}</h3>
            <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} onClick={() => void submitAction("line-ready", { lineId: line.id })} type="button">Mark packed and ready</button>
          </div>
        ))}
        {canShip && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("ship", { courierName: courier, awbNumber: awb, trackingUrl }); }}>
            <h3 className="font-medium">Ship order</h3>
            <label className="block text-sm" htmlFor="courier">Courier<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id="courier" maxLength={120} onChange={(event) => setCourier(event.target.value)} required value={courier} /></label>
            <label className="block text-sm" htmlFor="awb">AWB number<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id="awb" maxLength={120} onChange={(event) => setAwb(event.target.value)} required value={awb} /></label>
            <label className="block text-sm" htmlFor="trackingUrl">Tracking URL (optional)<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id="trackingUrl" onChange={(event) => setTrackingUrl(event.target.value)} type="url" value={trackingUrl} /></label>
            <button className="min-h-10 bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Mark shipped</button>
          </form>
        )}
        {canDeliver && (
          <form className="space-y-3" onSubmit={(event) => void submitDelivered(event)}>
            <h3 className="font-medium">Record delivery</h3>
            <label className="block text-sm" htmlFor="deliveredAt">Delivered at (leave blank for now)<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id="deliveredAt" name="deliveredAt" type="datetime-local" /></label>
            <button className="min-h-10 bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Mark delivered</button>
          </form>
        )}
        {canCollectCod && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("cod-collected", { amountPaise: Number(collectedAmount) }); }}>
            <h3 className="font-medium">Collect COD</h3>
            <label className="block text-sm" htmlFor="collectedAmount">Amount (paise)<input className="mt-1 min-h-11 w-full border border-border-strong bg-surface px-3" id="collectedAmount" min="1" onChange={(event) => setCollectedAmount(event.target.value)} required type="number" value={collectedAmount} /></label>
            <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Mark cash collected</button>
          </form>
        )}
        {props.paymentStatus === "REFUND_REQUIRED" && <div className="space-y-3"><h3 className="font-medium">Refund required</h3><button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} onClick={() => void submitRefund()} type="button">{busyAction === "refund" ? "Verifying…" : `Full refund · ${formatPaise(props.totalPaise)}`}</button></div>}
        {canCancel && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAction("cancel", { reason: cancelReason, productionCostWarningAccepted: productionWarningAccepted }); }}>
            <h3 className="font-medium">Cancel order</h3>
            {productionCancellation && <><p className="text-xs text-warning">Cancelling during production may incur unrecoverable custom-dress costs.</p><label className="flex items-start gap-2 text-sm"><input className="mt-1" checked={productionWarningAccepted} onChange={(event) => setProductionWarningAccepted(event.target.checked)} type="checkbox" />I understand custom production costs may not be recoverable.</label></>}
            <label className="block text-sm" htmlFor="cancelReason">Reason<textarea className="mt-1 min-h-16 w-full border border-border-strong bg-surface px-3 py-2" id="cancelReason" maxLength={1000} onChange={(event) => setCancelReason(event.target.value)} required value={cancelReason} /></label>
            <button className="min-h-10 border border-danger px-4 text-sm text-danger disabled:opacity-50" disabled={Boolean(busyAction) || (productionCancellation && !productionWarningAccepted)} type="submit">Cancel and release stock</button>
          </form>
        )}
        <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); void submitAction("note", { body: privateNote }).then((success) => { if (success) setPrivateNote(""); }); }}>
          <h3 className="font-medium">Internal note</h3>
          <label className="block text-sm" htmlFor="privateNote">Visible to admins only<textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="privateNote" maxLength={4000} onChange={(event) => setPrivateNote(event.target.value)} required value={privateNote} /></label>
          <button className="min-h-10 border border-border-strong px-4 text-sm disabled:opacity-50" disabled={Boolean(busyAction)} type="submit">Add note</button>
        </form>
      </div>
    </section>
  );
}