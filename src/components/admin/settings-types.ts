import type { MeasurementRanges } from "@/server/domain/measurements";

export type MeasurementRangeInputs = Partial<Record<keyof MeasurementRanges, { min?: number; max?: number }>>;
export type SettingsValues = {
  shippingFeePaise: number;
  shippingFreeThresholdPaise: number;
  customizationMinPaise: number;
  customizationMaxPaise: number;
  replacementWindowHours: number;
  lowStockThreshold: number;
  measurementRanges: MeasurementRangeInputs;
};
export const settingKeys = ["shipping_fee_paise", "shipping_free_threshold_paise", "customization_fee_limits_paise", "replacement_window_hours", "measurement_ranges", "low_stock_threshold"] as const;
export type SettingKey = typeof settingKeys[number];
export type SettingMetadata = { version: number; effectiveAt: string; isDevDefault: boolean };
export type SettingsMetadata = Partial<Record<SettingKey, SettingMetadata>>;

export const measurementFields: Array<{ key: keyof MeasurementRanges; label: string; step: string; unit: string }> = [
  { key: "bust", label: "Bust", step: "0.1", unit: "in" },
  { key: "underbust", label: "Underbust", step: "0.1", unit: "in" },
  { key: "waist", label: "Waist", step: "0.1", unit: "in" },
  { key: "hips", label: "Hips", step: "0.1", unit: "in" },
  { key: "dressLength", label: "Dress length", step: "0.1", unit: "in" },
  { key: "heightFeet", label: "Height (feet)", step: "1", unit: "ft" },
  { key: "heightInches", label: "Height (additional inches)", step: "0.1", unit: "in" },
];
