-- supabase/migrations/2025-09-06-gift-cards-unique-session-id.sql
-- Ensure idempotency: one gift row per Stripe checkout session.

-- Add the column if it doesn't exist (harmless if present)
alter table if exists public.gift_cards
  add column if not exists session_id text;

-- Create a unique partial index so multiple NULLs are allowed,
-- but any non-null session_id must be unique.
create unique index if not exists gift_cards_session_id_key
  on public.gift_cards (session_id)
  where session_id is not null;
