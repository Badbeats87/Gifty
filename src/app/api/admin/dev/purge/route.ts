// src/app/api/admin/dev/purge/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * DEV-ONLY endpoint to purge test data.
 * Tables: orders, gift_cards, stripe_events, stripe_event_errors
 *
 * Safety:
 * - Requires ADMIN_PURGE_ENABLED=true in env, or NODE_ENV !== "production".
 * - Requires header: x-admin-token: <ADMIN_PURGE_TOKEN>
 * - Requires confirm=yes query param.
 *
 * Call example:
 *   curl -X POST "http://localhost:3000/api/admin/dev/purge?confirm=yes" \
 *     -H "x-admin-token: $ADMIN_PURGE_TOKEN"
 */

export const runtime = "nodejs";

const TABLES = [
  "orders",
  "gift_cards",
  "stripe_events",
  "stripe_event_errors",
] as const;

type TableName = (typeof TABLES)[number];

export async function POST(req: Request) {
  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm");
  const token = req.headers.get("x-admin-token") || "";

  const enabled =
    process.env.ADMIN_PURGE_ENABLED === "true" || process.env.NODE_ENV !== "production";

  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Purge disabled. Set ADMIN_PURGE_ENABLED=true to allow." },
      { status: 403 }
    );
  }

  const requiredToken = process.env.ADMIN_PURGE_TOKEN || "";
  if (!requiredToken) {
    return NextResponse.json(
      { ok: false, error: "Missing ADMIN_PURGE_TOKEN in env." },
      { status: 500 }
    );
  }

  if (token !== requiredToken) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized (bad x-admin-token)." },
      { status: 401 }
    );
  }

  if (confirm !== "yes") {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirmation required. Append ?confirm=yes to proceed.",
        tip: 'curl -X POST ".../purge?confirm=yes" -H "x-admin-token: <ADMIN_PURGE_TOKEN>"',
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const results: Record<TableName, { deleted: number; error?: string }> = {
    orders: { deleted: 0 },
    gift_cards: { deleted: 0 },
    stripe_events: { deleted: 0 },
    stripe_event_errors: { deleted: 0 },
  };

  // Supabase requires a filter to delete; we use "id is not null" which matches all rows on our tables.
  for (const table of TABLES) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .delete()
        .not("id", "is", null)
        .select("*", { count: "exact" });

      if (error) {
        results[table].error = error.message;
      } else {
        results[table].deleted = count ?? (data?.length ?? 0);
      }
    } catch (e: any) {
      results[table].error = e?.message ?? String(e);
    }
  }

  return NextResponse.json({ ok: true, results });
}
