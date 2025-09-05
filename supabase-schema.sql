-- supabase-schema.sql
-- Minimal schema for Gifty MVP (idempotent; safe to run multiple times)
create extension if not exists "pgcrypto";

-- =========================
-- Checkout intents (used by /api/checkout)
-- =========================
create table if not exists public.checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  buyer_email text not null,
  recipient_email text,
  status text not null default 'created',
  stripe_checkout_id text not null,
  created_at timestamptz not null default now()
);

-- Ensure columns exist if table pre-existed
alter table public.checkouts
  add column if not exists business_id uuid,
  add column if not exists amount_cents integer,
  add column if not exists buyer_email text,
  add column if not exists recipient_email text,
  add column if not exists status text default 'created',
  add column if not exists stripe_checkout_id text,
  add column if not exists created_at timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checkouts_amount_cents_check') then
    alter table public.checkouts add constraint checkouts_amount_cents_check check (amount_cents > 0);
  end if;
end $$;

create index if not exists checkouts_checkout_idx on public.checkouts (stripe_checkout_id);

-- =========================
-- Gift cards issued by webhook
-- =========================
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  business_id uuid,
  business_slug text,
  buyer_email text not null,
  recipient_email text,
  status text not null default 'issued', -- 'issued' | 'redeemed' | 'refunded'
  stripe_checkout_id text not null,
  created_at timestamptz not null default now()
);

-- Ensure columns exist if table pre-existed
alter table public.gift_cards
  add column if not exists code text,
  add column if not exists amount_cents integer,
  add column if not exists currency text default 'usd',
  add column if not exists business_id uuid,
  add column if not exists business_slug text,
  add column if not exists buyer_email text,
  add column if not exists recipient_email text,
  add column if not exists status text default 'issued',
  add column if not exists stripe_checkout_id text,
  add column if not exists created_at timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gift_cards_amount_cents_check') then
    alter table public.gift_cards add constraint gift_cards_amount_cents_check check (amount_cents > 0);
  end if;
end $$;

create index if not exists gift_cards_code_idx on public.gift_cards (code);
create index if not exists gift_cards_status_idx on public.gift_cards (status);

-- Make PostgREST/Supabase API notice schema changes immediately
notify pgrst, 'reload schema';
