// src/lib/email.ts
import { Resend } from "resend";
import React from "react";
import GiftEmail from "@/emails/GiftEmail";
import { renderAsync } from "@react-email/render";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendGiftArgs = {
  to: string | string[];
  businessName: string;
  amountUsd: number;
  code: string;
  message?: string;
};

function shortKey(k?: string) {
  return k ? `${k.slice(0, 6)}…${k.slice(-4)}` : "(missing)";
}

export async function sendGiftEmail({
  to,
  businessName,
  amountUsd,
  code,
  message,
}: SendGiftArgs) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = process.env.EMAIL_FROM ?? "Gifty <no-reply@example.com>";
  const redeemUrl = `${appUrl}/card/${encodeURIComponent(code)}`;

  // ✅ Basic env checks + helpful logs (visible in server console)
  if (!process.env.RESEND_API_KEY) {
    throw new Error("CONFIG: Missing RESEND_API_KEY in .env.local");
  }
  console.log("[email] FROM:", from);
  console.log("[email] RESEND_API_KEY:", shortKey(process.env.RESEND_API_KEY));
  console.log("[email] TO:", to);

  // 1) Try a minimal TEXT-ONLY payload (bypasses HTML rendering entirely)
  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: `Your Gifty for ${businessName}`,
      text: `Enjoy $${amountUsd} at ${businessName}.\n\nGift code: ${code}\nRedeem: ${redeemUrl}\n\nMessage: ${message ?? "-"}`,
    });

    if (error) {
      // Throw a very detailed error so we can see what's wrong
      throw new Error(
        `Resend TEXT send failed: ${JSON.stringify(error, null, 2)}`
      );
    }

    // 2) If text-only works, send the nice HTML version (optional)
    const html = await renderAsync(
      React.createElement(GiftEmail, {
        businessName,
        amountUsd,
        code,
        redeemUrl,
        message,
      })
    );

    const htmlResult = await resend.emails.send({
      from,
      to,
      subject: `Your Gifty for ${businessName}`,
      html,
    });

    if (htmlResult.error) {
      throw new Error(
        `Resend HTML send failed: ${JSON.stringify(htmlResult.error, null, 2)}`
      );
    }

    return htmlResult.data ?? data;
  } catch (e: any) {
    // Bubble up EVERYTHING so our route can show it to you
    const detail = {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
    };
    console.error("[email] SEND ERROR", detail);
    throw e;
  }
}
