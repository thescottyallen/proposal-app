import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/ui/Shell";
import { getAuthContext } from "@/lib/roles.server";
import { loadEditorProposal, loadEditorSettings } from "@/lib/proposal-detail";
import { EditProposalClient } from "./EditProposalClient";

export const dynamic = "force-dynamic";

function EditorFallback() {
  return (
    <Shell>
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading proposal...</p>
      </div>
    </Shell>
  );
}

async function EditorData({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");

  const [proposal, settings] = await Promise.all([
    loadEditorProposal(id, ctx),
    loadEditorSettings(ctx.userId),
  ]);
  if (!proposal) notFound();

  return (
    <EditProposalClient
      key={id}
      proposalId={id}
      initialProposal={proposal}
      initialSettings={settings}
    />
  );
}

export default function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <EditorData params={params} />
    </Suspense>
  );
}
