// src/lib/stripe.ts
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.warn("[stripe] STRIPE_SECRET_KEY missing – webhook/backfill will be no-ops.");
}

export const stripe = key
  ? new Stripe(key, {
      apiVersion: "2024-06-20",
      typescript: true,
    })
  : (null as unknown as Stripe);
