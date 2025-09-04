import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { businessId } = await req.json();
    if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

    const { data: biz, error: bizErr } = await service
      .from('businesses')
      .select('id, name, stripe_account_id')
      .eq('id', businessId)
      .single();

    if (bizErr || !biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    if (!biz.stripe_account_id) {
      return NextResponse.json({ connected: false, reason: 'no_account' });
    }

    const acct = await stripe.accounts.retrieve(biz.stripe_account_id);

    return NextResponse.json({
      connected: true,
      account_id: acct.id,
      charges_enabled: (acct as any).charges_enabled,
      payouts_enabled: (acct as any).payouts_enabled,
      details_submitted: (acct as any).details_submitted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
