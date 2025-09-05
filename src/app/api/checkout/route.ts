// src/app/api/checkout/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a Stripe Checkout Session for buying a gift with Connect split.
 * Body JSON:
 * - business_id: string (required)
 * - amountUsd: number (required, whole USD)
 * - buyerEmail: string (required)
 * - recipientEmail: string (optional)
 *
 * Flow:
 *  - Customer pays gift + service fee.
 *  - application_fee_amount = service fee + merchant commission.
 *  - transfer_data.destination = merchant's Connect account.
 */

type Json = Record<string, any>;

function computeFees(amountCents: number) {
  const svcPct =
    parseFloat(process.env.SERVICE_FEE_PCT ?? process.env.NEXT_PUBLIC_SERVICE_FEE_PCT ?? "") ||
    0.06; // 6% default (customer)
  const merchantPct = parseFloat(process.env.MERCHANT_COMMISSION_PCT ?? "") || 0.10; // 10% default (merchant)

  const serviceFeeCents = Math.max(0, Math.round(amountCents * svcPct));
  const merchantCommissionCents = Math.max(0, Math.round(amountCents * merchantPct));
  const applicationFeeCents = serviceFeeCents + merchantCommissionCents;

  return { serviceFeeCents, merchantCommissionCents, applicationFeeCents };
}

export async function POST(req: Request) {
  try {
    const body: Json = await req.json().catch(() => ({} as Json));

    const business_id = String(body.business_id ?? "");
    const amountUsd = Number(body.amountUsd ?? 0);
    const buyerEmail = String(body.buyerEmail ?? "");
    const recipientEmail =
      typeof body.recipientEmail === "string" ? String(body.recipientEmail) : "";

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 }
      );
    }
    if (!business_id || !Number.isFinite(amountUsd) || amountUsd <= 0 || !buyerEmail) {
      return Response.json(
        { error: "Missing fields: business_id, amountUsd (>0), buyerEmail are required." },
        { status: 400 }
      );
    }

    // --- Fetch the business via Supabase REST (service role) to get its Stripe Connect account ---
    const restUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/businesses`;
    const restHeaders = {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const bizRes = await fetch(`${restUrl}?id=eq.${encodeURIComponent(business_id)}&select=*`, {
      method: "GET",
      headers: restHeaders,
      cache: "no-store",
    });

    if (!bizRes.ok) {
      const txt = await bizRes.text().catch(() => "");
      return Response.json({ error: `Business lookup failed: ${txt || bizRes.status}` }, { status: 500 });
    }

    const bizArr = (await bizRes.json().catch(() => [])) as Json[];
    const business = bizArr[0];
    if (!business) {
      return Response.json({ error: "Business not found" }, { status: 404 });
    }

    // Try common column names for Connect account id
    const candidates = [
      business.stripe_account_id,
      business.stripe_connect_account_id,
      business.stripe_connected_account,
      business.stripe_connect_id,
      business.stripe_account,
    ].filter((v) => typeof v === "string") as string[];

    const destinationAccount = candidates.find((v) => v.startsWith("acct_"));
    if (!destinationAccount) {
      return Response.json(
        { error: "This business isn’t connected to Stripe. Please connect a Stripe account first." },
        { status: 400 }
      );
    }

    // --- Amounts ---
    const giftAmountCents = Math.round(amountUsd * 100);
    const { serviceFeeCents, merchantCommissionCents, applicationFeeCents } =
      computeFees(giftAmountCents);
    const totalChargeCents = giftAmountCents + serviceFeeCents;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

    // --- Create the session (use dynamic import for Stripe to avoid bundling issues) ---
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalChargeCents,
            product_data: {
              name: business?.name ? `Gift to ${business.name}` : "Digital gift",
              description: "Gift purchased on Gifty",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel`,
      customer_email: buyerEmail,
      allow_promotion_codes: true,

      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: destinationAccount },
        metadata: {
          business_id,
          giftAmountCents: String(giftAmountCents),
          serviceFeeCents: String(serviceFeeCents),
          merchantCommissionCents: String(merchantCommissionCents),
          buyerEmail,
          recipientEmail,
          destinationAccount,
        },
      },

      // duplicate key metadata on the session for convenience
      metadata: {
        business_id,
        amountUsd: String(amountUsd),
        giftAmountCents: String(giftAmountCents),
        serviceFeeCents: String(serviceFeeCents),
        merchantCommissionCents: String(merchantCommissionCents),
        buyerEmail,
        recipientEmail,
        destinationAccount,
      },
    });

    return Response.json({ url: session.url, id: session.id }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: e?.message ?? "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
