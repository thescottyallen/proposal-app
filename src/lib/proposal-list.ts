import { prisma } from "@/lib/prisma";
import { proposalAccessWhere, type AppRole } from "@/lib/roles";
import { PROPOSAL_LIST_SELECT } from "@/lib/proposal-payload";

export { PROPOSAL_LIST_SELECT };

export interface ProposalListItem {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  status: string;
  totalValue: number | null;
  currency: string;
  invoiceNumber: string | null;
  publicId: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
  _count: { events: number };
}

export async function listAccessibleProposals(
  role: AppRole,
  userId: string
): Promise<ProposalListItem[]> {
  const rows = await prisma.proposal.findMany({
    where: proposalAccessWhere(role, userId),
    orderBy: { createdAt: "desc" },
    select: PROPOSAL_LIST_SELECT,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    status: row.status,
    totalValue: row.totalValue,
    currency: row.currency,
    invoiceNumber: row.invoiceNumber,
    publicId: row.publicId,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    _count: row._count,
  }));
}
