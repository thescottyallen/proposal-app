/**
 * Greeting for proposal outreach emails (send, preview, follow-up).
 *
 * These emails greet the person in the To field once. The company / client
 * name is never used — "Hi Tracta," stacked above "Hi Charbel" was the bug.
 * If the custom message already opens with a greeting, no second line is added.
 */

const LEADING_GREETING =
  /^(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening))\b/i;

export function messageStartsWithGreeting(message?: string | null): boolean {
  if (!message) return false;
  return LEADING_GREETING.test(message.trim());
}

/** First name from a contact's full name. Empty when there is no usable name. */
export function contactFirstName(name?: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.replace(/^[,.\s]+|[,.\s]+$/g, "");
}

/**
 * One greeting line, or null when the custom message already greets.
 * Falls back to "Hi," when the recipient has no first name.
 */
export function proposalEmailGreeting(options: {
  recipientName?: string | null;
  message?: string | null;
}): string | null {
  if (messageStartsWithGreeting(options.message)) return null;
  const first = contactFirstName(options.recipientName);
  return first ? `Hi ${first},` : "Hi,";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GREETING_P =
  "font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 16px 0;";
const MESSAGE_P =
  "font-size:15px;line-height:1.6;color:#2D2A26;margin:0 0 24px 0;";

/** Greeting paragraph plus optional custom message. Shared by send, preview, and follow-up. */
export function buildOutreachIntroHtml(options: {
  recipientName?: string | null;
  message?: string | null;
}): string {
  const greeting = proposalEmailGreeting(options);
  const greetingHtml = greeting
    ? `<p style="${GREETING_P}">${escapeHtml(greeting)}</p>`
    : "";

  const raw = options.message ?? "";
  const messageHtml = raw.trim()
    ? `<p style="${MESSAGE_P}">${raw.replace(/\n/g, "<br/>")}</p>`
    : "";

  return `${greetingHtml}${messageHtml}`;
}

export type EmailContact = { name: string; email: string };

/**
 * Person the email is addressed to.
 * Matches the To address against known contacts. Never returns the company name.
 * Linked proposal contact is preferred when several rows share the address.
 */
export function resolveRecipientName(
  to: string,
  contacts: Array<EmailContact | null | undefined>,
): string | null {
  const target = to.trim().toLowerCase();
  if (!target.includes("@")) return null;

  for (const contact of contacts) {
    if (!contact?.email || !contact.name) continue;
    if (contact.email.trim().toLowerCase() !== target) continue;
    const name = contact.name.trim();
    if (name) return name;
  }
  return null;
}

export function recipientNameFromProposal(
  to: string,
  proposal: {
    contact?: EmailContact | null;
    client?: { contacts?: Array<EmailContact | null> | null } | null;
  },
): string | null {
  return resolveRecipientName(to, [
    proposal.contact,
    ...(proposal.client?.contacts ?? []),
  ]);
}
