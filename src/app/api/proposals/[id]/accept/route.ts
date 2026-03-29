import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sendAcceptanceConfirmationToClient,
  sendAcceptanceNotificationToOwner,
} from "@/lib/email";
import type { ProposalPricingData } from "@/lib/pricing-types";

// POST /api/proposals/:id/accept — public endpoint, no auth required
// Body: { signerName: string, clientIncluded: Record<string, boolean> }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const proposal = await prisma.proposal.findUnique({ where: { id } });

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only SENT or VIEWED proposals can be accepted
  if (!["SENT", "VIEWED"].includes(proposal.status)) {
    return NextResponse.json(
      { error: "This proposal cannot be accepted in its current state." },
      { status: 409 }
    );
  }

  // Enforce expiry
  if (proposal.expiresAt && new Date(proposal.expiresAt) < new Date()) {
    await prisma.proposal.update({ where: { id }, data: { status: "EXPIRED" } });
    return NextResponse.json(
      { error: "This proposal has expired and can no longer be accepted." },
      { status: 410 }
    );
  }

  const body = await request.json();
  const { signerName, clientIncluded } = body as {
    signerName:      string;
    clientIncluded:  Record<string, boolean>;
  };

  if (!signerName?.trim()) {
    return NextResponse.json({ error: "Signer name is required." }, { status: 400 });
  }

  // Get client IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";

  const acceptedAt = new Date();

  // Merge clientIncluded choices into pricingData
  const existingPricing = proposal.pricingData as ProposalPricingData | null;
  const updatedPricingData: ProposalPricingData | null = existingPricing
    ? {
        ...existingPricing,
        items: existingPricing.items.map(item => ({
          ...item,
          clientIncluded: item.isOptional
            ? (clientIncluded[item.id] ?? item.clientIncluded)
            : true,
        })),
      }
    : null;

  // Update proposal to ACCEPTED and persist client's item choices
  await prisma.proposal.update({
    where: { id },
    data: {
      status:      "ACCEPTED",
      pricingData: updatedPricingData != null
        ? (updatedPricingData as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });

  // Record acceptance event (full audit trail)
  await prisma.proposalEvent.create({
    data: {
      proposalId: id,
      eventType:  "accepted",
      ipAddress:  ip,
      metadata: {
        signerName,
        acceptedAt:     acceptedAt.toISOString(),
        clientIncluded,
      },
    },
  });

  // Get owner email from Clerk to send notification
  try {
    const client = await clerkClient();
    const owner  = await client.users.getUser(proposal.createdBy);
    const ownerEmail = owner.emailAddresses.find(
      e => e.id === owner.primaryEmailAddressId
    )?.emailAddress;

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const publicUrl = `${appUrl}/p/${proposal.publicId}`;

    // Get business name for the client confirmation email
    const bizSettings = await prisma.businessSettings.findUnique({
      where: { userId: proposal.createdBy },
    });
    const businessName = bizSettings?.businessName || "The Product Bus";

    // Send to client
    await sendAcceptanceConfirmationToClient({
      to:            proposal.clientEmail,
      clientName:    proposal.clientName,
      proposalTitle: proposal.title,
      signerName,
      businessName,
      publicUrl,
    });

    // Send to owner
    if (ownerEmail) {
      await sendAcceptanceNotificationToOwner({
        ownerEmail,
        clientName:    proposal.clientName,
        signerName,
        proposalTitle: proposal.title,
        totalValue:    proposal.totalValue,
        currency:      proposal.currency,
        proposalId:    proposal.id,
        acceptedAt:    acceptedAt.toLocaleString("en-AU", { timeZone: "Australia/Sydney" }),
      });
    }
  } catch (err) {
    // Don't fail the acceptance if notifications error
    console.error("Failed to send acceptance notifications:", err);
  }

  return NextResponse.json({ success: true, acceptedAt: acceptedAt.toISOString() });
}
