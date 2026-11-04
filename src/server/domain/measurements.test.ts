import { describe, expect, it } from "vitest";
import { MeasurementValidationError, validateMeasurements, type MeasurementRanges } from "@/server/domain/measurements";

const ranges: MeasurementRanges = {
  bust: { min: 30, max: 50 },
  underbust: { min: 25, max: 45 },
  waist: { min: 24, max: 48 },
  hips: { min: 32, max: 55 },
  dressLength: { min: 35, max: 65 },
  heightFeet: { min: 4, max: 7 },
  heightInches: { min: 0, max: 11.99 },
};

const valid = {
  bust: 36,
  underbust: 32,
  waist: 30,
  hips: 40,
  dressLength: 55,
  heightFeet: 5,
  heightInches: 6,
};

describe("AT-04: custom measurement validation", () => {
  it("accepts inclusive settings bounds and valid feet-plus-inches height", () => {
    expect(validateMeasurements({ ...valid, bust: 30, heightFeet: 4, heightInches: 0 }, ranges).bust).toBe(30);
  });

  it("rejects missing and out-of-range values with field-specific errors", () => {
    expect(() => validateMeasurements({ ...valid, waist: 90 }, ranges)).toThrow(MeasurementValidationError);
    try {
      validateMeasurements({ ...valid, heightInches: 12 }, ranges);
    } catch (error) {
      expect(error).toBeInstanceOf(MeasurementValidationError);
      expect((error as MeasurementValidationError).fieldErrors.heightInches).toBeTruthy();
    }
    expect(() => validateMeasurements({ bust: 36 }, ranges)).toThrow(MeasurementValidationError);
  });
});