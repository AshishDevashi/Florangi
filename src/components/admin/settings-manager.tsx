"use client";

import { useState, type FormEvent } from "react";
import type { MeasurementRanges } from "@/server/domain/measurements";

export type MeasurementRangeInputs = Partial<Record<keyof MeasurementRanges, { min?: number; max?: number }>>;

type SettingsValues = {
  shippingFeePaise: number;
  shippingFreeThresholdPaise: number;
  customizationMinPaise: number;
  customizationMaxPaise: number;
  replacementWindowHours: number;
  lowStockThreshold: number;
  measurementRanges: MeasurementRangeInputs;
  developmentDefaults: boolean;
};

const measurementFields: Array<{ key: keyof MeasurementRanges; label: string; step: string; unit: string }> = [
  { key: "bust", label: "Bust", step: "0.1", unit: "in" },
  { key: "underbust", label: "Underbust", step: "0.1", unit: "in" },
  { key: "waist", label: "Waist", step: "0.1", unit: "in" },
  { key: "hips", label: "Hips", step: "0.1", unit: "in" },
  { key: "dressLength", label: "Dress length", step: "0.1", unit: "in" },
  { key: "heightFeet", label: "Height (feet)", step: "1", unit: "ft" },
  { key: "heightInches", label: "Height (additional inches)", step: "0.1", unit: "in" },
];

