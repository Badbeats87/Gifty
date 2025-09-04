import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client that uses the caller's auth token
function supabaseFromRequest(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get('authorization') || '';
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseFromRequest(req);

    // Ensure the caller is signed in
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { businessId, code, amountCents, notes } = body as {
      businessId?: string;
      code?: string;
      amountCents?: number;
      notes?: string;
    };

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }
    const amount = Number(amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amountCents must be > 0' }, { status: 400 });
    }

    // Call the atomic redemption function
    const { data, error } = await supabase.rpc('redeem_gift_card', {
      p_business_id: businessId,
      p_code: code,
      p_amount_cents: amount,
      p_user_id: userId,
      p_notes: notes ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // data is a rowset with the fields we RETURNed in the function
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      gift_card_id: row?.gift_card_id ?? null,
      redemption_id: row?.redemption_id ?? null,
      remaining_after: row?.remaining_after ?? null,
      new_status: row?.new_status ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Redeem failed' }, { status: 500 });
  }
}
