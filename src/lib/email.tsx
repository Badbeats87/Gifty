// src/lib/email.tsx
import { Resend } from "resend";
import React from "react";
import GiftEmail, { GiftEmailProps } from "../emails/GiftEmail";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM =
  process.env.RESEND_FROM || "Gifty Test <onboarding@resend.dev>";

if (!RESEND_API_KEY) {
  console.warn(
    "[email] RESEND_API_KEY is not set. Emails will fail until you set it in .env.local"
  );
}

const resend = new Resend(RESEND_API_KEY);

export async function sendGiftEmail(to: string, props: GiftEmailProps) {
  const subject = `Your Gifty for ${props.businessName} — code ${props.code}`;

  const result = await resend.emails.send({
    from: RESEND_FROM,
    to,
    subject,
    react: React.createElement(GiftEmail, props),
  });

  return result;
}
