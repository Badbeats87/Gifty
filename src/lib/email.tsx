// src/lib/email.tsx
import { Resend } from "resend";
import React from "react";
import QRCode from "qrcode";
import GiftEmail, { GiftEmailProps } from "../emails/GiftEmail";

/**
 * Modes:
 * - test (default): uses onboarding@resend.dev; delivers to workspace owner only.
 * - prod: requires verified domain + RESEND_FROM set.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_MODE = (process.env.RESEND_MODE || "test").toLowerCase();
const FROM_TEST = "Gifty Test <onboarding@resend.dev>";
const FROM_PROD = process.env.RESEND_FROM; // e.g., 'Gifty <hello@mail.gifty.app>'

if (!RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY is not set. Emails will fail.");
}
if (RESEND_MODE === "prod" && !FROM_PROD) {
  console.warn(
    "[email] RESEND_MODE=prod but RESEND_FROM is not set. Falling back to test sender."
  );
}

const resend = new Resend(RESEND_API_KEY);

export async function sendGiftEmail(
  to: string,
  props: Omit<GiftEmailProps, "qrcodeCid">
) {
  const subject = `Your Gifty for ${props.businessName} — code ${props.code}`;
  const from = RESEND_MODE === "prod" && FROM_PROD ? FROM_PROD : FROM_TEST;

  // Generate QR as PNG buffer from the redeem URL
  const qrPngBuffer = await QRCode.toBuffer(props.redeemUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 6,
    type: "png",
  });

  // Resend requires base64 when sending raw content, and camelCase `contentId`
  const qrcodeCid = "gift-qr";
  const base64Png = qrPngBuffer.toString("base64");

  const result = await resend.emails.send({
    from,
    to,
    subject,
    // Inline image via CID; attach as base64 with contentType
    attachments: [
      {
        filename: "qr.png",
        content: base64Png,
        contentType: "image/png",
        contentId: qrcodeCid,
      },
    ],
    // Resend will render the React email for us
    react: React.createElement(GiftEmail, { ...props, qrcodeCid }),
  });

  return result;
}
