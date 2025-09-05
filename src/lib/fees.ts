// src/lib/fees.ts

/**
 * Simple fee policy for MVP:
 * - Platform fee: 5% + 50¢ (in USD cents)
 * Adjust here later as needed.
 */
export function computeFees(amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be a positive integer (cents).");
  }
  const percent = Math.round(amountCents * 0.05); // 5%
  const fixed = 50; // 50¢
  const applicationFeeAmount = percent + fixed;
  // Guard against pathological small amounts
  const capped = Math.max(0, Math.min(applicationFeeAmount, amountCents - 1));
  return {
    applicationFeeAmount: capped,
    percentComponent: percent,
    fixedComponent: fixed,
  };
}
