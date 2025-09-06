// src/lib/email.ts
import { Resend } from "resend";
import { render } from "@react-email/render";
import GiftEmail, { GiftEmailProps } from "../emails/GiftEmail";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  // Fail fast in dev; in prod Next will still import this at build time.
  console.warn(
    "[email] RESEND_API_KEY is not set. Emails will fail until you set it in .env.local"
  );
}

const resend = new Resend(RESEND_API_KEY);

export async function sendGiftEmail(to: string, props: GiftEmailProps) {
  const subject = `Your Gifty for ${props.businessName} — code ${props.code}`;
  const html = render(<GiftEmail {...props} />);

  const result = await resend.emails.send({
    from: "Gifty <hello@mail.gifty.app>",
    to,
    subject,
    html,
  });

  return result;
}
