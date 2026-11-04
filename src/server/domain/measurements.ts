import { z } from "zod";

export const measurementsSchema = z.object({
  bust: z.number().finite(),
  underbust: z.number().finite(),
  waist: z.number().finite(),
  hips: z.number().finite(),
  dressLength: z.number().finite(),
  heightFeet: z.number().int().positive(),
  heightInches: z.number().finite().min(0).lt(12),
  fitNotes: z.string().trim().max(1000).optional(),
});

export type CustomMeasurements = z.infer<typeof measurementsSchema>;
export type MeasurementRanges = {
  bust: { min: number; max: number };
  underbust: { min: number; max: number };
  waist: { min: number; max: number };
  hips: { min: number; max: number };
  dressLength: { min: number; max: number };
  heightFeet: { min: number; max: number };
  heightInches: { min: number; max: number };
};

export class MeasurementValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("One or more measurements are invalid.");
    this.name = "MeasurementValidationError";
  }
}

export function parseMeasurementRanges(value: unknown): MeasurementRanges {
  const rangesSchema = z.object({
    bust: z.object({ min: z.number().finite(), max: z.number().finite() }),
    underbust: z.object({ min: z.number().finite(), max: z.number().finite() }),
    waist: z.object({ min: z.number().finite(), max: z.number().finite() }),
    hips: z.object({ min: z.number().finite(), max: z.number().finite() }),
    dressLength: z.object({ min: z.number().finite(), max: z.number().finite() }),
    heightFeet: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
    heightInches: z.object({ min: z.number().finite().min(0), max: z.number().finite().lt(12) }),
  });
  const result = rangesSchema.safeParse(value);
  if (!result.success) throw new Error("Measurement validation ranges are not configured correctly.");
  for (const [field, range] of Object.entries(result.data)) {
    if (range.min > range.max) throw new Error(`Measurement range ${field} has an invalid minimum.`);
  }
  return result.data;
}

export function validateMeasurements(input: unknown, ranges: MeasurementRanges): CustomMeasurements {
  const parsed = measurementsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "measurements"), issue.message]));
    throw new MeasurementValidationError(fieldErrors);
  }

  const fieldErrors: Record<string, string> = {};
  for (const field of ["bust", "underbust", "waist", "hips", "dressLength", "heightFeet", "heightInches"] as const) {
    const value = parsed.data[field];
    const range = ranges[field];
    if (value < range.min || value > range.max) {
      fieldErrors[field] = `Enter a value between ${range.min} and ${range.max}.`;
    }
  }
  if (Object.keys(fieldErrors).length > 0) throw new MeasurementValidationError(fieldErrors);
  return parsed.data;
}