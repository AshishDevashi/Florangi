import { connection } from "next/server";
import { listAdminEffectiveSettings } from "@/server/services/settings";
import { SettingsManager, type MeasurementRangeInputs } from "@/components/admin/settings-manager";

export const instant = false;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(value: unknown, key: string, field: string, fallback: number): number {
  const object = objectValue(value);
  return typeof object[field] === "number" ? object[field] as number : fallback;
}

export default async function AdminSettingsPage() {
  await connection();
  const settings = await listAdminEffectiveSettings();
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const ranges = objectValue(byKey.get("measurement_ranges")?.value) as MeasurementRangeInputs;
  const initialValues = {
    shippingFeePaise: numberField(byKey.get("shipping_fee_paise")?.value, "amountPaise", "amountPaise", 0),
    shippingFreeThresholdPaise: numberField(byKey.get("shipping_free_threshold_paise")?.value, "amountPaise", "amountPaise", 0),
    customizationMinPaise: numberField(byKey.get("customization_fee_limits_paise")?.value, "minPaise", "minPaise", 50000),
    customizationMaxPaise: numberField(byKey.get("customization_fee_limits_paise")?.value, "maxPaise", "maxPaise", 150000),
    replacementWindowHours: numberField(byKey.get("replacement_window_hours")?.value, "hours", "hours", 96),
    lowStockThreshold: numberField(byKey.get("low_stock_threshold")?.value, "availableUnits", "availableUnits", 2),
    measurementRanges: ranges,
    developmentDefaults: settings.some((setting) => setting.isDevDefault),
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Store configuration</p>
      <h1 className="mt-2 font-serif text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Changes create a new effective-dated version. Existing orders retain their saved settings snapshot.</p>
      <div className="mt-7"><SettingsManager initialValues={initialValues} /></div>
    </main>
  );
}