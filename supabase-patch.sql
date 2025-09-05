-- supabase-patch.sql
-- Make existing gift_cards table compatible with current webhook payload.

-- If your table has an order_id column that's NOT NULL, drop that constraint.
-- (Keeps the column; only removes the not-null requirement.)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'gift_cards'
      and column_name  = 'order_id'
  ) then
    -- Drop NOT NULL if present (works for text/uuid/any type)
    execute 'alter table public.gift_cards alter column order_id drop not null';
  end if;
end $$;

-- Ensure core columns exist (idempotent)
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

-- Ask PostgREST (Supabase API) to reload schema cache so changes are immediate
notify pgrst, 'reload schema';
