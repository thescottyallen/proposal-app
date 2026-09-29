import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendPreviewEmail } from "@/lib/email";
import { recipientNameFromProposal } from "@/lib/email-greeting";
import { isValidEmail, parsedCopyLists, recipientMetadata } from "@/lib/email-recipients";

// POST /api/proposals/:id/preview
// Emails a working preview link. Does not change proposal status.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await prisma.proposal.findFirst({
    where: { id, createdBy: userId },
    include: {
      contact: { select: { name: true, email: true } },
      client:  { select: { contacts: { select: { name: true, email: true } } } },
    },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!proposal.publicId) {
    return NextResponse.json({ error: "This proposal has no preview link" }, { status: 400 });
  }

  let body: { to?: unknown; message?: unknown; cc?: unknown; bcc?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  const copies = parsedCopyLists(body.cc, body.bcc);
  if (!copies.ok) {
    return NextResponse.json({ error: copies.error }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : undefined;

  const user       = await currentUser();
  const senderName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || undefined;

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${appUrl}/p/${proposal.publicId}`;

  try {
    await sendPreviewEmail({
      to,
      cc:            copies.cc,
      bcc:           copies.bcc,
      recipientName: recipientNameFromProposal(to, proposal),
      proposalTitle: proposal.title,
      publicUrl,
      senderName,
      message,
    });

    await prisma.proposalEvent.create({
      data: {
        proposalId: id,
        eventType:  "preview_sent",
        metadata:   recipientMetadata(to, copies.cc, copies.bcc),
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
