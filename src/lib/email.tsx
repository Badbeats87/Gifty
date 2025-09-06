// src/lib/email.tsx
import { Resend } from "resend";
import React from "react";
import GiftEmail, { GiftEmailProps } from "../emails/GiftEmail";

/**
 * Modes:
 * - test (default): uses onboarding@resend.dev so emails are deliverable to the
 *   workspace owner address only (e.g., badbeats87@gmail.com).
 * - prod: requires a verified domain and RESEND_FROM to be set.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_MODE = (process.env.RESEND_MODE || "test").toLowerCase();

const FROM_TEST = 'Gifty Test <onboarding@resend.dev>';
const FROM_PROD  = process.env.RESEND_FROM; // e.g. 'Gifty <hello@mail.gifty.app>'

if (!RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY is not set. Emails will fail.");
}

if (RESEND_MODE === "prod" && !FROM_PROD) {
  console.warn(
    "[email] RESEND_MODE=prod but RESEND_FROM is not set. Falling back to test sender."
  );
}

const resend = new Resend(RESEND_API_KEY);

export async function sendGiftEmail(to: string, props: GiftEmailProps) {
  const subject = `Your Gifty for ${props.businessName} — code ${props.code}`;

  // Choose sender based on mode, with safe fallback to test
  const from =
    RESEND_MODE === "prod" && FROM_PROD ? FROM_PROD : FROM_TEST;

  const result = await resend.emails.send({
    from,
    to,
    subject,
    // Let Resend render the email from a React element:
    react: React.createElement(GiftEmail, props),
  });

  return result;
}
