import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendPreviewEmail } from "@/lib/email";
import { recipientNameFromProposal } from "@/lib/email-greeting";
import { readProposalEmailRequest, recipientMetadata } from "@/lib/email-recipients";
import { authorizeProposalEmail } from "@/lib/proposal-email-access";

// POST /api/proposals/:id/preview
// Emails a working preview link. Does not change proposal status.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await authorizeProposalEmail(id);
  if (!access.ok) return access.response;
  const proposal = access.proposal;

  if (!proposal.publicId) {
    return NextResponse.json({ error: "This proposal has no preview link" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = readProposalEmailRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const user       = await currentUser();
  const senderName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || undefined;

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${appUrl}/p/${proposal.publicId}`;

  try {
    await sendPreviewEmail({
      to:            parsed.to,
      cc:            parsed.cc,
      bcc:           parsed.bcc,
      recipientName: recipientNameFromProposal(parsed.to[0], proposal),
      proposalTitle: proposal.title,
      publicUrl,
      senderName,
      message:       parsed.message,
    });

    await prisma.proposalEvent.create({
      data: {
        proposalId: id,
        eventType:  "preview_sent",
        metadata:   recipientMetadata(parsed.to, parsed.cc, parsed.bcc),
      },
    });

    return NextResponse.json({ success: true, publicUrl });
  } catch (error) {
    console.error("Failed to send preview email:", error);
    return NextResponse.json(
      { error: "Failed to send email. Please check your Resend API key." },
      { status: 500 }
    );
  }
}
