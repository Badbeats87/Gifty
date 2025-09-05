# Gifty

Digital gift cards for local businesses.  
Customers buy a gift, businesses get paid via **Stripe Connect**, and staff can redeem codes at the counter.

---

## Features (MVP)

### Customer
- Public homepage that lists businesses.
- Public business page at `/b/[slug]` with a simple purchase form.
- Stripe Checkout for payments.
- Success page (`/success`) issues a code and emails it.
- (Planned) Public card lookup `/card/[code]`.

### Business (merchant)
- Email/password auth (Supabase).
- Dashboard at `/dashboard` with:
  - Business settings, logo upload (Supabase Storage).
  - Connect onboarding (Express).
  - Redemption screen `/dashboard/redeem`.
  - Redemption history `/dashboard/history`.

### Platform
- Fees implemented:
  - Customer **service fee** (on top of gift).
  - **Merchant commission** (deducted from payout).
- Robust fulfill flow that tolerates small schema differences in `gift_cards`.

---

## Tech Stack

- **Next.js 15** (App Router) + TailwindCSS
- **Supabase** (DB, Auth, Storage)
- **Stripe Connect (Express)**
- TypeScript  
- Deploy target: Vercel

---

## Project Structure (key paths)

```

src/
app/
page.tsx                 # Home
success/page.tsx         # Post-checkout fulfillment UI
cancel/page.tsx          # Checkout canceled
b/\[slug]/page.tsx        # Public business page (purchase)
dashboard/(gated)/...    # Merchant dashboard
dashboard/redeem/...     # Redeem a gift code
dashboard/history/...    # Redemption history
api/
checkout/route.ts          # Create Stripe Checkout Session (Connect split)
checkout/fulfill/route.ts  # After success: create gift, send email
stripe/webhook/route.ts    # Minimal dev webhook
lib/
supabase-server.ts
supabase-browser.ts
fees.ts

````

---

## Prerequisites

- Node **≥ 20.9** (Next.js 15 requirement)
- Stripe account (test mode is fine)
- Supabase project

> If you’re using `asdf`:  
> `asdf install nodejs latest` then `asdf local nodejs <installed-version>`

---

## Setup

1) **Install**

```bash
npm install
````

2. **Environment**

Copy example env and fill values:

```bash
cp .env.example .env.local
```

`.env.example` contains:

```dotenv
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Stripe ---
STRIPE_SECRET_KEY=
# Optional in dev (from `stripe listen`)
STRIPE_WEBHOOK_SECRET=

# App URL (success/cancel URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Fees (optional; sensible defaults if unset) ---
SERVICE_FEE_PCT=0.06
MERCHANT_COMMISSION_PCT=0.10

# --- Email (Resend) ---
# For dev, Resend supports onboarding@resend.dev as a sender.
RESEND_API_KEY=
RESEND_FROM="Gifty <onboarding@resend.dev>"
```

3. **Supabase**

* Create tables: `businesses`, `gift_cards`, `redemptions` (and enable RLS + policies).
* Create a public storage bucket: `logos`.
* (Optional) RPCs used in the dashboard:
  `now()`, `get_business_public`, `get_gift_card_public`, `redeem_gift_card`, `list_redemptions`.
* Normalize `gift_cards` across environments (adds/backs-fills required columns):

```bash
psql "$SUPABASE_DATABASE_URL" -f supabase-gift_cards-normalize-2025-09-05.sql
```

What this migration does (idempotent):

* Ensures columns: `code`, `business_id`, `amount_cents`,
  `initial_amount_cents`, `remaining_amount_cents`, `buyer_email`, `recipient_email`, `currency`.
* Sets defaults/backfills (`currency = 'USD'`, initial/remaining from amount).
* Adds unique constraint on `code`.
* Adds FK to `businesses(id)` if missing.
* Removes legacy `balance_cents` if present.

4. **Stripe (local webhooks)**

```bash
stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook
```

> You’ll see a `whsec_...` signing secret. Put it in `.env.local` as `STRIPE_WEBHOOK_SECRET`.

---

## Run

```bash
npm run dev
```

* Visit `http://localhost:3000/`
* Open a business page (`/b/<uuid>`), enter an amount, and pay with a Stripe test card.
* After redirect to `/success`, you’ll see the gift code and (in dev):

  * email sent via Resend **or**
  * a console log of the email if Resend isn’t configured.

---

## Fees (how money flows)

* **Customer pays**: `gift + service fee`
* **Stripe splits** the payment:

  * **transfer\_data.destination** → merchant Connect account
  * **application\_fee\_amount** → platform (service fee + merchant commission)

You can tune these in `.env.local`:

```dotenv
SERVICE_FEE_PCT=0.06
MERCHANT_COMMISSION_PCT=0.10
```

---

## Notes / Troubleshooting

* If Next.js complains about `cookies()` or `params`, ensure you’re on Next 15 and using the provided server/browser Supabase helpers.
* If you get “column X does not exist” from Supabase during fulfillment, run the normalization SQL above.
* If emails don’t arrive in dev, set:

  ```dotenv
  RESEND_API_KEY=...
  RESEND_FROM="Gifty <onboarding@resend.dev>"
  ```

  or check the server logs for `[email-dev] ... would send:` messages.

---

## License

MIT
EOF
