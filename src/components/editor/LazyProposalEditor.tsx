"use client";

import dynamic from "next/dynamic";

// TipTap stays out of the first page bundle. The chunk loads when this
// component is actually rendered (the editor step, not the start chooser).
export const ProposalEditor = dynamic(
  () => import("./ProposalEditor").then((mod) => mod.ProposalEditor),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm text-gray-500">Loading editor…</div>
    ),
  }
);
