// src/lib/email.ts
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY not set. Emails will fail.");
}
const resend = new Resend(RESEND_API_KEY || "missing");

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format((amountCents || 0) / 100);
  } catch {
    // Fallback
    return `$${((amountCents || 0) / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export async function sendGiftEmail(input: {
  to: string;
  cc?: string[];
  code: string;
  businessName: string;
  amountCents: number;
  currency: string;
  message?: string;
}) {
  const subject = `Your ${input.businessName} gift card`;
  const prettyAmount = formatAmount(input.amountCents, input.currency);

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#111;">
      <h2 style="margin:0 0 12px 0;">You've received a gift! 🎁</h2>
      <p style="margin:0 0 8px 0;">Business: <strong>${escapeHtml(input.businessName)}</strong></p>
      <p style="margin:0 0 8px 0;">Amount: <strong>${prettyAmount}</strong></p>
      ${
        input.message
          ? `<p style="margin:0 0 8px 0;">Message: <em>${escapeHtml(input.message)}</em></p>`
          : ""
      }
      <p style="margin:16px 0;">Your gift code:</p>
      <div style="font-size:20px; letter-spacing:2px; font-weight:700; border:2px dashed #111; padding:12px 16px; display:inline-block;">
        ${escapeHtml(input.code)}
      </div>
      <p style="margin:16px 0 0 0; font-size:12px; color:#555;">
        Show this code at the business to redeem your gift. Keep it safe.
      </p>
      <hr style="margin:20px 0; border:none; border-top:1px solid #eee;" />
      <p style="margin:0; color:#555; font-size:12px;">Sent by Gifty</p>
    </div>
  `;

  // Use Resend dev sender to avoid domain setup.
  const from = "Gifty <onboarding@resend.dev>";
  try {
    await resend.emails.send({
      from,
      to: [input.to],
      cc: input.cc,
      subject,
      html,
    });
  } catch (e) {
    console.warn("[email] resend send failed (non-fatal):", e);
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
