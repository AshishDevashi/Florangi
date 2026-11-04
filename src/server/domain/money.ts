const RUPEE_AMOUNT_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function parseRupeesToPaise(value: string): number {
  const match = RUPEE_AMOUNT_PATTERN.exec(value.trim());
  if (!match) throw new RangeError("Amount must be a non-negative rupee value with at most two decimals.");

  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? "").padEnd(2, "0"));
  const totalPaise = rupees * 100 + paise;
  if (!Number.isSafeInteger(totalPaise)) throw new RangeError("Amount exceeds the supported range.");
  return totalPaise;
}

export function formatPaise(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new RangeError("Amount must be a non-negative integer number of paise.");
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amountPaise / 100);
}