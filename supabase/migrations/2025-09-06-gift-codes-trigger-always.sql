-- supabase/migrations/2025-09-06-gift-codes-trigger-always.sql
-- Always assign a fresh human-friendly gift code on INSERT,
-- ignoring any code passed by the application.

-- Reuse the same function name the trigger already calls, but change its body.
create or replace function public.gift_cards_before_insert_code_trg()
returns trigger
language plpgsql
as $$
begin
  -- Always override whatever came in and generate a new code.
  new.code := public.generate_gift_code();
  return new;
end;
$$;

comment on function public.gift_cards_before_insert_code_trg() is
  'Before-insert trigger: always sets a fresh code via generate_gift_code().';

-- Ensure trigger exists and points at this function (idempotent if already created).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'gift_cards_code_default'
  ) then
    create trigger gift_cards_code_default
    before insert on public.gift_cards
    for each row
    execute function public.gift_cards_before_insert_code_trg();
  end if;
end$$;

-- Keep the unique index on code (created in the previous migration).
-- If you didn’t run that migration, uncomment the line below.
-- create unique index if not exists gift_cards_code_key on public.gift_cards (code);
