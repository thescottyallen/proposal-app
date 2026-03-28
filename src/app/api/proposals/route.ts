import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generatePublicId, computePricingTotals } from "@/lib/utils";
import { defaultPricingData, defaultPricingSettings, ProposalPricingData, ProposalPricingSettings } from "@/lib/pricing-types";

// GET /api/proposals — list all proposals for current user
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposals = await prisma.proposal.findMany({
    where:   { createdBy: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id:           true,
      title:        true,
      clientName:   true,
      clientEmail:  true,
      status:       true,
      totalValue:   true,
      currency:     true,
      invoiceNumber: true,
      publicId:     true,
      expiresAt:    true,
      createdAt:    true,
      _count: { select: { events: true } },
    },
  });

  return NextResponse.json(proposals);
}

// POST /api/proposals — create a new proposal
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    title, clientName, clientEmail, clientAbn,
    content, templateId, clientId,
    pricingData, pricingSettings,
    expiresAt, internalNotes,
  } = body;

  // Load business settings to apply defaults
  const bizSettings = await prisma.businessSettings.findUnique({ where: { userId } });

  const effectivePricingData:     ProposalPricingData     = pricingData     ?? defaultPricingData();
  const effectivePricingSettings: ProposalPricingSettings = pricingSettings ?? {
    ...defaultPricingSettings(),
    currency:     bizSettings?.defaultCurrency ?? "AUD",
    roundingMode: bizSettings?.roundingMode    ?? "CENTS",
  };

  const totals     = computePricingTotals(effectivePricingData, effectivePricingSettings);
  const totalValue = totals.grandTotal || null;

  const proposal = await prisma.proposal.create({
    data: {
      title:        title       || "Untitled Proposal",
      clientName:   clientName  || "",
      clientEmail:  clientEmail || "",
      clientAbn:    clientAbn   || null,
      content:      content     || {},
      templateId:   templateId  || null,
      clientId:     clientId    || null,
      createdBy:    userId,
      publicId:     generatePublicId(),
      internalNotes: internalNotes || null,
      expiresAt:    expiresAt ? new Date(expiresAt) : null,
      pricingData:  effectivePricingData  as object,
      totalValue,
      // Pricing settings fields
      currency:           effectivePricingSettings.currency,
      exchangeRate:       effectivePricingSettings.exchangeRate,
      gstEnabled:         effectivePricingSettings.gstEnabled,
      roundingMode:       effectivePricingSettings.roundingMode,
      discountType:       effectivePricingSettings.discountType,
      discountValue:      effectivePricingSettings.discountValue,
      showDiscount:       effectivePricingSettings.showDiscount,
      depositType:        effectivePricingSettings.depositType,
      depositValue:       effectivePricingSettings.depositValue,
      billingCadence:     effectivePricingSettings.billingCadence,
      recurringStartMode: effectivePricingSettings.recurringStartMode,
      recurringStartDate: effectivePricingSettings.recurringStartDate ? new Date(effectivePricingSettings.recurringStartDate) : null,
      fixedTermMonths:    effectivePricingSettings.fixedTermMonths,
      paymentTerms:       effectivePricingSettings.paymentTerms,
      latePaymentClause:  effectivePricingSettings.latePaymentClause,
    },
  });

  return NextResponse.json(proposal, { status: 201 });
}
