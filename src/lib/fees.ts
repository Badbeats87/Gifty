// src/lib/fees.ts
/**
 * Compute the customer service fee and the merchant commission.
 *
 * Configure via env (defaults in parentheses):
 * - SERVICE_FEE_PCT (0.06)         e.g. "0.06" for 6% (paid by customer)
 * - MERCHANT_COMMISSION_PCT (0.10) e.g. "0.10" for 10% (deducted from business)
 */
export function computeFees(amountCents: number) {
  const svcPct =
    parseFloat(process.env.SERVICE_FEE_PCT ?? process.env.NEXT_PUBLIC_SERVICE_FEE_PCT ?? "") || 0.06;
  const merchantPct =
    parseFloat(process.env.MERCHANT_COMMISSION_PCT ?? "") || 0.10;

  const serviceFeeCents = Math.max(0, Math.round(amountCents * svcPct));
  const merchantCommissionCents = Math.max(0, Math.round(amountCents * merchantPct));
  const applicationFeeCents = serviceFeeCents + merchantCommissionCents;

  return {
    serviceFeeCents,
    merchantCommissionCents,
    applicationFeeCents,
  };
}
