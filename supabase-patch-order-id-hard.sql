-- supabase-patch-order-id-hard.sql
-- Force gift_cards.order_id to TEXT even if there are FKs or it's UUID.
-- Idempotent-ish: safe to re-run.

do $$
declare
  fk_name text;
begin
  -- Drop ANY foreign key on gift_cards.order_id
  for fk_name in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema   = tc.table_schema
    where tc.table_schema   = 'public'
      and tc.table_name     = 'gift_cards'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name   = 'order_id'
  loop
    execute format('alter table public.gift_cards drop constraint %I', fk_name);
  end loop;

  -- If column missing, just add as text and bail.
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='gift_cards' and column_name='order_id'
  ) then
    alter table public.gift_cards add column order_id text;
  else
    -- If already text, nothing to do.
    if exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='gift_cards'
         and column_name='order_id' and data_type='text'
    ) then
      -- ensure nullable (webhook always fills it but keep flexible)
      begin
        alter table public.gift_cards alter column order_id drop not null;
      exception when others then null;
      end;
    else
      -- Swap strategy: create temp text column, copy data, drop old, rename.
      begin
        alter table public.gift_cards add column if not exists order_id_text text;
      exception when others then null;
      end;

      -- Copy existing UUIDs to text
      update public.gift_cards set order_id_text = order_id::text where order_id_text is null;

      -- Drop NOT NULL on old column (just in case)
      begin
        alter table public.gift_cards alter column order_id drop not null;
      exception when others then null;
      end;

      -- Drop old column and rename the text column into place
      alter table public.gift_cards drop column order_id;
      alter table public.gift_cards rename column order_id_text to order_id;
      -- leave as NULLABLE; webhook always populates it
    end if;
  end if;
end $$;

-- Refresh Supabase API schema cache immediately so the app sees changes
notify pgrst, 'reload schema';
