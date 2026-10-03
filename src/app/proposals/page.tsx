import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/ui/Shell";
import { ProposalsView } from "@/components/proposals/ProposalsView";
import { getAuthContext } from "@/lib/roles.server";
import { listAccessibleProposals } from "@/lib/proposal-list";

export const dynamic = "force-dynamic";

function ProposalsFallback() {
  return (
    <Shell>
      <div className="px-8 py-8 text-sm text-gray-500">Loading proposals…</div>
    </Shell>
  );
}

async function ProposalsData() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  const proposals = await listAccessibleProposals(ctx.role, ctx.userId);
  return <ProposalsView proposals={proposals} />;
}

export default function ProposalsPage() {
  return (
    <Suspense fallback={<ProposalsFallback />}>
      <ProposalsData />
    </Suspense>
  );
}
