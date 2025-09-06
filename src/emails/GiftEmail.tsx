// src/emails/GiftEmail.tsx
import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Img,
  Hr,
  Link,
} from "@react-email/components";

export type GiftEmailProps = {
  code: string;
  amount: number;
  currency: string;
  businessName: string;
  redeemUrl: string;
  /** CID (content_id) of the attached QR image, used as <img src="cid:..."> */
  qrcodeCid: string;
  recipientName?: string;
  message?: string;
  supportEmail?: string;
};

export default function GiftEmail(props: GiftEmailProps) {
  const {
    code,
    amount,
    currency,
    businessName,
    redeemUrl,
    qrcodeCid,
    recipientName,
    message,
    supportEmail = "support@gifty.app",
  } = props;

  const amountFmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

  const preview = `Your Gifty for ${businessName} • code ${code}`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f6f7f9",
          margin: 0,
          padding: "24px 0",
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
          color: "#111827",
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            width: "100%",
            margin: "0 auto",
            background: "#ffffff",
            borderRadius: 12,
            boxShadow:
              "0 1px 1px rgba(0,0,0,0.02), 0 6px 20px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <Section style={{ padding: "24px 24px 8px 24px" }}>
            <Heading as="h2" style={{ margin: 0, fontSize: 22, lineHeight: "28px" }}>
              You’ve received a Gifty 🎁
            </Heading>
            <Text style={{ margin: "8px 0 0 0", color: "#4b5563" }}>
              {recipientName ? `${recipientName}, ` : ""}enjoy <b>{amountFmt}</b> at{" "}
              <b>{businessName}</b>.
            </Text>
          </Section>

          <Hr style={{ borderTop: "1px solid #e5e7eb", margin: 0 }} />

          <Section
            style={{
              padding: "20px 24px",
              display: "flex",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1 }}>
              <Text style={{ margin: "0 0 4px 0", color: "#6b7280" }}>Gift code</Text>
              <div
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 24,
                  letterSpacing: 2,
                  fontWeight: 700,
                  background: "#f3f4f6",
                  padding: "10px 12px",
                  borderRadius: 10,
                  display: "inline-block",
                }}
              >
                {code}
              </div>

              <Text style={{ margin: "12px 0 0 0" }}>
                Show this email at <b>{businessName}</b> or open your card:
                <br />
                <Link href={redeemUrl} style={{ color: "#2563eb" }}>
                  {redeemUrl}
                </Link>
              </Text>
            </div>

            <div style={{ textAlign: "center" }}>
              <Img
                src={`cid:${qrcodeCid}`}
                alt={`QR for ${code}`}
                width="140"
                height="140"
                style={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  display: "block",
                }}
              />
              <Text
                style={{
                  margin: "8px 0 0 0",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Scan to redeem
              </Text>
            </div>
          </Section>

          {message ? (
            <>
              <Hr style={{ borderTop: "1px solid #e5e7eb", margin: 0 }} />
              <Section style={{ padding: "16px 24px" }}>
                <Text style={{ margin: 0, color: "#6b7280" }}>Message</Text>
                <Text style={{ margin: "6px 0 0 0" }}>{message}</Text>
              </Section>
            </>
          ) : null}

          <Hr style={{ borderTop: "1px solid #e5e7eb", margin: 0 }} />

          <Section style={{ padding: "16px 24px 24px 24px" }}>
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
              To redeem: show the code or scan the QR at the business. If you need
              help, contact{" "}
              <Link href={`mailto:${supportEmail}`} style={{ color: "#2563eb" }}>
                {supportEmail}
              </Link>
              .
            </Text>
          </Section>
        </Container>

        <Text
          style={{
            margin: "12px auto 0",
            textAlign: "center",
            fontSize: 12,
            color: "#9ca3af",
          }}
        >
          Gifty • Digital gifts for El Salvador
        </Text>
      </Body>
    </Html>
  );
}
