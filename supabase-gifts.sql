-- supabase-gifts.sql

create extension if not exists "pgcrypto";

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  business_id uuid,
  business_slug text,
  buyer_email text not null,
  recipient_email text,
  status text not null default 'issued', -- 'issued' | 'redeemed' | 'refunded' (optional)
  stripe_checkout_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists gift_cards_code_idx on public.gift_cards (code);

-- If you saw warnings inserting into "checkouts", make that too:
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
