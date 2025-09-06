-- supabase/migrations/2025-09-06-add-gift-redemptions.sql
-- Purpose: track single-use redemptions by gift code without altering gift_cards schema.

create table if not exists public.gift_redemptions (
  -- We key by gift code so we don't care what type gift_cards.id is.
  code text primary key,
  redeemed_at timestamptz not null default now(),
  redeemed_by text null,          -- e.g., 'dashboard', user id/email, terminal id
  metadata jsonb null             -- optional: extra info
);

comment on table public.gift_redemptions is
  'One row per redeemed gift code. Presence of a row means the gift is redeemed.';

-- Helpful index (PK already indexes code).
create index if not exists gift_redemptions_redeemed_at_idx
  on public.gift_redemptions (redeemed_at desc);

-- (Optional) If you later want to reference businesses or users, add columns here.
-- alter table public.gift_redemptions add column merchant_id uuid null;
-- alter table public.gift_redemptions add constraint gift_redemptions_merchant_fk foreign key (merchant_id) references public.businesses(id);

-- RLS (off by default for service role). Enable/define if you plan client-side access.
-- alter table public.gift_redemptions enable row level security;
