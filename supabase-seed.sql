-- supabase-seed.sql
-- Creates minimal tables if missing and seeds one business.
-- Replace acct_XXXXXXXX with your real Stripe Connected Account ID.

-- Enable UUID if needed (Postgres extension name may vary on Supabase)
-- create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Businesses table
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  stripe_account_id text
);

-- Checkouts log (optional but used by the API best-effort)
create table if not exists public.checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  buyer_email text not null,
  recipient_email text,
  status text not null default 'created',
  stripe_checkout_id text not null,
  created_at timestamptz not null default now()
);

-- Seed one example business (Pam's pupusas)
-- IMPORTANT: put your REAL Stripe Connect account id in stripe_account_id (looks like 'acct_1ABC...').
insert into public.businesses (name, slug, stripe_account_id)
values ('Pam''s pupusas', 'pams-pupusas', 'acct_XXXXXXXX')
on conflict (slug) do update
  set name = excluded.name,
      stripe_account_id = excluded.stripe_account_id;
