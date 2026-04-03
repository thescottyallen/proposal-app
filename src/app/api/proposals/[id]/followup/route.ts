import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendFollowUpEmail } from "@/lib/email";

// POST /api/proposals/:id/followup
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await prisma.proposal.findFirst({ where: { id, createdBy: userId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { to, message } = body;

  if (!to || typeof to !== "string" || !to.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  const user       = await currentUser();
  const senderName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || undefined;

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${appUrl}/p/${proposal.publicId}`;

  try {
    await sendFollowUpEmail({
      to,
      clientName:    proposal.clientName,
      proposalTitle: proposal.title,
      publicUrl,
      senderName,
      message,
    });

    await prisma.proposalEvent.create({
      data: { proposalId: id, eventType: "followup_sent" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send follow-up email:", error);
    return NextResponse.json(
      { error: "Failed to send email. Please check your Resend API key." },
      { status: 500 }
    );
  }
}
