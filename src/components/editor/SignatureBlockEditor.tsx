"use client";

import { PenLine } from "lucide-react";

/**
 * Editor-side preview of a signature block.
 * The actual accept form is rendered in PublicProposalView for clients.
 */
export function SignatureBlockEditor() {
  return (
    <div className="bg-white rounded-lg border border-dashed border-gray-300">
      <div className="px-6 py-8 flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mb-3">
          <PenLine size={20} className="text-purple-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">
          Signature &amp; Acceptance
        </p>
        <p className="text-xs text-gray-400 max-w-xs">
          Clients will see an &ldquo;Accept this proposal&rdquo; form here
          where they type their full name and click Accept.
        </p>
      </div>
    </div>
  );
}
