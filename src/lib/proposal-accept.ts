/** Statuses a client may accept. A second accept cannot match this filter. */
export const ACCEPTABLE_STATUSES = ["SENT", "VIEWED"] as const;

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
