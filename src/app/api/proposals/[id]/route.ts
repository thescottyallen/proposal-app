import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { roleFromMetadata, canDeleteProposal } from "@/lib/roles";
import { computePricingTotals } from "@/lib/utils";
import {
  ProposalPricingData,
  ProposalPricingSettings,
  stripInternalFields,
} from "@/lib/pricing-types";

// GET /api/proposals/:id — get a single proposal (editor view, includes all fields)
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

// PATCH /api/proposals/:id — update a proposal (also snapshots revision if status >= SENT)
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
    pricingData, pricingSettings,
  } = body;

  // Compute total from new pricing data if provided
  let totalValue: number | undefined;
  if (pricingData && pricingSettings) {
    const totals = computePricingTotals(pricingData as ProposalPricingData, pricingSettings as ProposalPricingSettings);
    totalValue = totals.grandTotal || 0;
  }

  // Snapshot current state as a revision if proposal is already SENT/VIEWED/ACCEPTED
  // (captures scope renegotiation — not every save)
  const shouldSnapshot = ["SENT", "VIEWED", "ACCEPTED"].includes(existing.status);
  if (shouldSnapshot && (pricingData || content !== undefined)) {
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
          title:        existing.title,
          content:      existing.content,
          pricingData:  existing.pricingData,
          clientName:   existing.clientName,
          clientEmail:  existing.clientEmail,
          totalValue:   existing.totalValue,
          updatedAt:    existing.updatedAt,
        },
      },
    });
  }

  const ps = pricingSettings as ProposalPricingSettings | undefined;

  const proposal = await prisma.proposal.update({
    where: { id },
    data: {
      ...(title        !== undefined && { title }),
      ...(clientName   !== undefined && { clientName }),
      ...(clientEmail  !== undefined && { clientEmail }),
      ...(clientAbn    !== undefined && { clientAbn }),
      ...(content      !== undefined && { content }),
      ...(status       !== undefined && { status }),
      ...(totalValue   !== undefined && { totalValue }),
      ...(expiresAt    !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(internalNotes !== undefined && { internalNotes }),
      ...(pricingData  !== undefined && { pricingData: pricingData as object }),
      ...(ps && {
        currency:           ps.currency,
        exchangeRate:       ps.exchangeRate,
        gstEnabled:         ps.gstEnabled,
        roundingMode:       ps.roundingMode,
        discountType:       ps.discountType,
        discountValue:      ps.discountValue,
        showDiscount:       ps.showDiscount,
        depositType:        ps.depositType,
        depositValue:       ps.depositValue,
        billingCadence:     ps.billingCadence,
        recurringStartMode: ps.recurringStartMode,
        recurringStartDate: ps.recurringStartDate ? new Date(ps.recurringStartDate) : null,
        fixedTermMonths:    ps.fixedTermMonths,
        paymentTerms:       ps.paymentTerms,
        latePaymentClause:  ps.latePaymentClause,
      }),
    },
  });

  return NextResponse.json(proposal);
}

// DELETE /api/proposals/:id — admin only
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can delete proposals
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

// Helper used by the public route — strips margin from pricingData before sending
export function sanitiseForClient(proposal: { pricingData: unknown; [key: string]: unknown }) {
  const data = proposal.pricingData as ProposalPricingData | null;
  return {
    ...proposal,
    pricingData: data ? stripInternalFields(data) : null,
    // Never expose these to the client
    internalNotes: undefined,
  };
}
