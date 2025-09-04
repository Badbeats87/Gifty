# Gifty

Gifty is a digital gift card platform for El Salvador.  
It enables customers worldwide to buy gift cards for local businesses (starting with restaurants), while merchants can register, manage, and redeem them easily.

---

## ✨ Features (Current MVP)

### Customer side
- Public homepage showing available businesses that sell gift cards.
- Each business has its own public page (`/b/[slug]`).
- Customers can:
  - Choose an amount.
  - Pay securely via **Stripe Checkout**.
  - Receive a **unique gift card code** after successful payment.
  - View their card balance/status at `/card/[code]`.

### Merchant side
- Businesses can register accounts with **email + password login** (secure Supabase auth).
- Full auth flow:
  - **Sign up**
  - **Login**
  - **Logout**
  - **Forgot password** (reset email)
  - **Password reset page**
- Business dashboard (`/dashboard`):
  - Create/manage businesses.
  - Upload logos (via Supabase Storage).
  - Set up payouts (Stripe Connect Express onboarding).
  - View payout status (charges & payouts enabled).
  - Redeem gift cards (`/dashboard/redeem`).
  - See redemption history (`/dashboard/history`).

### Admin/Platform
- Commission model implemented:
  - Customer pays gift amount.
  - Platform collects a % commission.
  - Net amount goes to the business via Stripe Connect.
- All database tables, RLS, and Supabase functions set up:
  - `businesses`
  - `orders`
  - `gift_cards`
  - `redemptions`
  - Helper RPCs for security & business logic.

---

## 🛠 Tech Stack

- **Frontend:** Next.js 15 (App Router) + TailwindCSS
- **Backend:** Next.js API routes
- **Database/Auth/Storage:** Supabase
- **Payments:** Stripe Connect (Express accounts)
- **Deployment:** Vercel
- **Language:** TypeScript

---

## 📂 Project Structure (key parts)

- `src/app/`  
  - `page.tsx` → homepage listing businesses  
  - `login/`, `signup/`, `forgot/`, `auth/reset/` → full auth flow  
  - `dashboard/` → merchant dashboard  
  - `dashboard/redeem/` → redeem gift cards  
  - `dashboard/history/` → redemption history  
  - `b/[slug]/` → public business page  
  - `card/[code]/` → public gift card lookup  
- `src/app/api/`  
  - `stripe/connect-link` → onboarding flow  
  - `stripe/status` → check connected account status  
  - `checkout/` → create Stripe Checkout sessions  
  - `checkout/fulfill/` → fulfill order + issue gift card  
  - `redeem/` → redeem gift cards securely  

---

## 🚀 Setup Instructions

1. **Clone & install**
   ```bash
   git clone <repo-url>
   cd gifty
   npm install
   ```

2. **Environment variables** (`.env.local`)
   ```env
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Run dev server**
   ```bash
   npm run dev
   ```

4. **Supabase setup**
   - Create tables: `businesses`, `orders`, `gift_cards`, `redemptions`.
   - Enable RLS and apply policies.
   - Add storage bucket `logos` (public).
   - Add RPCs:
     - `now()`
     - `get_business_public`
     - `get_gift_card_public`
     - `redeem_gift_card`
     - `list_redemptions`

5. **Stripe setup**
   - Create a Connect platform account.
   - Use test mode to onboard businesses.
   - Payments flow: checkout → fulfill → gift card code issued.

---

## 📌 Next Steps

- Email delivery of gift card codes (via Resend).
- Polish business pages with preset gift amounts and branding.
- Add QR codes for redemption.
- Admin reports for commission revenue.
- Multi-language support (English & Spanish).

---

## 🗺 Development Roadmap

### Phase 1 — MVP (✅ completed)
- Secure auth (signup/login/logout/reset).
- Business registration + logo upload.
- Customer purchase flow with Stripe Checkout.
- Gift card issuance + redemption.
- Redemption history for merchants.

### Phase 2 — Customer Experience (🚧 in progress)
- Email gift card delivery (buyer & recipient).
- Branded business pages (logos, descriptions, preset gift amounts).
- Public gift card lookup page.

### Phase 3 — Merchant Tools
- Export redemption & sales reports.
- QR code scanning for redemptions.
- Business profile customization (address, description).

### Phase 4 — Platform/Admin
- Commission revenue dashboard.
- Dispute/refund handling.
- Multi-language support (EN/ES).

### Phase 5 — Growth
- Production deployment on Vercel.
- Custom domain & SEO.
- Marketing tools for businesses.

