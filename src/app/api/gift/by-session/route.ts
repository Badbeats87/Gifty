// src/app/api/gift/by-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("gift_cards")
    .select(
      "code, amount_cents, initial_amount_cents, remaining_amount_cents, currency, buyer_email, recipient_email, business_slug, stripe_checkout_id, status, created_at"
    )
    .eq("stripe_checkout_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  return NextResponse.json({ found: true, gift: data }, { status: 200 });
}
