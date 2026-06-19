import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generatePublicId, computePricingTotals } from "@/lib/utils";
import {
  isProposalDocument,
  getAllPricingBlocks,
  defaultDocument,
  ProposalDocument,
} from "@/lib/proposal-document";
import {
  defaultPricingSettings,
} from "@/lib/pricing-types";
import { getAuthContext } from "@/lib/roles.server";
import { proposalAccessWhere } from "@/lib/roles";

// ─── GET /api/proposals ───────────────────────────────────────────────────────

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposals = await prisma.proposal.findMany({
    // Admins see every proposal; everyone else only their own.
    where:   proposalAccessWhere(ctx.role, ctx.userId),
    orderBy: { createdAt: "desc" },
    select: {
      id:            true,
      title:         true,
      clientName:    true,
      clientEmail:   true,
      status:        true,
      totalValue:    true,
      currency:      true,
      invoiceNumber: true,
      publicId:      true,
      expiresAt:     true,
      createdAt:     true,
      createdBy:     true,
      // Count only client-facing engagement events, not internal "edited" log entries.
      _count: { select: { events: { where: { eventType: { not: "edited" } } } } },
    },
  });

  return NextResponse.json(proposals);
}

// ─── POST /api/proposals ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    title, clientName, clientEmail, clientAbn,
    content, templateId, clientId, contactId,
    expiresAt, internalNotes,
    // Legacy pricing fields (still accepted for backward compat)
    pricingData: legacyPricingData,
    pricingSettings: legacyPricingSettings,
  } = body;

  // Load business settings to apply defaults
  const bizSettings = await prisma.businessSettings.findUnique({ where: { userId } });
  const defaultSettings = {
    ...defaultPricingSettings(),
    currency:     bizSettings?.defaultCurrency ?? "AUD",
    roundingMode: bizSettings?.roundingMode    ?? "CENTS",
  };

  // Resolve the document content
  let resolvedContent: Record<string, unknown>;
  let totalValue: number | null = null;
  let effectiveCurrency = defaultSettings.currency as string;

  if (content && isProposalDocument(content)) {
    // New format — compute total from pricing blocks
    const doc = content as ProposalDocument;
    resolvedContent = doc as unknown as Record<string, unknown>;
    const pricingBlocks = getAllPricingBlocks(doc);
    let sum = 0;
    for (const block of pricingBlocks) {
      const t = computePricingTotals(block.pricingData, block.pricingSettings);
      sum += t.grandTotal ?? 0;
    }
    totalValue = sum || null;
    if (pricingBlocks.length > 0) {
      effectiveCurrency = pricingBlocks[0].pricingSettings.currency;
    }
  } else if (content && Object.keys(content).length > 0) {
    // Legacy TipTap doc passed directly
    resolvedContent = content as Record<string, unknown>;
    if (legacyPricingData && legacyPricingSettings) {
      const totals = computePricingTotals(legacyPricingData, legacyPricingSettings);
      totalValue = totals.grandTotal || null;
      effectiveCurrency = legacyPricingSettings.currency ?? effectiveCurrency;
    }
  } else {
    // Brand new blank proposal
    resolvedContent = defaultDocument(defaultSettings) as unknown as Record<string, unknown>;
  }

  const proposal = await prisma.proposal.create({
    data: {
      title:        title       || "Untitled Proposal",
      clientName:   clientName  || "",
      clientEmail:  clientEmail || "",
      clientAbn:    clientAbn   || null,
      content:      resolvedContent as object,
      templateId:   templateId  || null,
      clientId:     clientId    || null,
      contactId:    contactId   || null,
      createdBy:    userId,
      publicId:     generatePublicId(),
      internalNotes: internalNotes || null,
      expiresAt:    expiresAt ? new Date(expiresAt) : null,
      totalValue,
      currency:     effectiveCurrency as "AUD" | "USD",
    },
  });

  return NextResponse.json(proposal, { status: 201 });
}
