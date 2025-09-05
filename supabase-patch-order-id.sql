-- supabase-patch-order-id.sql
-- Make gift_cards.order_id compatible with Stripe IDs (strings like 'pi_…').
-- Drops any FK on order_id (uuid) -> allows changing it to text.

do $$
declare
  fk_name text;
begin
  -- Find any FK constraint on gift_cards.order_id
  select tc.constraint_name
    into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema   = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name   = 'gift_cards'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'order_id'
  limit 1;

  -- Drop the FK if it exists
  if fk_name is not null then
    execute format('alter table public.gift_cards drop constraint %I', fk_name);
  end if;

  -- Ensure column exists
  alter table public.gift_cards
    add column if not exists order_id text;

  -- Allow type change + make column TEXT (if it was UUID)
  begin
    alter table public.gift_cards alter column order_id drop not null;
  exception when others then
    null; -- ignore if already nullable
  end;

  -- If it isn't already TEXT, convert it
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'gift_cards'
      and column_name  = 'order_id'
      and data_type    <> 'text'
  ) then
    alter table public.gift_cards
      alter column order_id type text using order_id::text;
  end if;

  -- You can enforce NOT NULL again if you want, since webhook always writes it:
  -- alter table public.gift_cards alter column order_id set not null;

end $$;

-- Refresh Supabase API schema cache immediately
notify pgrst, 'reload schema';
