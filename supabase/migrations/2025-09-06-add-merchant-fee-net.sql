-- 2025-09-06: Store merchant-side Stripe processing fee and merchant net payout per order

-- Gross platform app fee fields (safe if already added)
alter table public.orders
  add column if not exists application_fee_cents integer,
  add column if not exists stripe_app_fee_fee_cents integer,
  add column if not exists stripe_app_fee_net_cents integer;

-- NEW: merchant-side fields
-- Stripe fee on the merchant's charge (processing fee taken by Stripe from the connected account)
alter table public.orders
  add column if not exists merchant_fee_cents integer;

-- Net amount that settles to the merchant after Stripe fee and your application fee
alter table public.orders
  add column if not exists merchant_net_cents integer;

-- (Optional, handy for debugging / backfill)
-- The connected account id and the balance transaction id we read these numbers from
alter table public.orders
  add column if not exists merchant_stripe_account_id text,
  add column if not exists merchant_balance_tx_id text;

-- Helpful indexes (safe to re-run)
create index if not exists idx_orders_pi on public.orders (stripe_payment_intent_id);
create index if not exists idx_orders_cs on public.orders (stripe_checkout_session_id);
