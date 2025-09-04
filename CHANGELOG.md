# Changelog

All notable changes to **Gifty** are documented here.

---

## [Unreleased]
- Email delivery of gift card codes (via Resend).
- Business page polish (preset amounts, QR codes, branding).
- Admin commission reporting.
- Multi-language support (EN/ES).

---

## [2025-09-04] Initial MVP Complete 🎉
### Added
- **Auth system** (Supabase):
  - Sign up with email + password.
  - Login with password (show/hide toggle).
  - Logout.
  - Forgot password (reset email).
  - Reset password page.
- **Merchant dashboard**:
  - Create/manage businesses.
  - Upload logos (Supabase storage).
  - Stripe Connect Express onboarding.
  - View Stripe payout/charges status.
  - Redeem gift cards via secure RPC.
  - Redemption history view.
- **Customer flow**:
  - Homepage listing businesses.
  - Public business pages (`/b/[slug]`).
  - Stripe Checkout with commission (destination charges).
  - Fulfillment API to issue gift card codes.
  - Success page displays issued code.
  - Public card lookup page (`/card/[code]`).
- **Database (Supabase)**:
  - Tables: `businesses`, `orders`, `gift_cards`, `redemptions`.
  - Row-level security policies for safety.
  - RPCs:
    - `now()`
    - `get_business_public`
    - `get_gift_card_public`
    - `redeem_gift_card`
    - `list_redemptions`
- **Documentation**:
  - README.md with setup instructions, features, roadmap.

### Changed
- Incremental polish across dashboard and auth flows.

### Fixed
- Stripe onboarding URL errors by removing/adjusting `business_profile.url`.
- Node.js version issues (moved to Node 22).

## [2025-09-04] Fulfillment Fixes
### Added
- Order + gift card creation logic aligned with DB schema (`orders`, `gift_cards`).
- Idempotent fulfillment (no duplicate gift cards per session).
- Detailed error messages returned from `/api/checkout/fulfill`.

### Fixed
- `Invalid amount` errors from mismatch between client and API.
- 404 redirect after checkout (now routes back to `/b/[slug]?session_id=...`).
- Gift card insert errors (now uses `*_amount_cents`, `order_id`, `status`).
- Emails now send to recipient + buyer correctly.
