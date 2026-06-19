import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
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

/** Best-effort resolution of Clerk user IDs to display names. */
async function resolveUserNames(
  ids: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const client = await clerkClient();
  const entries = await Promise.all(
    unique.map(async (uid) => {
      try {
        const u = await client.users.getUser(uid);
        const name =
          [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
            ?.emailAddress ||
          "Unknown user";
        return [uid, name] as const;
      } catch {
        return [uid, "Unknown user"] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

// ─── GET /api/proposals/:id ───────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await prisma.proposal.findFirst({
    // Admins may open any proposal; everyone else only their own.
    where: { id, ...proposalAccessWhere(ctx.role, ctx.userId) },
    include: {
      template:  { select: { name: true } },
      events:    { orderBy: { createdAt: "desc" }, take: 50 },
      revisions: { orderBy: { version: "desc" }, take: 10, select: { version: true, createdAt: true, createdBy: true } },
    },
  });

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve names for the author plus anyone who has edited, for the change log.
  type EventForLog = { id: string; eventType: string; createdAt: Date | string; metadata: unknown };
  const editorIds = (proposal.events as EventForLog[])
    .filter((e) => e.eventType === "edited")
    .map((e) => (e.metadata as { editedBy?: string } | null)?.editedBy)
    .filter((x): x is string => Boolean(x));
  const names = await resolveUserNames([proposal.createdBy, ...editorIds]);

  const events = (proposal.events as EventForLog[]).map((e) => {
    const editedBy = (e.metadata as { editedBy?: string } | null)?.editedBy;
    return {
      ...e,
      actorName: editedBy ? (names[editedBy] ?? "Unknown user") : null,
    };
  });

  return NextResponse.json({
    ...proposal,
    events,
    authorName: names[proposal.createdBy] ?? "Unknown user",
    viewerIsAuthor: proposal.createdBy === ctx.userId,
  });
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
        createdBy:  ctx.userId,
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

  const existing = await prisma.proposal.findFirst({ where: { id } });
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
