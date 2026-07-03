import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = "The Product Bus <hello@theproductbus.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const LOGO_URL = `${APP_URL}/logo.png`;

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
    ? `<p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;">${message.replace(/\n/g, "<br/>")}</p>`
    : "";

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Proposal: ${proposalTitle}`,
    html: emailWrapper(proposalTitle, `
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;">${greeting}</p>
      ${customMessage}
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 32px 0;">
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
    html: emailWrapper("Proposal opened", `
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;">
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
  to:              string;
  clientName:      string;
  proposalTitle:   string;
  signerName:      string;
  businessName:    string;
  publicUrl:       string;
  customSubject?:  string;
  customMessage?:  string;
}

export async function sendAcceptanceConfirmationToClient({
  to, clientName, proposalTitle, signerName, businessName, publicUrl,
  customSubject, customMessage,
}: AcceptanceClientParams) {
  const subject = customSubject
    ? customSubject.replace("{title}", proposalTitle)
    : `You accepted: ${proposalTitle}`;

  const bodyParagraph = customMessage
    ? `<p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;">${customMessage.replace(/\n/g, "<br/>").replace("{title}", proposalTitle).replace("{business}", businessName)}</p>`
    : `<p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;">
        This confirms your acceptance of <strong>${proposalTitle}</strong> from ${businessName}.
        Your electronic signature has been recorded with a timestamp.
      </p>`;

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject,
    html: emailWrapper("Proposal accepted", `
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;">Hi ${clientName || signerName},</p>
      ${bodyParagraph}
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 32px 0;">
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
    ? `<p style="font-size:15px;color:#2D2A26;margin:0 0 8px 0;">Value: <strong>${currency} ${totalValue.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>`
    : "";

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [ownerEmail],
    subject: `Accepted: ${proposalTitle}`,
    html: emailWrapper("Proposal accepted", `
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;">Great news.</p>
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;">
        <strong>${signerName || clientName || "Your client"}</strong> has accepted
        <strong>${proposalTitle}</strong>.
      </p>
      <div style="background:#FFE9A0;border:1.5px solid #1A1A1A;border-radius:10px;padding:16px 20px;margin:0 0 24px 0;">
        <p style="font-size:15px;color:#2D2A26;margin:0 0 8px 0;">Signed by: <strong>${signerName}</strong></p>
        ${valueText}
        <p style="font-size:13px;color:#6b7280;margin:0;">Accepted at: ${acceptedAt}</p>
      </div>
      ${ctaButton(editUrl, "View Proposal")}
    `),
  });

  if (error) console.error("Failed to send owner acceptance notification:", error.message);
}

// ─── Follow-up email to client ────────────────────────────────────────────────

interface FollowUpEmailParams {
  to:            string;
  clientName:    string;
  proposalTitle: string;
  publicUrl:     string;
  senderName?:   string;
  message?:      string;
}

export async function sendFollowUpEmail({
  to, clientName, proposalTitle, publicUrl, senderName, message,
}: FollowUpEmailParams) {
  const greeting      = clientName ? `Hi ${clientName},` : "Hi,";
  const customMessage = message
    ? `<p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;">${message.replace(/\n/g, "<br/>")}</p>`
    : "";

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `Following up: ${proposalTitle}`,
    html: emailWrapper("Following up on your proposal", `
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;">${greeting}</p>
      ${customMessage}
      <p style="font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 32px 0;">
        ${senderName ? `${senderName} wanted to follow up` : "Just following up"} on the proposal
        <strong>${proposalTitle}</strong>. You can view it using the link below.
      </p>
      ${ctaButton(publicUrl, "View Proposal")}
      ${fallbackLink(publicUrl)}
    `),
  });

  if (error) throw new Error(`Failed to send follow-up email: ${error.message}`);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Montserrat:wght@600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#FAF1DD;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#2D2A26;">
  <div style="max-width:560px;margin:40px auto;background:#FFFCF4;border:1.5px solid #1A1A1A;border-radius:14px;overflow:hidden;">
    <div style="background:#FBD34D;padding:22px 40px;border-bottom:1.5px solid #1A1A1A;">
      <img src="${LOGO_URL}" alt="The Product Bus" height="30" style="display:block;border:0;height:30px;width:auto;" />
    </div>
    <div style="padding:32px 40px;">
      <h1 style="margin:0 0 20px 0;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.2;color:#1A1A1A;">${title}<span style="color:#FBD34D;">.</span></h1>
      ${body}
    </div>
    <div style="padding:18px 40px;border-top:1px solid #F1E2C0;">
      <p style="font-size:12px;color:#6B6258;margin:0;">The Product Bus · Melbourne · theproductbus.com</p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:8px 0 28px 0;">
    <a href="${url}" style="display:inline-block;background:#FBD34D;color:#1A1A1A;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:999px;border:1.5px solid #1A1A1A;box-shadow:4px 4px 0 #1A1A1A;">${label}</a>
  </div>`;
}

function fallbackLink(url: string): string {
  return `<p style="font-size:13px;line-height:1.5;color:#6B6258;margin:0;">
    Or copy this link: <a href="${url}" style="color:#C75B3F;word-break:break-all;">${url}</a>
  </p>`;
}
