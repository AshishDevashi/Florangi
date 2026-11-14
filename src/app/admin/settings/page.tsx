import { connection } from "next/server";
import { listAdminEffectiveSettings } from "@/server/services/settings";
import { SettingsManager } from "@/components/admin/settings-manager";
import { settingKeys, type MeasurementRangeInputs, type SettingsMetadata } from "@/components/admin/settings-types";

export const instant = false;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(value: unknown, field: string, fallback: number): number {
  const object = objectValue(value);
  return typeof object[field] === "number" ? object[field] as number : fallback;
}

export default async function AdminSettingsPage() {
  await connection();
  const settings = await listAdminEffectiveSettings();
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const ranges = objectValue(byKey.get("measurement_ranges")?.value) as MeasurementRangeInputs;
  const initialValues = {
    shippingFeePaise: numberField(byKey.get("shipping_fee_paise")?.value, "amountPaise", 0),
    shippingFreeThresholdPaise: numberField(byKey.get("shipping_free_threshold_paise")?.value, "amountPaise", 0),
    customizationMinPaise: numberField(byKey.get("customization_fee_limits_paise")?.value, "minPaise", 50000),
    customizationMaxPaise: numberField(byKey.get("customization_fee_limits_paise")?.value, "maxPaise", 150000),
    replacementWindowHours: numberField(byKey.get("replacement_window_hours")?.value, "hours", 96),
    lowStockThreshold: numberField(byKey.get("low_stock_threshold")?.value, "availableUnits", 2),
    measurementRanges: ranges,
  };
  const metadata: SettingsMetadata = {};
  for (const key of settingKeys) {
    const setting = byKey.get(key);
    if (setting) metadata[key] = { version: setting.version, effectiveAt: setting.effectiveAt.toISOString(), isDevDefault: setting.isDevDefault };
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Store configuration</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Settings</h1>
      <div className="mt-4"><SettingsManager initialMetadata={metadata} initialValues={initialValues} /></div>
    </main>
  );
}
