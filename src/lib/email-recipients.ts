const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maximum addresses accepted on To, CC, or BCC. */
export const MAX_EMAIL_RECIPIENTS = 5;

export type EmailListLabel = "To" | "CC" | "BCC";

/**
 * Default To address for Send Preview: the proposal creator's email.
 * If that address is missing and the viewer is the author, uses the signed-in user's email.
 */
export function previewRecipientEmail({
  authorEmail,
  viewerEmail,
  isAuthor,
}: {
  authorEmail?: string | null;
  viewerEmail?: string | null;
  isAuthor: boolean;
}): string {
  const author = authorEmail?.trim() ?? "";
  if (author) return author;
  if (!isAuthor) return "";
  return viewerEmail?.trim() ?? "";
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export type ParsedEmailList =
  | { ok: true; emails: string[] }
  | { ok: false; error: string };

/**
 * Parse a To, CC, or BCC field.
 * Accepts a comma-, semicolon-, or newline-separated string, or an array of strings.
 * Blank input is valid and yields no recipients. More than five addresses is rejected.
 */
export function parseOptionalEmailList(
  value: unknown,
  label: EmailListLabel
): ParsedEmailList {
  if (value == null || value === "") return { ok: true, emails: [] };

  let parts: unknown[];
  if (typeof value === "string") {
    parts = value.split(/[,;\n]/);
  } else if (Array.isArray(value)) {
    parts = value;
  } else {
    return { ok: false, error: `${label} must be a list of email addresses.` };
  }

  const emails: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (typeof part !== "string") {
      return { ok: false, error: `${label} must be a list of email addresses.` };
    }
    const email = part.trim();
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email)) {
      const shown = email.replace(/[\r\n\t]/g, " ").slice(0, 200);
      return { ok: false, error: `Invalid ${label} email address: ${shown}` };
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }

  if (emails.length > MAX_EMAIL_RECIPIENTS) {
    return { ok: false, error: `${label} is limited to ${MAX_EMAIL_RECIPIENTS} addresses.` };
  }

  return { ok: true, emails };
}

/** Required To field. One address is enough. Empty or invalid input is rejected. */
export function parseToAddresses(value: unknown): ParsedEmailList {
  const parsed = parseOptionalEmailList(value, "To");
  if (!parsed.ok) return parsed;
  if (parsed.emails.length === 0) {
    return { ok: false, error: "A valid email address is required" };
  }
  return parsed;
}

export type ProposalEmailRequest =
  | { ok: true; to: string[]; cc: string[]; bcc: string[]; message?: string }
  | { ok: false; error: string };

/**
 * Read the send, preview, or follow-up body.
 * Message must be plain text. Extra fields, including HTML, are ignored.
 */
export function readProposalEmailRequest(body: unknown): ProposalEmailRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request" };
  }
  const record = body as Record<string, unknown>;

  const toParsed = parseToAddresses(record.to);
  if (!toParsed.ok) return toParsed;

  const copies = parsedCopyLists(record.cc, record.bcc);
  if (!copies.ok) return copies;

  if (record.message != null && typeof record.message !== "string") {
    return { ok: false, error: "Message must be plain text." };
  }

  return {
    ok: true,
    to: toParsed.emails,
    cc: copies.cc,
    bcc: copies.bcc,
    ...(typeof record.message === "string" ? { message: record.message } : {}),
  };
}

/** Validate both optional copy fields. Returns an error message, or null when both are usable. */
export function optionalCopyError(cc: unknown, bcc: unknown): string | null {
  const ccParsed = parseOptionalEmailList(cc, "CC");
  if (!ccParsed.ok) return ccParsed.error;
  const bccParsed = parseOptionalEmailList(bcc, "BCC");
  if (!bccParsed.ok) return bccParsed.error;
  return null;
}

/** Activity-log payload. Omits empty copy lists so a plain To send stays `{ to }`. */
export function recipientMetadata(to: string | string[], cc: string[], bcc: string[]) {
  const toValue = Array.isArray(to) ? to.join(", ") : to;
  return {
    to: toValue,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
  };
}

export function parsedCopyLists(
  cc: unknown,
  bcc: unknown
): { ok: true; cc: string[]; bcc: string[] } | { ok: false; error: string } {
  const ccParsed = parseOptionalEmailList(cc, "CC");
  if (!ccParsed.ok) return ccParsed;
  const bccParsed = parseOptionalEmailList(bcc, "BCC");
  if (!bccParsed.ok) return bccParsed;
  return { ok: true, cc: ccParsed.emails, bcc: bccParsed.emails };
}
