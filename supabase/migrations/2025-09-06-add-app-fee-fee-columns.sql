-- 2025-09-06: Store Stripe fee applied to our application fee (Connect fee)
alter table public.orders
  add column if not exists application_fee_cents integer;

alter table public.orders
  add column if not exists stripe_app_fee_fee_cents integer,
  add column if not exists stripe_app_fee_net_cents integer;

-- helpful indexes already suggested earlier (safe to re-run)
create index if not exists idx_orders_pi on public.orders (stripe_payment_intent_id);
create index if not exists idx_orders_cs on public.orders (stripe_checkout_session_id);
