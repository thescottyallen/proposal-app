import { isProposalDocument } from "@/lib/proposal-document";

/** Columns the dashboard and proposals list actually render. No document JSON. */
export const PROPOSAL_LIST_SELECT = {
  id: true,
  title: true,
  clientName: true,
  clientEmail: true,
  status: true,
  totalValue: true,
  currency: true,
  invoiceNumber: true,
  publicId: true,
  expiresAt: true,
  createdAt: true,
  createdBy: true,
  // Count only client-facing engagement events, not internal "edited" log entries.
  _count: { select: { events: { where: { eventType: { not: "edited" } } } } },
} as const;

/**
 * History lists metadata only. The snapshot JSON (often with base64 images)
 * is loaded by GET /api/proposals/:id/revisions/:version when someone previews.
 */
export const EDITOR_REVISION_SELECT = {
  version: true,
  createdAt: true,
  createdBy: true,
} as const;

/** Activity log fields. Skip IP address and user agent. */
export const EDITOR_EVENT_SELECT = {
  id: true,
  eventType: true,
  createdAt: true,
  metadata: true,
} as const;

/**
 * Editor document query. Content stays, because payment options (including the
 * project fee) are stored there. pricingData is a second read for legacy rows only.
 * Event metadata stays whole so paymentChoices and the agreed summary survive.
 */
export const EDITOR_PROPOSAL_SELECT = {
  id: true,
  title: true,
  clientName: true,
  clientEmail: true,
  clientAbn: true,
  content: true,
  status: true,
  publicId: true,
  totalValue: true,
  invoiceNumber: true,
  internalNotes: true,
  lostReason: true,
  expiresAt: true,
  currency: true,
  exchangeRate: true,
  gstEnabled: true,
  roundingMode: true,
  discountType: true,
  discountValue: true,
  showDiscount: true,
  depositType: true,
  depositValue: true,
  billingCadence: true,
  recurringStartMode: true,
  recurringStartDate: true,
  fixedTermMonths: true,
  paymentTerms: true,
  latePaymentClause: true,
  createdBy: true,
  updatedAt: true,
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: EDITOR_EVENT_SELECT,
  },
  revisions: {
    orderBy: { version: "desc" as const },
    take: 50,
    select: EDITOR_REVISION_SELECT,
  },
} as const;

/** v2 proposals store pricing inside content. Don't ship the legacy column too. */
export function pricingDataForClient(
  content: unknown,
  pricingData: unknown
): Record<string, unknown> | null {
  if (isProposalDocument(content)) return null;
  if (pricingData && typeof pricingData === "object" && !Array.isArray(pricingData)) {
    return pricingData as Record<string, unknown>;
  }
  return null;
}
