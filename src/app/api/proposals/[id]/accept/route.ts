import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  sendAcceptanceConfirmationToClient,
  sendAcceptanceNotificationToOwner,
} from "@/lib/email";
import { roleFromMetadata } from "@/lib/roles";
import {
  isProposalDocument,
  applyClientChoices,
  getAllPricingBlocks,
  ProposalDocument,
} from "@/lib/proposal-document";
import type { ProposalPricingData } from "@/lib/pricing-types";
import { computePricingTotals } from "@/lib/utils";

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

  if (!["SENT", "VIEWED"].includes(proposal.status)) {
    return NextResponse.json(
      { error: "This proposal cannot be accepted in its current state." },
      { status: 409 }
    );
  }

  if (proposal.expiresAt && new Date(proposal.expiresAt) < new Date()) {
    await prisma.proposal.update({ where: { id }, data: { status: "EXPIRED" } });
    return NextResponse.json(
      { error: "This proposal has expired and can no longer be accepted." },
      { status: 410 }
    );
  }

  const body = await request.json();
  const { signerName, clientIncluded, clientAbn } = body as {
    signerName:     string;
    clientIncluded: Record<string, boolean>;
    clientAbn?:     string | null;
  };

  if (!signerName?.trim()) {
    return NextResponse.json({ error: "Signer name is required." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const acceptedAt = new Date();

  // Determine how to update clientIncluded based on content format
  const rawContent = proposal.content as Record<string, unknown>;
  let contentUpdate: Record<string, unknown> | undefined;
  let pricingDataUpdate: object | undefined;
  let totalValueUpdate: number | undefined;

  if (isProposalDocument(rawContent)) {
    // New format: update clientIncluded within the document's pricing blocks
    const updatedDoc = applyClientChoices(
      rawContent as unknown as ProposalDocument,
      clientIncluded
    );
    contentUpdate = updatedDoc as unknown as Record<string, unknown>;
    // Recompute the accepted total from the client's final choices (so a chosen
    // payment option, not the sum of alternatives, is what gets recorded).
    let sum = 0;
    for (const block of getAllPricingBlocks(updatedDoc)) {
      sum += computePricingTotals(block.pricingData, block.pricingSettings).grandTotal ?? 0;
    }
    totalValueUpdate = sum;
  } else {
    // Legacy format: update the separate pricingData column
    const existingPricing = proposal.pricingData as ProposalPricingData | null;
    if (existingPricing) {
      pricingDataUpdate = {
        ...existingPricing,
        items: existingPricing.items.map((item) => ({
          ...item,
          clientIncluded: item.isOptional
            ? (clientIncluded[item.id] ?? item.clientIncluded)
            : true,
        })),
      };
    }
  }

  await prisma.proposal.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      ...(contentUpdate    && { content:     contentUpdate as object }),
      ...(pricingDataUpdate && { pricingData: pricingDataUpdate }),
      ...(totalValueUpdate !== undefined && { totalValue: totalValueUpdate }),
      // Client-supplied ABN for the invoice (optional; only overwrite if given)
      ...(clientAbn && clientAbn.trim() ? { clientAbn: clientAbn.trim() } : {}),
    },
  });

  await prisma.proposalEvent.create({
    data: {
      proposalId: id,
      eventType:  "accepted",
      ipAddress:  ip,
      metadata: {
        signerName,
        acceptedAt:     acceptedAt.toISOString(),
        clientIncluded,
        clientAbn:      clientAbn?.trim() || null,
      },
    },
  });

  try {
    const client    = await clerkClient();
    const owner     = await client.users.getUser(proposal.createdBy);
    const ownerEmail = owner.emailAddresses.find(
      (e) => e.id === owner.primaryEmailAddressId
    )?.emailAddress;

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const publicUrl = `${appUrl}/p/${proposal.publicId}`;

    const bizSettings = await prisma.businessSettings.findUnique({
      where: { userId: proposal.createdBy },
    });
    const businessName = bizSettings?.businessName || "The Product Bus";

    // Cast to access new fields before the next `prisma generate` run
    const biz = bizSettings as typeof bizSettings & {
      acceptanceEmailSubject?: string | null;
      acceptanceEmailMessage?: string | null;
    };

    await sendAcceptanceConfirmationToClient({
      to:             proposal.clientEmail,
      clientName:     proposal.clientName,
      proposalTitle:  proposal.title,
      signerName,
      businessName,
      publicUrl,
      customSubject:  biz?.acceptanceEmailSubject ?? undefined,
      customMessage:  biz?.acceptanceEmailMessage ?? undefined,
    });

    // Notify the proposal owner AND every admin, deduplicated by email, so an
    // acceptance reaches the whole admin team regardless of who authored it.
    const recipients = new Set<string>();
    if (ownerEmail) recipients.add(ownerEmail);
    let adminCount = 0;
    try {
      const { data: users } = await client.users.getUserList({ limit: 100 });
      console.log(`[accept] getUserList returned ${users.length} user(s)`);
      for (const u of users) {
        const role = roleFromMetadata(u.publicMetadata as Record<string, unknown>);
        if (role !== "admin") continue;
        adminCount++;
        const adminEmail = u.emailAddresses.find(
          (e) => e.id === u.primaryEmailAddressId
        )?.emailAddress;
        if (adminEmail) recipients.add(adminEmail);
      }
      console.log(`[accept] found ${adminCount} admin(s)`);
    } catch (listErr) {
      console.error(
        "[accept] getUserList failed:",
        listErr instanceof Error ? listErr.message : String(listErr)
      );
    }
    console.log(`[accept] notifying ${recipients.size} recipient(s)`);

    // Resend limits sending to ~2 requests/second. The client confirmation was
    // just sent, so space out each admin notification to stay under the limit
    // (otherwise all but the first were rejected as "Too many requests").
    const acceptedAtLabel = acceptedAt.toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    for (const email of recipients) {
      await sleep(600);
      await sendAcceptanceNotificationToOwner({
        ownerEmail:    email,
        clientName:    proposal.clientName,
        signerName,
        proposalTitle: proposal.title,
        totalValue:    proposal.totalValue,
        currency:      proposal.currency,
        proposalId:    proposal.id,
        acceptedAt:    acceptedAtLabel,
      });
    }
  } catch (err) {
    console.error("Failed to send acceptance notifications:", err);
  }

  return NextResponse.json({ success: true, acceptedAt: acceptedAt.toISOString() });
}
