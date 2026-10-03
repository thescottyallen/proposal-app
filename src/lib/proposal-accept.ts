/** Statuses a client may accept. A second accept cannot match this filter. */
export const ACCEPTABLE_STATUSES = ["SENT", "VIEWED"] as const;

export const SIGNER_NAME_MAX = 200;
export const CLIENT_ABN_MAX = 50;

export const ALREADY_ACCEPTED_ERROR = "This proposal has already been accepted.";

export function acceptanceGuard(status: string):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  if (status === "SENT" || status === "VIEWED") return { ok: true };
  if (status === "ACCEPTED") {
    return { ok: false, status: 409, error: ALREADY_ACCEPTED_ERROR };
  }
  if (status === "EXPIRED") {
    return {
      ok: false,
      status: 410,
      error: "This proposal has expired and can no longer be accepted.",
    };
  }
  return {
    ok: false,
    status: 409,
    error: "This proposal cannot be accepted in its current state.",
  };
}

/** Conditional write: only a proposal that is still sent or viewed can become accepted. */
export function acceptanceUpdateFilter(id: string) {
  return { id, status: { in: [...ACCEPTABLE_STATUSES] } };
}

/**
 * The stored agreement changes only when the conditional update matches one row.
 * A second or overlapping accept keeps whatever was already stored.
 */
export function settleAcceptance<T>(input: {
  updatedCount: number;
  stored: T;
  incoming: T;
}): T {
  return input.updatedCount === 1 ? input.incoming : input.stored;
}

/** Only move a proposal to viewed while it is still sent. */
export function viewedUpdateWhere(id: string) {
  return { id, status: "SENT" as const };
}

/** Only expire a proposal from the status just read, sent or viewed. */
export function expiryUpdateWhere(id: string, status: "SENT" | "VIEWED") {
  return { id, status };
}

/** Apply a status write only when the conditional update matched one row. */
export function statusAfterUpdate<T extends string>(input: {
  updatedCount: number;
  previousStatus: T;
  nextStatus: T;
}): T {
  return input.updatedCount === 1 ? input.nextStatus : input.previousStatus;
}

export function parseSignerName(value: unknown):
  | { ok: true; signerName: string }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Signer name is required." };
  }
  const signerName = value.trim();
  if (!signerName) {
    return { ok: false, error: "Signer name is required." };
  }
  if (signerName.length > SIGNER_NAME_MAX) {
    return { ok: false, error: `Signer name must be ${SIGNER_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, signerName };
}

/** Blank, whitespace-only, or omitted ABN is left unset. A value must be text, within the cap. */
export function parseClientAbn(value: unknown):
  | { ok: true; clientAbn: string | null }
  | { ok: false; error: string } {
  if (value == null) return { ok: true, clientAbn: null };
  if (typeof value !== "string") {
    return { ok: false, error: "ABN must be text." };
  }
  const clientAbn = value.trim();
  if (!clientAbn) return { ok: true, clientAbn: null };
  if (clientAbn.length > CLIENT_ABN_MAX) {
    return { ok: false, error: `ABN must be ${CLIENT_ABN_MAX} characters or fewer.` };
  }
  return { ok: true, clientAbn };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Optional map of item id to included or not. Missing means no choices were sent. */
export function parseClientIncluded(value: unknown):
  | { ok: true; clientIncluded: Record<string, boolean> }
  | { ok: false; error: string } {
  if (value == null) return { ok: true, clientIncluded: {} };
  if (!isPlainRecord(value)) {
    return { ok: false, error: "Included items must be a set of choices." };
  }
  const clientIncluded: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "boolean") {
      return { ok: false, error: "Each included item must be yes or no." };
    }
    clientIncluded[key] = item;
  }
  return { ok: true, clientIncluded };
}

/** Optional map of pricing block id to a payment choice. Missing means none were sent. */
export function parsePaymentChoices(value: unknown):
  | { ok: true; paymentChoices: Record<string, string> }
  | { ok: false; error: string } {
  if (value == null) return { ok: true, paymentChoices: {} };
  if (!isPlainRecord(value)) {
    return { ok: false, error: "Payment choices must be a set of choices." };
  }
  const paymentChoices: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      return { ok: false, error: "Each payment choice must be text." };
    }
    paymentChoices[key] = item;
  }
  return { ok: true, paymentChoices };
}
