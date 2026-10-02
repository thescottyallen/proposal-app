import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/roles.server";
import { proposalAccessWhere } from "@/lib/roles";
import { contentFromSnapshot, summarizeProposalContent } from "@/lib/proposal-save";

// GET /api/proposals/:id/revisions/:version — one saved snapshot, for preview and restore.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version: versionParam } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = Number(versionParam);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "Unknown version" }, { status: 400 });
  }

  const proposal = await prisma.proposal.findFirst({
    where: { id, ...proposalAccessWhere(ctx.role, ctx.userId) },
    select: { id: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revision = await prisma.proposalRevision.findFirst({
    where: { proposalId: id, version },
  });
  if (!revision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let savedByName = "Unknown user";
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(revision.createdBy);
    const email =
      user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress ?? "";
    savedByName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email || "Unknown user";
  } catch {
    savedByName = "Unknown user";
  }

  const content = contentFromSnapshot(revision.snapshot);
  return NextResponse.json({
    version: revision.version,
    createdAt: revision.createdAt,
    createdBy: revision.createdBy,
    savedByName,
    summary: summarizeProposalContent(content).summary,
    snapshot: revision.snapshot,
  });
}
