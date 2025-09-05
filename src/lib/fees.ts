// src/lib/fees.ts
export type Commission = {
  bps: number; // basis points (500 bps = 5%)
  fixed_cents: number; // flat cents added
};

export const DEFAULT_COMMISSION_BPS = 500; // 5%
export const DEFAULT_COMMISSION_FIXED_CENTS = 50; // $0.50

export function computeApplicationFee(amountCents: number, commission?: Partial<Commission>) {
  const bps = Math.max(0, Math.floor(commission?.bps ?? DEFAULT_COMMISSION_BPS));
  const fixed = Math.max(0, Math.floor(commission?.fixed_cents ?? DEFAULT_COMMISSION_FIXED_CENTS));
  const pct = Math.round((amountCents * bps) / 10_000);
  const fee = Math.max(0, pct + fixed);
  return fee;
}

export function describeCommission(c?: Partial<Commission>) {
  const bps = c?.bps ?? DEFAULT_COMMISSION_BPS;
  const fixed = c?.fixed_cents ?? DEFAULT_COMMISSION_FIXED_CENTS;
  return `${(bps / 100).toFixed(2)}% + ${(fixed / 100).toFixed(2)} ${"USD"}`;
}
