import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/ui/Shell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getAuthContext } from "@/lib/roles.server";
import { listAccessibleProposals } from "@/lib/proposal-list";

export const dynamic = "force-dynamic";

function DashboardFallback() {
  return (
    <Shell>
      <div className="px-8 py-8 text-sm text-gray-500">Loading proposals…</div>
    </Shell>
  );
}

async function DashboardData() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  const proposals = await listAccessibleProposals(ctx.role, ctx.userId);
  return <DashboardView proposals={proposals} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardData />
    </Suspense>
  );
}
