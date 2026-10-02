import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isProposalDocument } from "@/lib/proposal-document";

// POST /api/events
// Records a client page view. The same event is sent for sidebar clicks,
// in-proposal buttons, and Back / Next. Draft previews and the proposal
// owner are ignored so staff browsing does not look like a client visit.
export async function POST(request: NextRequest) {
  let body: { proposalId?: unknown; eventType?: unknown; sectionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
  const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
  if (body.eventType !== "viewed_section" || !proposalId || !sectionId) {
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["SENT", "VIEWED"].includes(proposal.status)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { userId } = await auth();
  if (userId && userId === proposal.createdBy) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const content = proposal.content;
  const pages = isProposalDocument(content) ? content.pages : [];
  if (!pages.some((page) => page.id === sectionId)) {
    return NextResponse.json({ error: "Unknown page" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  await prisma.proposalEvent.create({
    data: {
      proposalId: proposal.id,
      eventType: "viewed_section",
      sectionId,
      userAgent: request.headers.get("user-agent"),
      ipAddress: forwarded?.split(",")[0]?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true });
}
