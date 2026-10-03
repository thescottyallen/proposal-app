import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { PublicProposalView } from "./PublicProposalView";
import { sendOpenNotification } from "@/lib/email";
import { parseAgreedSummary } from "@/lib/agreed-summary";
import { isProposalDocument } from "@/lib/proposal-document";
import { pricingDataForClient } from "@/lib/proposal-detail";
import { publicProposalPayload } from "@/lib/public-proposal";
import { expiryUpdateWhere, statusAfterUpdate, viewedUpdateWhere } from "@/lib/proposal-accept";
import { isFirstOpen } from "@/lib/proposal-open";

interface Props {
  params: Promise<{ publicId: string }>;
}

export default async function PublicProposalPage({ params }: Props) {
  const { publicId } = await params;
  const { userId } = await auth();

  const proposal = await prisma.proposal.findUnique({
    where: { publicId },
    select: {
      id: true,
      title: true,
      clientName: true,
      clientEmail: true,
      clientAbn: true,
      content: true,
      status: true,
      expiresAt: true,
      invoiceNumber: true,
      totalValue: true,
      createdBy: true,
      currency: true,
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
    },
  });

  // Drafts stay on this same public URL so a copied preview link (and a
  // preview email) opens the proposal without a staff login. Opens are only
  // tracked, and acceptance only enabled, once the proposal is sent.
  if (!proposal) {
    notFound();
  }

  // Expire only from the status just read, so a newer status is left alone.
  if (
    proposal.expiresAt &&
    new Date(proposal.expiresAt) < new Date() &&
    (proposal.status === "SENT" || proposal.status === "VIEWED")
  ) {
    const expired = await prisma.proposal.updateMany({
      where: expiryUpdateWhere(proposal.id, proposal.status),
      data:  { status: "EXPIRED" },
    });
    proposal.status = statusAfterUpdate({
      updatedCount: expired.count,
      previousStatus: proposal.status,
      nextStatus: "EXPIRED",
    });
    if (expired.count !== 1) {
      const current = await prisma.proposal.findUnique({
        where: { id: proposal.id },
        select: { status: true },
      });
      if (current) proposal.status = current.status;
    }
  }

  // Log open event and handle first-open notification
  // Skip tracking if the viewer is the proposal owner
  const isOwner = userId === proposal.createdBy;
  if (!isOwner && ["SENT", "VIEWED"].includes(proposal.status)) {
    // Lock this proposal so two opens at once only send one first-open email.
    const notifyOwner = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM proposals WHERE id = ${proposal.id} FOR UPDATE`;
      const existingOpenCount = await tx.proposalEvent.count({
        where: { proposalId: proposal.id, eventType: "opened" },
      });
      await tx.proposalEvent.create({
        data: { proposalId: proposal.id, eventType: "opened" },
      });
      return isFirstOpen(existingOpenCount);
    });

    // First open: notify owner and update status to VIEWED
    if (notifyOwner) {
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
      const viewed = await prisma.proposal.updateMany({
        where: viewedUpdateWhere(proposal.id),
        data:  { status: "VIEWED" },
      });
      proposal.status = statusAfterUpdate({
        updatedCount: viewed.count,
        previousStatus: proposal.status,
        nextStatus: "VIEWED",
      });
      if (viewed.count !== 1) {
        const current = await prisma.proposal.findUnique({
          where: { id: proposal.id },
          select: { status: true },
        });
        if (current) proposal.status = current.status;
      }
    }
  }

  // v2 documents keep pricing inside content. Only legacy rows need this column.
  let pricingData: Record<string, unknown> | null = null;
  if (!isProposalDocument(proposal.content)) {
    const legacy = await prisma.proposal.findUnique({
      where: { id: proposal.id },
      select: { pricingData: true },
    });
    pricingData = pricingDataForClient(proposal.content, legacy?.pricingData ?? null);
  }

  // Load business settings to show on the proposal (business name, ABN)
  const bizSettings = await prisma.businessSettings.findUnique({
    where: { userId: proposal.createdBy },
    select: { businessName: true, abn: true },
  });

  // The acceptance event keeps what was agreed, even if the proposal is edited later.
  let agreedSummary = null;
  if (proposal.status === "ACCEPTED") {
    const acceptedEvent = await prisma.proposalEvent.findFirst({
      where: { proposalId: proposal.id, eventType: "accepted" },
      orderBy: { createdAt: "desc" },
    });
    const metadata = acceptedEvent?.metadata;
    const stored = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as { agreed?: unknown }).agreed
      : null;
    agreedSummary = parseAgreedSummary(stored);
  }

  return (
    <PublicProposalView
      proposal={publicProposalPayload({
        id:            proposal.id,
        title:         proposal.title,
        clientName:    proposal.clientName,
        clientEmail:   proposal.clientEmail,
        clientAbn:     proposal.clientAbn,
        content:       proposal.content,
        status:        proposal.status,
        expiresAt:     proposal.expiresAt?.toISOString() ?? null,
        invoiceNumber: proposal.invoiceNumber,
        totalValue:    proposal.totalValue,
        pricingData,
        currency:           proposal.currency,
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
      })}
      business={{
        businessName: bizSettings?.businessName ?? "",
        abn:          bizSettings?.abn ?? null,
      }}
      agreedSummary={agreedSummary}
    />
  );
}
