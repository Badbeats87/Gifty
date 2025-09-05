// src/app/api/stripe/webhook/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal Stripe webhook handler for local/dev.
 * - Verifies the signature if STRIPE_WEBHOOK_SECRET is set.
 * - Logs interesting events and returns 200.
 * - No DB imports (avoids dependency on lib/db.ts).
 */
export async function POST(req: Request) {
  try {
    const text = await req.text(); // raw body for signature verification
    const sig = req.headers.get("stripe-signature") || "";

    // If you have a signing secret, verify the payload. Otherwise, accept blindly (dev).
    const secret = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    let event: any;

    if (secret) {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2025-08-27.basil",
      });
      try {
        event = await stripe.webhooks.constructEventAsync(text, sig, secret);
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `Invalid signature: ${err.message}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      // No secret configured—parse as JSON for dev
      event = JSON.parse(text || "{}");
    }

    // Optionally: react to key events
    switch (event?.type) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
      case "transfer.created":
      case "application_fee.created":
        // eslint-disable-next-line no-console
        console.log("[stripe] event:", event.type);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log("[stripe] event:", event?.type ?? "unknown");
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Webhook error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
