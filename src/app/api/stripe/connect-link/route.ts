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
    if (!businessId) {
      return NextResponse.json({ error: 'businessId required' }, { status: 400 });
    }

    const { data: biz, error: bizErr } = await service
      .from('businesses')
      .select('id, name, slug, stripe_account_id')
      .eq('id', businessId)
      .single();

    if (bizErr || !biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    let accountId = biz.stripe_account_id as string | null;

    if (!accountId) {
      // Create Express account WITHOUT setting business_profile.url
      const acct = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: biz.name || undefined,
          // no url here to avoid Stripe rejecting it
          product_description: 'Digital gift cards redeemable in person',
        },
      });

      accountId = acct.id;

      const { error: updErr } = await service
        .from('businesses')
        .update({ stripe_account_id: accountId })
        .eq('id', biz.id);

      if (updErr) {
        return NextResponse.json({ error: `DB update failed: ${updErr.message}` }, { status: 500 });
      }
    } else {
      // No update call that sets url; keep it minimal
      await stripe.accounts.update(accountId, {
        business_profile: {
          name: biz.name || undefined,
          product_description: 'Digital gift cards redeemable in person',
        },
      });
    }

    const platformUrl =
      (process.env.NEXT_PUBLIC_APP_URL && new URL(process.env.NEXT_PUBLIC_APP_URL).origin) ||
      'https://example.com';

    const link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url: `${platformUrl}/dashboard?stripe=refresh`,
      return_url: `${platformUrl}/dashboard?stripe=return`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error('connect-link error:', e);
    return NextResponse.json({ error: e.message, type: e.type, code: e.code }, { status: 500 });
  }
}
