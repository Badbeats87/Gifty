-- supabase-gift_cards-normalize-2025-09-05.sql
-- Normalize gift_cards schema across environments

set check_function_bodies = off;

-- Ensure required columns exist
alter table if exists public.gift_cards
  add column if not exists code text;

alter table if exists public.gift_cards
  add column if not exists business_id uuid;

alter table if exists public.gift_cards
  add column if not exists amount_cents integer;

alter table if exists public.gift_cards
  add column if not exists initial_amount_cents integer;

alter table if exists public.gift_cards
  add column if not exists remaining_amount_cents integer;

alter table if exists public.gift_cards
  add column if not exists buyer_email text;

alter table if exists public.gift_cards
  add column if not exists recipient_email text;

alter table if exists public.gift_cards
  add column if not exists currency text;

-- Drop legacy/optional column if present to simplify code
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gift_cards'
      and column_name = 'balance_cents'
  ) then
    execute 'alter table public.gift_cards drop column balance_cents';
  end if;
end $$;

-- Populate currency default and set NOT NULL
update public.gift_cards
set currency = 'USD'
where currency is null;

alter table public.gift_cards
  alter column currency set default 'USD';

-- Backfill initial/remaining from amount if missing
update public.gift_cards
set initial_amount_cents = amount_cents
where initial_amount_cents is null and amount_cents is not null;

update public.gift_cards
set remaining_amount_cents = amount_cents
where remaining_amount_cents is null and amount_cents is not null;

-- Constraints: NOT NULL on required columns
alter table public.gift_cards
  alter column code set not null,
  alter column business_id set not null,
  alter column amount_cents set not null,
  alter column initial_amount_cents set not null,
  alter column remaining_amount_cents set not null,
  alter column currency set not null;

-- Unique code (add if missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gift_cards'::regclass
      and conname = 'gift_cards_code_key'
  ) then
    alter table public.gift_cards
      add constraint gift_cards_code_key unique (code);
  end if;
end $$;

-- FK to businesses (add if missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gift_cards'::regclass
      and conname = 'gift_cards_business_id_fkey'
  ) then
    alter table public.gift_cards
      add constraint gift_cards_business_id_fkey
      foreign key (business_id) references public.businesses(id)
      on delete cascade;
  end if;
end $$;

-- Some safety checks
alter table public.gift_cards
  add constraint gift_cards_amount_positive check (amount_cents >= 0) not valid;
alter table public.gift_cards validate constraint gift_cards_amount_positive;

-- Done
