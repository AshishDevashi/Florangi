export function isReplacementWindowOpen(deliveredAt: Date, now: Date, windowHours: number): boolean {
  if (!Number.isSafeInteger(windowHours) || windowHours < 0) throw new RangeError("Replacement window must be a non-negative whole number of hours.");
  return now.getTime() < deliveredAt.getTime() + windowHours * 60 * 60 * 1000;
}