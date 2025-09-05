// src/lib/db.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Domain types (adjust to your actual tables) ---
export type Business = {
  id: string;
  name: string;
  slug: string;
  stripe_account_id: string | null;
};

// ---------- Helpers for DEV fallback ----------
function titleCase(s: string) {
  return s
    .split(/[-_ ]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function devFallbackBusiness(slug: string): Business | null {
  const acct = process.env.DEV_STRIPE_CONNECTED_ACCOUNT_ID;
  if (!acct) return null;
  return {
    id: `dev-${slug}`,
    name: titleCase(slug),
    slug,
    stripe_account_id: acct,
  };
}
// ----------------------------------------------

export async function getBusinessById(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle<Business>();
  if (error) throw error;
  if (data) return data;

  // DEV fallback: if id looks like "dev-<slug>", hydrate from env
  if (businessId?.startsWith("dev-")) {
    const slug = businessId.slice(4);
    return devFallbackBusiness(slug);
  }
  return null;
}

export async function getBusinessBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Business>();
  if (error) throw error;
  if (data) return data;

  // DEV fallback: use env-provided connected account for this slug
  return devFallbackBusiness(slug);
}

/**
 * Optional: log a checkout intent so we can reconcile later in webhooks.
 * Create the table `checkouts` with columns:
 * id (uuid, default gen_random_uuid()), business_id (uuid), amount_cents (int4),
 * buyer_email (text), recipient_email (text), status (text), stripe_checkout_id (text)
 */
export async function recordCheckoutIntent(input: {
  business_id: string;
  amount_cents: number;
  buyer_email: string;
  recipient_email?: string | null;
  stripe_checkout_id: string;
}) {
  const { error } = await supabaseAdmin.from("checkouts").insert({
    business_id: input.business_id,
    amount_cents: input.amount_cents,
    buyer_email: input.buyer_email,
    recipient_email: input.recipient_email ?? null,
    status: "created",
    stripe_checkout_id: input.stripe_checkout_id,
  });
  if (error) {
    // In dev fallback (no DB row), this could fail due to FK — don't crash checkout.
    console.warn("[db] recordCheckoutIntent failed (non-fatal):", error);
  }
}
