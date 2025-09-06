# Admin Dashboard TODO

## ✅ Completed
- **Overview**
  - KPIs: Gross Sales, Platform Revenue, Net Platform Revenue, Merchant Net Payout, Redemption Rate.
  - Exclude test/fixture orders (no application fee) from KPIs.
  - Debug order breakdown + Recent Activity implemented.

- **Merchants**
  - KPIs: Total, Active, Stripe Connected.
  - Table: Name, Stripe, Status, Contact, Created, Actions.
  - High-contrast badges, consistent status colors.

## ⏳ Next
- **Gift Cards page**
  - KPIs: Total issued, Redeemed, Redemption Rate.
  - Table: Code, Business, Buyer, Recipient, Amount, Status, Issued/ Redeemed dates.

- **Transactions page**
  - KPIs: Total transactions, Stripe fees, Net payouts.
  - Table: Payment intent, Amount, Fees, Net, Merchant.

- **Consistency**
  - Shared date filters on all pages (same as Overview).
  - Optional tooltips/help text for KPIs.
  - Styling aligned with brand palette from concept doc.

## 🚀 Future (Optional)
- CSV export for each table.
- Pagination and filters (by merchant, date range).
- Admin actions (e.g., manually mark redemption).
