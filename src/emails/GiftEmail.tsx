// src/emails/GiftEmail.tsx
import * as React from "react";

export function GiftEmail({
  businessName,
  amountUsd,
  code,
  redeemUrl,
  message,
}: {
  businessName: string;
  amountUsd: number;
  code: string;
  redeemUrl: string;
  message?: string;
}) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountUsd);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, margin: "24px 0" }}>Your Gifty is here 🎁</h1>
      <p style={{ margin: "12px 0" }}>
        Enjoy <strong>{money}</strong> at <strong>{businessName}</strong>.
      </p>

      {message ? (
        <blockquote style={{ margin: "16px 0", padding: "12px 16px", background: "#f6f7f9", borderLeft: "4px solid #444" }}>
          {message}
        </blockquote>
      ) : null}

      <div style={{ margin: "16px 0", padding: "16px", border: "1px dashed #bbb", borderRadius: 8, textAlign: "center" }}>
        <div style={{ letterSpacing: 2, fontSize: 18 }}>Gift Code</div>
        <div style={{ fontWeight: 700, fontSize: 28, marginTop: 6 }}>{code}</div>
      </div>

      <p style={{ margin: "12px 0" }}>
        Redeem by showing this code at the register, or open the card page:
      </p>
      <p style={{ margin: "8px 0" }}>
        <a href={redeemUrl} style={{ color: "#0a66c2" }}>{redeemUrl}</a>
      </p>

      <hr style={{ margin: "20px 0", border: 0, borderTop: "1px solid #eee" }} />
      <p style={{ color: "#666", fontSize: 12 }}>
        Sent by Gifty • If you didn’t expect this, you can ignore this email.
      </p>
    </div>
  );
}

export default GiftEmail;
