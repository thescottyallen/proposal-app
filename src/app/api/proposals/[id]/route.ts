import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { roleFromMetadata, canDeleteProposal } from "@/lib/roles";
import { computePricingTotals } from "@/lib/utils";
import {
  isProposalDocument,
  getAllPricingBlocks,
  stripDocumentInternalFields,
  ProposalDocument,
} from "@/lib/proposal-document";
import type { ProposalPricingSettings } from "@/lib/pricing-types";

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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await prisma.proposal.findFirst({
    where: { id, createdBy: userId },
    include: {
      template:  { select: { name: true } },
      events:    { orderBy: { createdAt: "desc" }, take: 50 },
      revisions: { orderBy: { version: "desc" }, take: 10, select: { version: true, createdAt: true } },
    },
  });

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(proposal);
}

// ─── PATCH /api/proposals/:id ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.proposal.findFirst({ where: { id, createdBy: userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const {
    title, clientName, clientEmail, clientAbn,
    content, status, expiresAt, internalNotes,
    // Legacy fields (still accepted for backward compat)
    pricingData: legacyPricingData,
    pricingSettings: legacyPricingSettings,
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

  // Snapshot current state as a revision if the proposal is already SENT/VIEWED/ACCEPTED
  const shouldSnapshot = ["SENT", "VIEWED", "ACCEPTED"].includes(existing.status);
  if (shouldSnapshot && (content !== undefined || legacyPricingData)) {
    const lastRevision = await prisma.proposalRevision.findFirst({
      where:   { proposalId: id },
      orderBy: { version: "desc" },
    });
    await prisma.proposalRevision.create({
      data: {
        proposalId: id,
        version:    (lastRevision?.version ?? 0) + 1,
        createdBy:  userId,
        snapshot: {
          title:      existing.title,
          content:    existing.content,
          clientName: existing.clientName,
          clientEmail: existing.clientEmail,
          totalValue: existing.totalValue,
          updatedAt:  existing.updatedAt,
        },
      },
    });
  }

  const proposal = await prisma.proposal.update({
    where: { id },
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

  return NextResponse.json(proposal);
}

// ─── DELETE /api/proposals/:id ────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user   = await client.users.getUser(userId);
  const role   = roleFromMetadata(user.publicMetadata as Record<string, unknown>);
  if (!canDeleteProposal(role)) {
    return NextResponse.json({ error: "Only admins can delete proposals" }, { status: 403 });
  }

  const existing = await prisma.proposal.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
