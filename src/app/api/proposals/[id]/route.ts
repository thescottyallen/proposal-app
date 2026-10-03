import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/roles.server";
import { proposalAccessWhere } from "@/lib/roles";
import { computePricingTotals } from "@/lib/utils";
import {
  isProposalDocument,
  getAllPricingBlocks,
  stripDocumentInternalFields,
  ProposalDocument,
} from "@/lib/proposal-document";
import type { ProposalPricingSettings } from "@/lib/pricing-types";
import {
  buildRevisionSnapshot,
  evaluateProposalPatch,
  nextRevisionVersion,
} from "@/lib/proposal-save";
import { loadEditorProposal } from "@/lib/proposal-detail";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute grand total by summing all pricing blocks in a ProposalDocument */
function computeDocumentTotal(doc: ProposalDocument): number {
  let total = 0;
  for (const block of getAllPricingBlocks(doc)) {
    const t = computePricingTotals(block.pricingData, block.pricingSettings);
    total += t.grandTotal ?? 0;
  }
  return total;
}

/** Extract the first pricing block's settings (for the flat currency column) */
function firstPricingSettings(doc: ProposalDocument): ProposalPricingSettings | null {
  const blocks = getAllPricingBlocks(doc);
  return blocks.length > 0 ? blocks[0].pricingSettings : null;
}

// ─── GET /api/proposals/:id ───────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await loadEditorProposal(id, ctx);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proposal);
}

// ─── PATCH /api/proposals/:id ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admins may edit any proposal; everyone else only their own.
  const existing = await prisma.proposal.findFirst({
    where: { id, ...proposalAccessWhere(ctx.role, ctx.userId) },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const {
    title, clientName, clientEmail, clientAbn,
    content, status, expiresAt, internalNotes, lostReason,
    // Legacy fields (still accepted for backward compat)
    pricingData: legacyPricingData,
    pricingSettings: legacyPricingSettings,
    baseUpdatedAt,
    force,
  } = body;

  // Compute totalValue and first pricing settings from the content
  let totalValue: number | undefined;
  let ps: ProposalPricingSettings | null = null;

  if (content && isProposalDocument(content)) {
    const doc = content as ProposalDocument;
    totalValue = computeDocumentTotal(doc);
    ps = firstPricingSettings(doc);
  } else if (legacyPricingData && legacyPricingSettings) {
    // Legacy path
    const totals = computePricingTotals(legacyPricingData, legacyPricingSettings);
    totalValue = totals.grandTotal ?? 0;
    ps = legacyPricingSettings as ProposalPricingSettings;
  }

  // Content writes (drafts included) keep the previous content first, then update.
  // Sent, viewed, and accepted proposals still snapshot the same way.
  // A stale editor gets 409 unless the user chooses to save over the newer copy.
  const decision = evaluateProposalPatch({
    serverUpdatedAt: existing.updatedAt,
    baseUpdatedAt: typeof baseUpdatedAt === "string" ? baseUpdatedAt : null,
    force: force === true,
    writesContent: content !== undefined || Boolean(legacyPricingData),
  });
  if (!decision.ok) {
    return NextResponse.json(decision.body, { status: decision.status });
  }

  if (decision.writeRevision) {
    try {
      const lastRevision = await prisma.proposalRevision.findFirst({
        where:   { proposalId: id },
        orderBy: { version: "desc" },
        select:  { version: true },
      });
      await prisma.proposalRevision.create({
        data: {
          proposalId: id,
          version:    nextRevisionVersion(lastRevision?.version),
          createdBy:  ctx.userId,
          snapshot:   buildRevisionSnapshot(existing) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Another save took this version number. Treat it as a conflict so the
      // editor can reload instead of overwriting.
      if ((err as { code?: string }).code === "P2002") {
        return NextResponse.json(
          {
            error: "This proposal was changed in another tab or by someone else.",
            code: "conflict",
            updatedAt: existing.updatedAt.toISOString(),
          },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  const proposal = await prisma.proposal.update({
    where: { id },
    select: { id: true, updatedAt: true, status: true },
    data: {
      ...(title         !== undefined && { title }),
      ...(clientName    !== undefined && { clientName }),
      ...(clientEmail   !== undefined && { clientEmail }),
      ...(clientAbn     !== undefined && { clientAbn }),
      ...(content       !== undefined && { content }),
      ...(status        !== undefined && { status }),
      ...(totalValue    !== undefined && { totalValue }),
      ...(expiresAt     !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(internalNotes !== undefined && { internalNotes }),
      ...(lostReason    !== undefined && { lostReason }),
      // Update flat currency column from first pricing block (for reporting)
      ...(ps && {
        currency:    ps.currency,
        exchangeRate: ps.exchangeRate,
        gstEnabled:  ps.gstEnabled,
        roundingMode: ps.roundingMode,
        paymentTerms: ps.paymentTerms,
        billingCadence: ps.billingCadence,
      }),
    },
  });

  // Change log: record who changed what, so every proposal has a visible edit
  // history. Especially important now that admins can edit others' proposals.
  const changedFields: string[] = [];
  if (title       !== undefined && title       !== existing.title)       changedFields.push("Title");
  if (clientName  !== undefined && clientName  !== existing.clientName)  changedFields.push("Client name");
  if (clientEmail !== undefined && clientEmail !== existing.clientEmail) changedFields.push("Client email");
  if (clientAbn   !== undefined && (clientAbn ?? null) !== (existing.clientAbn ?? null)) changedFields.push("Client ABN");
  if (status      !== undefined && status      !== existing.status)      changedFields.push("Status");
  if (internalNotes !== undefined && (internalNotes ?? null) !== (existing.internalNotes ?? null)) changedFields.push("Internal notes");
  if (expiresAt !== undefined) {
    const newExp = expiresAt ? new Date(expiresAt).toISOString() : null;
    const oldExp = existing.expiresAt ? existing.expiresAt.toISOString() : null;
    if (newExp !== oldExp) changedFields.push("Expiry date");
  }
  if (content !== undefined && JSON.stringify(content) !== JSON.stringify(existing.content)) {
    changedFields.push("Proposal content");
  } else if (legacyPricingData) {
    changedFields.push("Pricing");
  }

  if (changedFields.length > 0) {
    await prisma.proposalEvent.create({
      data: {
        proposalId: id,
        eventType:  "edited",
        metadata:   { editedBy: ctx.userId, changedFields },
      },
    });
  }

  return NextResponse.json(proposal);
}

// ─── DELETE /api/proposals/:id ────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.proposal.findFirst({
    where: { id },
    select: { id: true, createdBy: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the proposal's author may delete it — admins can view and edit any
  // proposal, but deletion stays with whoever created it.
  if (existing.createdBy !== ctx.userId) {
    return NextResponse.json(
      { error: "Only the proposal's author can delete it" },
      { status: 403 }
    );
  }

  await prisma.proposal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

// ─── sanitiseForClient ────────────────────────────────────────────────────────
// Used by the public route (/p/[publicId]) — strips margin from pricing blocks
// and never exposes internalNotes.

export function sanitiseForClient(proposal: {
  content: unknown;
  pricingData: unknown;
  [key: string]: unknown;
}) {
  const content = proposal.content as Record<string, unknown> | null;

  // New format: strip margin from pricing blocks inside the document
  if (content && isProposalDocument(content)) {
    return {
      ...proposal,
      content: stripDocumentInternalFields(content as ProposalDocument),
      internalNotes: undefined,
    };
  }

  // Legacy format: strip from pricingData column (keep for backward compat)
  return {
    ...proposal,
    internalNotes: undefined,
  };
}
