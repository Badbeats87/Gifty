-- supabase-commissions.sql
-- Per-business commission overrides + optional connected account mapping
create table if not exists public.business_commissions (
  business_slug text primary key,
  commission_bps integer not null default 500,        -- 5% (500 bps)
  commission_fixed_cents integer not null default 50, -- $0.50
  stripe_account_id text,                             -- acct_... (optional)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_commissions_slug_idx on public.business_commissions (business_slug);
create index if not exists business_commissions_acct_idx on public.business_commissions (stripe_account_id);

-- touch updated_at
create or replace function public.touch_business_commissions()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_business_commissions on public.business_commissions;
create trigger trg_touch_business_commissions
before update on public.business_commissions
for each row execute procedure public.touch_business_commissions();

-- Let the Supabase API see changes immediately
notify pgrst, 'reload schema';
