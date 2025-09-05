// src/app/api/admin/commissions/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { DEFAULT_COMMISSION_BPS, DEFAULT_COMMISSION_FIXED_CENTS } from "@/lib/fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  -> list all overrides + defaults
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("business_commissions")
    .select("business_slug, commission_bps, commission_fixed_cents, stripe_account_id, notes, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    defaults: {
      commission_bps: DEFAULT_COMMISSION_BPS,
      commission_fixed_cents: DEFAULT_COMMISSION_FIXED_CENTS,
    },
    overrides: data ?? [],
  });
}

// POST -> upsert one override
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const slug = (body?.business_slug ?? "").toString().trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "business_slug is required" }, { status: 400 });

  const commission_bps = Number.isFinite(+body.commission_bps) ? Math.max(0, Math.floor(+body.commission_bps)) : DEFAULT_COMMISSION_BPS;
  const commission_fixed_cents = Number.isFinite(+body.commission_fixed_cents) ? Math.max(0, Math.floor(+body.commission_fixed_cents)) : DEFAULT_COMMISSION_FIXED_CENTS;
  const stripe_account_id = body.stripe_account_id ? String(body.stripe_account_id) : null;
  const notes = body.notes ? String(body.notes) : null;

  const { data, error } = await supabaseAdmin
    .from("business_commissions")
    .upsert({
      business_slug: slug,
      commission_bps,
      commission_fixed_cents,
      stripe_account_id,
      notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_slug" })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, row: data });
}
