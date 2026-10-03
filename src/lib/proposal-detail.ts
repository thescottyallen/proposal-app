import { prisma } from "@/lib/prisma";
import { proposalAccessWhere, type AppRole } from "@/lib/roles";
import { isProposalDocument } from "@/lib/proposal-document";
import { resolveClerkUsers } from "@/lib/clerk-users";
import { getOrCreateBusinessSettings } from "@/lib/business-settings";
import {
  EDITOR_EVENT_SELECT,
  EDITOR_PROPOSAL_SELECT,
  EDITOR_REVISION_SELECT,
  pricingDataForClient,
} from "@/lib/proposal-payload";

export { EDITOR_EVENT_SELECT, EDITOR_PROPOSAL_SELECT, EDITOR_REVISION_SELECT, pricingDataForClient };

export interface EditorEventMetadata {
  editedBy?: string;
  changedFields?: string[];
  to?: string;
  cc?: string[];
  bcc?: string[];
  paymentChoices?: { label?: string; included?: string | null }[];
}

export interface EditorProposalPayload {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAbn: string | null;
  content: Record<string, unknown>;
  status: string;
  publicId: string;
  totalValue: number | null;
  invoiceNumber: string | null;
  internalNotes: string | null;
  lostReason: string | null;
  expiresAt: string | null;
  currency: string;
  exchangeRate: number;
  gstEnabled: boolean;
  roundingMode: string;
  discountType: string | null;
  discountValue: number | null;
  showDiscount: boolean;
  depositType: string | null;
  depositValue: number | null;
  billingCadence: string;
  recurringStartMode: string | null;
  recurringStartDate: string | null;
  fixedTermMonths: number | null;
  paymentTerms: string;
  latePaymentClause: string | null;
  /** Null for v2 documents so the legacy column is not sent twice. */
  pricingData: Record<string, unknown> | null;
  updatedAt: string;
  authorName: string;
  authorEmail: string;
  viewerIsAuthor: boolean;
  events: {
    id: string;
    eventType: string;
    createdAt: string;
    actorName: string | null;
    metadata: EditorEventMetadata | null;
  }[];
  revisions: {
    version: number;
    createdAt: string;
    createdBy: string;
    savedByName: string;
    /** Filled in when that version is previewed. The list does not read snapshots. */
    summary: string;
  }[];
}

export interface EditorSettingsPayload {
  gstRegistered: boolean;
  defaultAcceptanceMessage: string | null;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * One proposal query (document + 50 events + 50 revision rows, no snapshots),
 * plus a legacy pricingData read only for pre-v2 documents, plus one Clerk
 * user list. Previously this detoasted every snapshot and called getUser per person.
 */
export async function loadEditorProposal(
  id: string,
  ctx: { userId: string; role: AppRole }
): Promise<EditorProposalPayload | null> {
  const proposal = await prisma.proposal.findFirst({
    where: { id, ...proposalAccessWhere(ctx.role, ctx.userId) },
    select: EDITOR_PROPOSAL_SELECT,
  });
  if (!proposal) return null;

  let pricingData: Record<string, unknown> | null = null;
  if (!isProposalDocument(proposal.content)) {
    const legacy = await prisma.proposal.findFirst({
      where: { id },
      select: { pricingData: true },
    });
    pricingData = pricingDataForClient(proposal.content, legacy?.pricingData ?? null);
  }

  const editorIds = proposal.events
    .filter((event) => event.eventType === "edited")
    .map((event) => {
      const metadata = event.metadata as { editedBy?: string } | null;
      return metadata?.editedBy;
    })
    .filter((value): value is string => Boolean(value));
  const users = await resolveClerkUsers([
    proposal.createdBy,
    ...editorIds,
    ...proposal.revisions.map((revision) => revision.createdBy),
  ]);
  const author = users[proposal.createdBy];

  return {
    id: proposal.id,
    title: proposal.title,
    clientName: proposal.clientName,
    clientEmail: proposal.clientEmail,
    clientAbn: proposal.clientAbn,
    content: (proposal.content ?? {}) as Record<string, unknown>,
    status: proposal.status,
    publicId: proposal.publicId,
    totalValue: proposal.totalValue,
    invoiceNumber: proposal.invoiceNumber,
    internalNotes: proposal.internalNotes,
    lostReason: proposal.lostReason,
    expiresAt: iso(proposal.expiresAt),
    currency: proposal.currency,
    exchangeRate: proposal.exchangeRate,
    gstEnabled: proposal.gstEnabled,
    roundingMode: proposal.roundingMode,
    discountType: proposal.discountType,
    discountValue: proposal.discountValue,
    showDiscount: proposal.showDiscount,
    depositType: proposal.depositType,
    depositValue: proposal.depositValue,
    billingCadence: proposal.billingCadence,
    recurringStartMode: proposal.recurringStartMode,
    recurringStartDate: iso(proposal.recurringStartDate),
    fixedTermMonths: proposal.fixedTermMonths,
    paymentTerms: proposal.paymentTerms,
    latePaymentClause: proposal.latePaymentClause,
    pricingData,
    updatedAt: proposal.updatedAt.toISOString(),
    authorName: author?.name ?? "Unknown user",
    authorEmail: author?.email ?? "",
    viewerIsAuthor: proposal.createdBy === ctx.userId,
    events: proposal.events.map((event) => {
      const metadata = (event.metadata ?? null) as EditorEventMetadata | null;
      const editedBy = metadata?.editedBy;
      return {
        id: event.id,
        eventType: event.eventType,
        createdAt: event.createdAt.toISOString(),
        metadata,
        actorName: editedBy ? (users[editedBy]?.name ?? "Unknown user") : null,
      };
    }),
    revisions: proposal.revisions.map((revision) => ({
      version: revision.version,
      createdAt: revision.createdAt.toISOString(),
      createdBy: revision.createdBy,
      savedByName: users[revision.createdBy]?.name ?? "Unknown user",
      summary: "",
    })),
  };
}

export async function loadEditorSettings(userId: string): Promise<EditorSettingsPayload> {
  const settings = await getOrCreateBusinessSettings(userId);
  return {
    gstRegistered: settings.gstRegistered,
    defaultAcceptanceMessage: settings.defaultAcceptanceMessage,
  };
}
