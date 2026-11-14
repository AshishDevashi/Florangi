"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, Clock3, Info, Package, Ruler, Scissors, ShieldCheck, Truck } from "lucide-react";
import { formatPaise, parseRupeesToPaise } from "@/server/domain/money";
import { SettingEditor } from "./setting-editor";
import { measurementFields, settingKeys, type SettingKey, type SettingMetadata, type SettingsMetadata, type SettingsValues } from "./settings-types";
export type { MeasurementRangeInputs } from "./settings-types";

const inputClass = "mt-2 block min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-rose/30";
const toRupees = (amount: number) => (amount / 100).toFixed(2);
function wholeNumber(value: string, minimum: number, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isSafeInteger(number) || number < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return number;
}
function moneyPreview(value: string) {
  try { return formatPaise(parseRupeesToPaise(value)); } catch { return null; }
}

type Props = { initialValues: SettingsValues; initialMetadata: SettingsMetadata };

export function SettingsManager({ initialValues, initialMetadata }: Props) {
  const [metadata, setMetadata] = useState(initialMetadata);
  const onSaved = (key: SettingKey, setting: SettingMetadata) => setMetadata((current) => ({ ...current, [key]: setting }));
  const devCount = Object.values(metadata).filter((setting) => setting?.isDevDefault).length;
  const missingCount = settingKeys.filter((key) => !metadata[key]).length;
  const rangeDraft = Object.fromEntries(measurementFields.flatMap(({ key }) => [
    [`${key}-min`, initialValues.measurementRanges[key]?.min?.toString() ?? ""],
    [`${key}-max`, initialValues.measurementRanges[key]?.max?.toString() ?? ""],
  ]));
  const moneySections = [
    { id: "shipping-fee", key: "shipping_fee_paise" as const, title: "Shipping fee", fieldLabel: "Shipping fee (₹)", description: "The flat charge applied below the free-shipping threshold.", amount: initialValues.shippingFeePaise },
    { id: "shipping-threshold", key: "shipping_free_threshold_paise" as const, title: "Free shipping threshold", fieldLabel: "Free shipping threshold (₹)", description: "Orders at or above this subtotal receive free shipping.", amount: initialValues.shippingFreeThresholdPaise },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs leading-5 text-muted"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={17} /><p>Save each setting independently. Changes take effect immediately as a new audited version. Existing orders keep their saved policy snapshots.</p></div>
      {(devCount > 0 || missingCount > 0) && <div className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-xs leading-5 text-warning"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div>{devCount > 0 && <p>{devCount} {devCount === 1 ? "setting still uses a development default" : "settings still use development defaults"}. Replace these with owner-approved values before production checkout.</p>}{missingCount > 0 && <p>{missingCount} {missingCount === 1 ? "setting is" : "settings are"} not configured. Review the displayed starting values before saving.</p>}</div></div>}
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">{[
        ["shipping", "Shipping"], ["custom-fees", "Custom fees"], ["replacements", "Replacements"], ["measurements", "Measurements"], ["inventory-alerts", "Inventory"],
      ].map(([id, label]) => <a className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-surface-hover" href={`#${id}`} key={id}>{label}</a>)}</nav>
      <section aria-labelledby="shipping-title" className="scroll-mt-5 space-y-3" id="shipping">
        <div><h2 className="font-serif text-2xl" id="shipping-title">Shipping</h2><p className="mt-1 text-xs leading-5 text-muted">The same shipping rules apply to online payments and cash on delivery.</p></div>
        <div className="grid items-start gap-4 md:grid-cols-2">{moneySections.map(({ id, key, title, fieldLabel, description, amount }) => <SettingEditor buildValue={(draft) => ({ amountPaise: parseRupeesToPaise(draft.amount) })} description={description} headingLevel="h3" icon={Truck} id={id} initialDraft={{ amount: toRupees(amount) }} key={key} metadata={metadata[key]} onSaved={onSaved} settingKey={key} title={title}>{(draft, setField) => <><SettingField helper="Use a non-negative amount with up to two decimal places." id={id + "-amount"} inputMode="decimal" label={fieldLabel} min="0" onChange={(event) => setField("amount", event.target.value)} required step="0.01" value={draft.amount} /><Preview>{moneyPreview(draft.amount) ? `${title === "Shipping fee" ? "Shipping charge" : "Free shipping from"}: ${moneyPreview(draft.amount)}` : "Enter an amount to preview this setting."}</Preview></>}</SettingEditor>)}</div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SettingEditor buildValue={(draft) => { const minPaise = parseRupeesToPaise(draft.min); const maxPaise = parseRupeesToPaise(draft.max); if (minPaise > maxPaise) throw new Error("Minimum customization fee cannot exceed the maximum."); return { minPaise, maxPaise }; }} description="Set the allowed extra fee when creating or updating a custom dress." icon={Scissors} id="custom-fees" initialDraft={{ min: toRupees(initialValues.customizationMinPaise), max: toRupees(initialValues.customizationMaxPaise) }} metadata={metadata.customization_fee_limits_paise} onSaved={onSaved} settingKey="customization_fee_limits_paise" title="Customization fees">
          {(draft, setField) => <><div className="grid gap-4 sm:grid-cols-2"><SettingField id="customization-min" inputMode="decimal" label="Minimum customization fee (₹)" min="0" onChange={(event) => setField("min", event.target.value)} required step="0.01" value={draft.min} /><SettingField id="customization-max" inputMode="decimal" label="Maximum customization fee (₹)" min="0" onChange={(event) => setField("max", event.target.value)} required step="0.01" value={draft.max} /></div><Preview>{moneyPreview(draft.min) && moneyPreview(draft.max) ? `Allowed fee: ${moneyPreview(draft.min)} – ${moneyPreview(draft.max)}, added to the dress base price.` : "Enter both amounts to preview the fee range."}</Preview></>}
        </SettingEditor>
        <SettingEditor buildValue={(draft) => ({ hours: wholeNumber(draft.hours, 1, "Replacement window") })} description="How long a customer can request an eligible replacement after delivery." icon={Clock3} id="replacements" initialDraft={{ hours: String(initialValues.replacementWindowHours) }} metadata={metadata.replacement_window_hours} onSaved={onSaved} settingKey="replacement_window_hours" title="Replacement window">
          {(draft, setField) => <><SettingField helper="This window is saved with new orders. Existing orders retain their original window." id="replacement-hours" inputMode="numeric" label="Replacement window (hours)" min="1" onChange={(event) => setField("hours", event.target.value)} required step="1" value={draft.hours} /><Preview>{draft.hours.trim() && Number.isSafeInteger(Number(draft.hours)) && Number(draft.hours) > 0 ? `${Number(draft.hours)} hours after delivery · ${(Number(draft.hours) / 24).toLocaleString("en-IN", { maximumFractionDigits: 2 })} days` : "Enter a positive whole number of hours."}</Preview></>}
        </SettingEditor>
      </div>
      <SettingEditor buildValue={(draft) => Object.fromEntries(measurementFields.map(({ key, label }) => {
        const min = Number(draft[`${key}-min`]); const max = Number(draft[`${key}-max`]);
        if (!draft[`${key}-min`].trim() || !draft[`${key}-max`].trim() || !Number.isFinite(min) || !Number.isFinite(max)) throw new Error(`Enter both limits for ${label.toLowerCase()}.`);
        if (min > max) throw new Error(`${label} minimum cannot exceed the maximum.`);
        if (key === "heightFeet" && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1)) throw new Error("Height in feet must use positive whole numbers.");
        if (key === "heightInches" && (min < 0 || max >= 12)) throw new Error("Additional height inches must be at least 0 and below 12.");
        return [key, { min, max }];
      }))} description="Inclusive limits for made-to-measure orders. Use owner- or tailor-approved values." icon={Ruler} id="measurements" initialDraft={rangeDraft} metadata={metadata.measurement_ranges} onSaved={onSaved} settingKey="measurement_ranges" title="Measurement ranges">
        {(draft, setField) => <><div className="overflow-hidden rounded-lg border border-border"><div aria-hidden="true" className="grid grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))] gap-3 border-b border-border bg-surface-muted px-3 py-3 text-xs font-medium text-muted"><span>Measurement</span><span>Minimum</span><span>Maximum</span></div><div className="divide-y divide-border">{measurementFields.map(({ key, label, step, unit }) => <fieldset className="grid min-w-0 grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))] items-center gap-3 px-3 py-3" key={key}><legend className="sr-only">{label}</legend><div><p className="text-xs font-medium sm:text-sm">{label}</p><p className="mt-1 text-[10px] text-muted">{unit === "ft" ? "feet" : "inches"}</p></div>{(["min", "max"] as const).map((edge) => <input aria-label={`${label} ${edge === "min" ? "minimum" : "maximum"} (${unit})`} className={inputClass + " mt-0"} id={`${key}-${edge}`} inputMode={key === "heightFeet" ? "numeric" : "decimal"} key={edge} max={key === "heightInches" ? 11.99 : undefined} min={key === "heightFeet" ? 1 : 0} onChange={(event) => setField(`${key}-${edge}`, event.target.value)} required step={step} type="number" value={draft[`${key}-${edge}`]} />)}</fieldset>)}</div></div><Preview>Body measurements use inches. Height combines whole feet with additional inches below 12. Minimum and maximum values are both accepted.</Preview></>}
      </SettingEditor>
      <SettingEditor buildValue={(draft) => ({ availableUnits: wholeNumber(draft.units, 0, "Low-stock threshold") })} description="Choose when a size variant should be marked as low stock in Inventory." icon={Package} id="inventory-alerts" initialDraft={{ units: String(initialValues.lowStockThreshold) }} metadata={metadata.low_stock_threshold} onSaved={onSaved} settingKey="low_stock_threshold" title="Inventory alerts">
        {(draft, setField) => <div className="grid items-start gap-4 sm:grid-cols-2"><SettingField helper="Available stock is on hand minus reservations. Zero is allowed." id="stock-threshold" inputMode="numeric" label="Low-stock threshold (available units)" min="0" onChange={(event) => setField("units", event.target.value)} required step="1" value={draft.units} /><Preview>{draft.units.trim() && Number.isSafeInteger(Number(draft.units)) && Number(draft.units) >= 0 ? `Sizes with ${Number(draft.units)} or fewer available units will be marked as low stock, including out-of-stock sizes.` : "Enter a non-negative whole number of units."}</Preview></div>}
      </SettingEditor>
    </div>
  );
}

function SettingField({ label, helper, id, ...props }: ComponentProps<"input"> & { label: string; helper?: string; id: string }) {
  return <label className="block min-w-0 text-sm font-medium" htmlFor={id}><span>{label}</span><input {...props} aria-describedby={helper ? `${id}-help` : undefined} aria-label={label} className={inputClass} id={id} type="number" />{helper && <span className="mt-2 block text-xs font-normal leading-5 text-muted" id={`${id}-help`}>{helper}</span>}</label>;
}
function Preview({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-xs leading-5 text-muted"><Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />{children}</p>;
}
