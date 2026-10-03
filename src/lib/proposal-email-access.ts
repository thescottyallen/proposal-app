import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mayEmailProposal } from "@/lib/roles";
import { getExplicitAuthContext } from "@/lib/roles.server";

const proposalInclude = {
  contact: { select: { name: true, email: true } },
  client: { select: { contacts: { select: { name: true, email: true } } } },
} as const;

/**
 * Load a proposal for send, preview, or follow-up.
 * Signed-out callers get 401. A missing proposal is 404.
 * A viewer, or someone with no stored role, gets 403.
 */
export async function authorizeProposalEmail(id: string) {
  const authCtx = await getExplicitAuthContext();
  if (!authCtx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: proposalInclude,
  });
  if (!proposal) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  if (
    !mayEmailProposal({
      userId: authCtx.userId,
      role: authCtx.role,
      createdBy: proposal.createdBy,
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "You don't have access to send this proposal." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, proposal, userId: authCtx.userId };
}
