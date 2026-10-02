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