function rupeesFromPaise(amount: number): string {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function SettingsManager({ initialValues }: { initialValues: SettingsValues }) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(key: string, value: unknown) {
    setSaving(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Setting could not be saved.");
      setValues((current) => ({ ...current, developmentDefaults: false }));
      setMessage("A new audited setting version is now effective.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setting could not be saved.");
    } finally {
      setSaving("");
    }
  }

  function saveMoney(event: FormEvent<HTMLFormElement>, key: string, field: "shippingFeePaise" | "shippingFreeThresholdPaise") {
    event.preventDefault();
    const amountPaise = values[field];
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
      setError("Enter a valid non-negative rupee amount with at most two decimal places.");
      return;
    }
    void save(key, { amountPaise });
  }

  const moneySections = [
    { key: "shipping_fee_paise", field: "shippingFeePaise" as const, label: "Shipping fee" },
    { key: "shipping_free_threshold_paise", field: "shippingFreeThresholdPaise" as const, label: "Free shipping threshold" },
  ];

  return (
    <div className="space-y-9">
      {(error || message) && <p className={`text-sm ${error ? "text-red-800" : "text-emerald-800"}`} role={error ? "alert" : "status"}>{error || message}</p>}
      {values.developmentDefaults && <p className="border-l-2 border-amber-700 bg-white px-4 py-3 text-sm text-amber-950">DEV DEFAULT values are active. Replace them with owner-approved policies before production checkout.</p>}

      <section>
        <h2 className="font-serif text-2xl">Shipping charges</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {moneySections.map(({ key, field, label }) => <form className="border-t border-stone-200 pt-4" key={key} onSubmit={(event) => saveMoney(event, key, field)}>
            <label className="block text-sm" htmlFor={field}>{label} (₹)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id={field} inputMode="decimal" onChange={(event) => setValues((current) => ({ ...current, [field]: Number.isFinite(Number(event.target.value)) ? Math.round(Number(event.target.value) * 100) : 0 }))} required step="0.01" type="number" value={rupeesFromPaise(values[field])} /></label>
            <button className="mt-3 min-h-10 border border-stone-300 px-4 text-sm disabled:opacity-50" disabled={Boolean(saving)} type="submit">{saving === key ? "Saving…" : "Save version"}</button>
          </form>)}
        </div>
      </section>

      <section className="border-t border-stone-200 pt-6">
        <h2 className="font-serif text-2xl">Custom dress policy</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={(event) => {
          event.preventDefault();
          void save("customization_fee_limits_paise", { minPaise: values.customizationMinPaise, maxPaise: values.customizationMaxPaise });
        }}>
          <label className="text-sm" htmlFor="customizationMin">Minimum customization fee (₹)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="customizationMin" min="0" onChange={(event) => setValues((current) => ({ ...current, customizationMinPaise: Math.round(Number(event.target.value) * 100) }))} step="0.01" type="number" value={rupeesFromPaise(values.customizationMinPaise)} /></label>
          <label className="text-sm" htmlFor="customizationMax">Maximum customization fee (₹)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="customizationMax" min="0" onChange={(event) => setValues((current) => ({ ...current, customizationMaxPaise: Math.round(Number(event.target.value) * 100) }))} step="0.01" type="number" value={rupeesFromPaise(values.customizationMaxPaise)} /></label>
          <button className="min-h-11 self-end border border-stone-300 px-4 text-sm disabled:opacity-50" disabled={Boolean(saving)} type="submit">{saving === "customization_fee_limits_paise" ? "Saving…" : "Save version"}</button>
        </form>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          void save("replacement_window_hours", { hours: values.replacementWindowHours });
        }}>
          <label className="text-sm" htmlFor="replacementHours">Replacement window (hours)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="replacementHours" min="1" onChange={(event) => setValues((current) => ({ ...current, replacementWindowHours: Number(event.target.value) }))} type="number" value={values.replacementWindowHours} /></label>
          <button className="min-h-11 self-end border border-stone-300 px-4 text-sm disabled:opacity-50" disabled={Boolean(saving)} type="submit">{saving === "replacement_window_hours" ? "Saving…" : "Save version"}</button>
        </form>
      </section>

      <section className="border-t border-stone-200 pt-6">
        <h2 className="font-serif text-2xl">Measurement ranges</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Inclusive values. Height inches must remain below 12. Owner/tailor approval is required before production use.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => {
          event.preventDefault();
          void save("measurement_ranges", values.measurementRanges);
        }}>
          {measurementFields.map(({ key, label, step, unit }) => <fieldset className="border-t border-stone-200 pt-3" key={key}>
            <legend className="text-sm font-medium">{label} ({unit})</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["min", "max"] as const).map((edge) => <label className="text-xs" htmlFor={`${key}-${edge}`} key={edge}>{edge === "min" ? "Minimum" : "Maximum"}<input className="mt-1 block min-h-10 w-full border border-stone-300 bg-white px-2 text-sm" id={`${key}-${edge}`} max={key === "heightInches" ? 11.99 : undefined} min={key === "heightFeet" ? 1 : 0} onChange={(event) => setValues((current) => ({ ...current, measurementRanges: { ...current.measurementRanges, [key]: { ...current.measurementRanges[key], [edge]: event.target.value === "" ? undefined : Number(event.target.value) } } }))} required step={step} type="number" value={values.measurementRanges[key]?.[edge] ?? ""} /></label>)}
            </div>
          </fieldset>)}
          <button className="min-h-11 w-fit self-end border border-stone-300 px-4 text-sm disabled:opacity-50" disabled={Boolean(saving)} type="submit">{saving === "measurement_ranges" ? "Saving…" : "Save ranges version"}</button>
        </form>
      </section>

      <section className="border-t border-stone-200 pt-6">
        <h2 className="font-serif text-2xl">Inventory alerts</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => {
          event.preventDefault();
          void save("low_stock_threshold", { availableUnits: values.lowStockThreshold });
        }}>
          <label className="text-sm" htmlFor="lowStockThreshold">Low stock when available units are at or below<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3 sm:max-w-sm" id="lowStockThreshold" min="0" onChange={(event) => setValues((current) => ({ ...current, lowStockThreshold: Number(event.target.value) }))} type="number" value={values.lowStockThreshold} /></label>
          <button className="min-h-11 border border-stone-300 px-4 text-sm disabled:opacity-50" disabled={Boolean(saving)} type="submit">{saving === "low_stock_threshold" ? "Saving…" : "Save version"}</button>
        </form>
      </section>
    </div>
  );
}