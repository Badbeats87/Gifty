-- supabase/migrations/2025-09-06-gift-codes-unique-and-trigger.sql
-- Generate short, human-friendly, unique gift codes at the DB layer.

-- 1) generator: 8 chars from a no-confusion alphabet, formatted 4-4
create or replace function public.generate_gift_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I, O, 0, 1
  out_code text := '';
  i int;
  idx int;
begin
  for i in 1..8 loop
    -- pick 1..length(alphabet)
    idx := floor(random() * length(alphabet) + 1);
    out_code := out_code || substr(alphabet, idx, 1);
  end loop;
  return substr(out_code, 1, 4) || '-' || substr(out_code, 5, 4);
end;
$$;

comment on function public.generate_gift_code() is
  'Returns a random code like ABCD-EFGH using a no-confusion alphabet.';

-- 2) trigger to assign code if caller didn’t provide one
create or replace function public.gift_cards_before_insert_code_trg()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.generate_gift_code();
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'gift_cards_code_default'
  ) then
    create trigger gift_cards_code_default
    before insert on public.gift_cards
    for each row
    execute function public.gift_cards_before_insert_code_trg();
  end if;
end$$;

-- 3) unique index on gift_cards(code) prevents duplicates
create unique index if not exists gift_cards_code_key
  on public.gift_cards (code);

-- 4) backfill any rows with empty/NULL codes
update public.gift_cards
set code = public.generate_gift_code()
where code is null or btrim(code) = '';
