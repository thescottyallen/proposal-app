import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = "The Product Bus <hello@theproductbus.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ─── Send proposal to client ──────────────────────────────────────────────────

interface SendProposalEmailParams {
  to:            string;
  clientName:    string;
  proposalTitle: string;
  publicUrl:     string;
  senderName?:   string;
  message?:      string;
}

export async function sendProposalEmail({
  to, clientName, proposalTitle, publicUrl, senderName, message,
}: SendProposalEmailParams) {
  const greeting      = clientName ? `Hi ${clientName},` : "Hi,";
  const customMessage = message
    ? `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px 0;">${message.replace(/\n/g, "<br/>")}</p>`
    : "";

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Proposal: ${proposalTitle}`,
    html: emailWrapper(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">${proposalTitle}</h1>
    `, `
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px 0;">${greeting}</p>
      ${customMessage}
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 32px 0;">
        ${senderName ? `${senderName} has` : "A proposal has been"} prepared for you. Click below to view it.
      </p>
      ${ctaButton(publicUrl, "View Proposal")}
      ${fallbackLink(publicUrl)}
    `),
  });

  if (error) throw new Error(`Failed to send email: ${error.message}`);
}

// ─── First-open notification to proposal owner ────────────────────────────────

interface OpenNotificationParams {
  ownerEmail:    string;
  clientName:    string;
  proposalTitle: string;
  proposalId:    string;
}

export async function sendOpenNotification({
  ownerEmail, clientName, proposalTitle, proposalId,
}: OpenNotificationParams) {
  const editUrl = `${APP_URL}/proposals/${proposalId}/edit`;
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [ownerEmail],
    subject: `${clientName || "Your client"} opened "${proposalTitle}"`,
    html: emailWrapper(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">Proposal Opened</h1>
    `, `
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px 0;">
        <strong>${clientName || "Your client"}</strong> just opened your proposal
        <strong>${proposalTitle}</strong> for the first time.
      </p>
      ${ctaButton(editUrl, "View Proposal Activity")}
      ${fallbackLink(editUrl)}
    `),
  });

  if (error) console.error("Failed to send open notification:", error.message);
}

// ─── Acceptance confirmation to client ───────────────────────────────────────

interface AcceptanceClientParams {
  to:            string;
  clientName:    string;
  proposalTitle: string;
  signerName:    string;
  businessName:  string;
  publicUrl:     string;
}

export async function sendAcceptanceConfirmationToClient({
  to, clientName, proposalTitle, signerName, businessName, publicUrl,
}: AcceptanceClientParams) {
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `You accepted: ${proposalTitle}`,
    html: emailWrapper(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">Proposal Accepted</h1>
    `, `
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px 0;">Hi ${clientName || signerName},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px 0;">
        This confirms your acceptance of <strong>${proposalTitle}</strong> from ${businessName}.
        Your electronic signature has been recorded with a timestamp.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 32px 0;">
        You can view the accepted proposal at any time using the link below.
      </p>
      ${ctaButton(publicUrl, "View Accepted Proposal")}
      ${fallbackLink(publicUrl)}
    `),
  });

  if (error) console.error("Failed to send client acceptance confirmation:", error.message);
}

// ─── Acceptance notification to proposal owner ───────────────────────────────

interface AcceptanceOwnerParams {
  ownerEmail:    string;
  clientName:    string;
  signerName:    string;
  proposalTitle: string;
  totalValue:    number | null;
  currency:      string;
  proposalId:    string;
  acceptedAt:    string;
}

export async function sendAcceptanceNotificationToOwner({
  ownerEmail, clientName, signerName, proposalTitle,
  totalValue, currency, proposalId, acceptedAt,
}: AcceptanceOwnerParams) {
  const editUrl   = `${APP_URL}/proposals/${proposalId}/edit`;
  const valueText = totalValue
    ? `<p style="font-size:15px;color:#374151;margin:0 0 8px 0;">Value: <strong>${currency} ${totalValue.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>`
    : "";

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [ownerEmail],
    subject: `Accepted: ${proposalTitle}`,
    html: emailWrapper(`
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">Proposal Accepted</h1>
    `, `
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px 0;">Great news.</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px 0;">
        <strong>${signerName || clientName || "Your client"}</strong> has accepted
        <strong>${proposalTitle}</strong>.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 24px 0;">
        <p style="font-size:15px;color:#374151;margin:0 0 8px 0;">Signed by: <strong>${signerName}</strong></p>
        ${valueText}
        <p style="font-size:13px;color:#6b7280;margin:0;">Accepted at: ${acceptedAt}</p>
      </div>
      ${ctaButton(editUrl, "View Proposal")}
    `),
  });

  if (error) console.error("Failed to send owner acceptance notification:", error.message);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function emailWrapper(header: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#2563eb;padding:32px 40px;">${header}</div>
    <div style="padding:32px 40px;">${body}</div>
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        Sent via The Product Bus proposal platform.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:0 0 32px 0;">
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${label}</a>
  </div>`;
}

function fallbackLink(url: string): string {
  return `<p style="font-size:13px;line-height:1.5;color:#9ca3af;margin:0;">
    Or copy this link: <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
  </p>`;
}
