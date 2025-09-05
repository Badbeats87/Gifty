// src/lib/db.ts
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_COMMISSION_BPS, DEFAULT_COMMISSION_FIXED_CENTS } from "./fees";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[db] Missing Supabase env keys; admin queries will fail.");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Commission settings from DB (business_commissions)
export type CommissionRow = {
  business_slug: string;
  commission_bps: number;
  commission_fixed_cents: number;
  stripe_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCommissionOverrideBySlug(slug: string): Promise<{
  bps: number;
  fixed_cents: number;
  stripe_account_id: string | null;
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("business_commissions")
      .select("business_slug, commission_bps, commission_fixed_cents, stripe_account_id")
      .eq("business_slug", slug)
      .maybeSingle();

    if (error) {
      console.warn("[db] getCommissionOverrideBySlug error:", error.message);
      return null;
    }
    if (!data) return null;

    return {
      bps: data.commission_bps ?? DEFAULT_COMMISSION_BPS,
      fixed_cents: data.commission_fixed_cents ?? DEFAULT_COMMISSION_FIXED_CENTS,
      stripe_account_id: data.stripe_account_id ?? null,
    };
  } catch (e) {
    console.warn("[db] getCommissionOverrideBySlug exception:", e);
    return null;
  }
}
