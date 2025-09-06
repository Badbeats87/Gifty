-- 2025-09-06: Store merchant-side Stripe processing fee and merchant net payout per order

-- Ensure app-fee columns exist (safe if already added)
alter table public.orders
  add column if not exists application_fee_cents integer,
  add column if not exists stripe_app_fee_fee_cents integer,
  add column if not exists stripe_app_fee_net_cents integer;

-- NEW: merchant-side columns (these are what your SELECT just failed on)
alter table public.orders
  add column if not exists merchant_fee_cents integer,
  add column if not exists merchant_net_cents integer;

-- Optional trace columns (handy for debugging/backfills)
alter table public.orders
  add column if not exists merchant_stripe_account_id text,
  add column if not exists merchant_balance_tx_id text;

-- Helpful indexes (safe to re-run)
create index if not exists idx_orders_pi on public.orders (stripe_payment_intent_id);
create index if not exists idx_orders_cs on public.orders (stripe_checkout_session_id);
