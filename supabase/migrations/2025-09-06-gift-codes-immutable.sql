-- supabase/migrations/2025-09-06-gift-codes-immutable.sql
-- Make gift_cards.code generated-on-insert and immutable on update.

-- (1) Safe generator (if you already created it, this just replaces it)
create or replace function public.generate_gift_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I,O,0,1
  out_code text := '';
  i int;
  idx int;
begin
  for i in 1..8 loop
    idx := floor(random() * length(alphabet) + 1);
    out_code := out_code || substr(alphabet, idx, 1);
  end loop;
  return substr(out_code, 1, 4) || '-' || substr(out_code, 5, 4);
end;
$$;

comment on function public.generate_gift_code() is
  'Returns a random code like ABCD-EFGH using a no-confusion alphabet.';

-- (2) BEFORE INSERT: always assign a new code
create or replace function public.gift_cards_code_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.code := public.generate_gift_code();
  return new;
end;
$$;

-- (3) BEFORE UPDATE: make code immutable (ignore any attempted change)
create or replace function public.gift_cards_code_before_update()
returns trigger
language plpgsql
as $$
begin
  -- If someone tries to change the code, keep the old one.
  if new.code is distinct from old.code then
    new.code := old.code;
  end if;
  return new;
end;
$$;

-- (4) Ensure triggers exist (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'gift_cards_code_ins_trg'
  ) then
    create trigger gift_cards_code_ins_trg
    before insert on public.gift_cards
    for each row
    execute function public.gift_cards_code_before_insert();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'gift_cards_code_upd_trg'
  ) then
    create trigger gift_cards_code_upd_trg
    before update on public.gift_cards
    for each row
    execute function public.gift_cards_code_before_update();
  end if;
end$$;

-- (5) Unique index on code
create unique index if not exists gift_cards_code_key
  on public.gift_cards (code);

-- (6) Backfill any NULL/blank codes (assign fresh)
update public.gift_cards
set code = public.generate_gift_code()
where code is null or btrim(code) = '';
