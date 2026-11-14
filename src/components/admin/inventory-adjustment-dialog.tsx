"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Info, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { InventoryCounts, InventoryVariant } from "./inventory-types";

type Props = {
  variant: InventoryVariant;
  onClose: () => void;
  onSaved: (counts: InventoryCounts) => void;
  onRefreshed: (variants: InventoryVariant[]) => void;
};
const fieldClass = "mt-2 block min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-rose/30";

export function InventoryAdjustmentDialog({ variant, onClose, onSaved, onRefreshed }: Props) {
  const [quantity, setQuantity] = useState(String(variant.onHand));
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"save" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const nextOnHand = Number(quantity);
  const valid = quantity.trim() !== "" && Number.isSafeInteger(nextOnHand) && nextOnHand >= variant.reserved;
  const delta = nextOnHand - variant.onHand;
  const busy = pending !== null;

  function showError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !valid || delta === 0) return;
    lock.current = true; setPending("save"); setError("");
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: variant.id, onHand: nextOnHand, note: note.trim() }),
      });
      const result = await response.json() as InventoryCounts & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Stock could not be updated. Your entries have been kept.");
      if (!Number.isSafeInteger(result.onHand) || !Number.isSafeInteger(result.reserved) || result.onHand < result.reserved || result.reserved < 0) throw new Error("The adjustment response could not be confirmed. Refresh current counts before trying again.");
      onSaved({ onHand: result.onHand, reserved: result.reserved });
    } catch (caught) { showError(caught, "Stock could not be updated. Check your connection and try again."); }
    finally { lock.current = false; setPending(null); }
  }

  async function refreshCounts() {
    if (lock.current) return;
    lock.current = true; setPending("refresh"); setError("");
    try {
      const response = await fetch("/api/admin/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("Stock could not be refreshed. Your entries have been kept.");
      onRefreshed(await response.json() as InventoryVariant[]);
    } catch (caught) { showError(caught, "Stock could not be refreshed. Check your connection and try again."); }
    finally { lock.current = false; setPending(null); }
  }

  return (
    <Dialog busy={busy} description="Set the total units physically on hand. Reserved units stay protected." initialFocusRef={quantityRef} onClose={onClose} open title="Adjust stock">
      <form className="flex min-h-0 flex-col" onSubmit={save}>
        <div className="space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{variant.product.name}</p><p className="mt-1 text-xs text-muted">Size {variant.size} · {variant.product.status}</p></div><Button aria-label="Refresh current counts" disabled={busy} onClick={() => void refreshCounts()} size="icon" title="Refresh current counts" variant="ghost"><RefreshCw aria-hidden="true" className={pending === "refresh" ? "animate-spin" : ""} size={17} /></Button></div>
          <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface-muted py-3">{[
            { label: "On hand", value: variant.onHand }, { label: "Reserved", value: variant.reserved }, { label: "Available", value: variant.onHand - variant.reserved },
          ].map(({ label, value }) => <div className="px-3" key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
          <fieldset className="space-y-4" disabled={busy}>
            <label className="block text-sm font-medium" htmlFor="inventory-quantity"><span id="inventory-quantity-label">New on-hand quantity</span><input aria-describedby="inventory-quantity-help" aria-labelledby="inventory-quantity-label" className={fieldClass} id="inventory-quantity" inputMode="numeric" min={variant.reserved} onChange={(event) => setQuantity(event.target.value)} ref={quantityRef} required step={1} type="number" value={quantity} /><span className="mt-2 block text-xs font-normal leading-5 text-muted" id="inventory-quantity-help">Enter the new total, rather than the number being added. Minimum: {variant.reserved} reserved {variant.reserved === 1 ? "unit" : "units"}.</span></label>
            <label className="block text-sm font-medium" htmlFor="inventory-note"><span id="inventory-note-label">Adjustment note (optional)</span><textarea aria-describedby="inventory-note-help" aria-labelledby="inventory-note-label" className={`${fieldClass} min-h-20 resize-y`} id="inventory-note" maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Restock received or physical count corrected" rows={2} value={note} /><span className="mt-1.5 block text-xs font-normal text-muted" id="inventory-note-help">Add context for the stock record. Up to 500 characters.</span></label>
          </fieldset>
          <div aria-live="polite" className={`rounded-lg border p-4 ${valid && delta !== 0 ? "border-success-border bg-success-bg" : "border-border bg-surface-muted"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Adjustment preview</p>
            {valid ? <><div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{variant.onHand} on hand</span><ArrowRight aria-hidden="true" size={15} /><span className="font-semibold">{nextOnHand} on hand</span>{delta !== 0 && <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold">{delta > 0 ? "+" : ""}{delta} {Math.abs(delta) === 1 ? "unit" : "units"}</span>}</div><p className="mt-2 text-xs leading-5 text-muted">{delta === 0 ? "Change the quantity to make an adjustment." : `${nextOnHand - variant.reserved} available after this change, based on current reservations.`}</p></> : <p className="mt-2 text-sm text-danger">Enter a whole number of at least {variant.reserved}.</p>}
          </div>
          {error && <p className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted"><Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />Every saved adjustment is audited. Current reservations are checked again when saving.</p>
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4 sm:px-6"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !valid || delta === 0} type="submit" variant="primary">{pending === "save" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Check aria-hidden="true" size={16} />}{pending === "save" ? "Saving…" : "Save adjustment"}</Button></footer>
      </form>
    </Dialog>
  );
}
