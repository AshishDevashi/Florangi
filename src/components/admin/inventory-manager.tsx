"use client";

import { useState, type FormEvent } from "react";

type InventoryVariant = {
  id: string;
  size: "XS" | "S" | "M";
  onHand: number;
  reserved: number;
  product: { name: string; status: string; type: string };
};

export function InventoryManager({ initialVariants, lowStockThreshold }: { initialVariants: InventoryVariant[]; lowStockThreshold: number }) {
  const [variants, setVariants] = useState(initialVariants);
  const [values, setValues] = useState<Record<string, { onHand: string; note: string }>>(
    Object.fromEntries(initialVariants.map((variant) => [variant.id, { onHand: String(variant.onHand), note: "" }])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, variant: InventoryVariant) {
    event.preventDefault();
    setSaving(variant.id);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: variant.id,
        onHand: Number(values[variant.id]?.onHand),
        note: values[variant.id]?.note,
      }),
    });
    const result = await response.json() as { onHand?: number; reserved?: number; error?: string };
    if (!response.ok || result.onHand === undefined || result.reserved === undefined) {
      setError(result.error ?? "Inventory could not be updated.");
      setSaving(null);
      return;
    }
    setVariants((current) => current.map((item) => item.id === variant.id ? { ...item, onHand: result.onHand!, reserved: result.reserved! } : item));
    setValues((current) => ({ ...current, [variant.id]: { ...current[variant.id], onHand: String(result.onHand) } }));
    setMessage("Inventory updated and recorded.");
    setSaving(null);
  }

  return (
    <div>
      {(message || error) && <p className={`mb-4 text-sm ${error ? "text-danger" : "text-success"}`} role={error ? "alert" : "status"}>{error || message}</p>}
      {variants.length === 0 ? <p className="border-t border-border py-6 text-sm text-muted">No designer-dress size variants are configured.</p> : (
        <ul className="divide-y divide-border">
          {variants.map((variant) => {
            const available = variant.onHand - variant.reserved;
            const isLow = available <= lowStockThreshold;
            return (
              <li className="grid gap-4 py-5 md:grid-cols-[1fr_auto]" key={variant.id}>
                <div>
                  <h2 className="font-medium font-sans">{variant.product.name}</h2>
                  <p className="mt-1 text-sm text-muted">Size {variant.size} · {variant.product.status}</p>
                  <p className={`mt-3 text-sm ${isLow ? "font-semibold text-warning" : "text-muted"}`}>
                    {variant.onHand} on hand · {variant.reserved} reserved · {available} available{isLow ? " · Low stock" : ""}
                  </p>
                </div>
                <form className="grid grid-cols-2 gap-3 md:w-[28rem] md:grid-cols-[7rem_1fr_auto] md:items-end" onSubmit={(event) => void save(event, variant)}>
                  <label className="text-sm" htmlFor={`on-hand-${variant.id}`}>Set on hand<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id={`on-hand-${variant.id}`} min={variant.reserved} onChange={(event) => setValues((current) => ({ ...current, [variant.id]: { ...current[variant.id], onHand: event.target.value } }))} required type="number" value={values[variant.id]?.onHand ?? variant.onHand} /></label>
                  <label className="col-span-2 text-sm md:col-span-1" htmlFor={`note-${variant.id}`}>Adjustment note<input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id={`note-${variant.id}`} maxLength={500} onChange={(event) => setValues((current) => ({ ...current, [variant.id]: { ...current[variant.id], note: event.target.value } }))} value={values[variant.id]?.note ?? ""} /></label>
                  <button className="min-h-11 border border-border-strong px-4 text-sm font-semibold hover:border-accent disabled:opacity-50" disabled={saving === variant.id} type="submit">{saving === variant.id ? "Saving…" : "Save"}</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}