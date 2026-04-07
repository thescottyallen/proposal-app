import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { PublicProposalView } from "./PublicProposalView";
import { sendOpenNotification } from "@/lib/email";

interface Props {
  params: Promise<{ publicId: string }>;
}

export default async function PublicProposalPage({ params }: Props) {
  const { publicId } = await params;
  const { userId } = await auth();

  const proposal = await prisma.proposal.findUnique({
    where: { publicId },
  });

  if (!proposal || proposal.status === "DRAFT") {
    notFound();
  }

  // Enforce expiry: auto-transition SENT/VIEWED to EXPIRED if past expiry date
  if (
    proposal.expiresAt &&
    new Date(proposal.expiresAt) < new Date() &&
    ["SENT", "VIEWED"].includes(proposal.status)
  ) {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data:  { status: "EXPIRED" },
    });
    proposal.status = "EXPIRED";
  }

  // Log open event and handle first-open notification
  // Skip tracking if the viewer is the proposal owner
  const isOwner = userId === proposal.createdBy;
  if (!isOwner && ["SENT", "VIEWED"].includes(proposal.status)) {
    const existingOpenCount = await prisma.proposalEvent.count({
      where: { proposalId: proposal.id, eventType: "opened" },
    });

    await prisma.proposalEvent.create({
      data: { proposalId: proposal.id, eventType: "opened" },
    });

    // First open: notify owner and update status to VIEWED
    if (existingOpenCount === 0) {
      try {
        const clerk      = await clerkClient();
        const owner      = await clerk.users.getUser(proposal.createdBy);
        const ownerEmail = owner.emailAddresses.find(
          (e) => e.id === owner.primaryEmailAddressId
        )?.emailAddress;

        if (ownerEmail) {
          await sendOpenNotification({
            ownerEmail,
            clientName:    proposal.clientName,
            proposalTitle: proposal.title,
            proposalId:    proposal.id,
          });
        }
      } catch (err) {
        console.error("Failed to send open notification:", err);
      }
    }

    if (proposal.status === "SENT") {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data:  { status: "VIEWED" },
      });
      proposal.status = "VIEWED";
    }
  }

  // Load business settings to show on the proposal (business name, ABN)
  const bizSettings = await prisma.businessSettings.findUnique({
    where: { userId: proposal.createdBy },
  });

  return (
    <PublicProposalView
      proposal={{
        id:            proposal.id,
        title:         proposal.title,
        clientName:    proposal.clientName,
        clientEmail:   proposal.clientEmail,
        clientAbn:     proposal.clientAbn,
        content:       proposal.content as Record<string, unknown>,
        status:        proposal.status,
        expiresAt:     proposal.expiresAt?.toISOString() ?? null,
        invoiceNumber: proposal.invoiceNumber,
        totalValue:    proposal.totalValue,
        // Legacy flat fields (used to migrate old proposals on the fly)
        pricingData:        proposal.pricingData as Record<string, unknown> | null,
        currency:           proposal.currency,
        exchangeRate:       proposal.exchangeRate,
        gstEnabled:         proposal.gstEnabled,
        roundingMode:       proposal.roundingMode,
        discountType:       proposal.discountType,
        discountValue:      proposal.discountValue,
        showDiscount:       proposal.showDiscount,
        depositType:        proposal.depositType,
        depositValue:       proposal.depositValue,
        billingCadence:     proposal.billingCadence,
        recurringStartMode: proposal.recurringStartMode,
        recurringStartDate: proposal.recurringStartDate?.toISOString() ?? null,
        fixedTermMonths:    proposal.fixedTermMonths,
        paymentTerms:       proposal.paymentTerms,
        latePaymentClause:  proposal.latePaymentClause,
      }}
      business={{
        businessName: bizSettings?.businessName ?? "",
        abn:          bizSettings?.abn ?? null,
      }}
    />
  );
}
