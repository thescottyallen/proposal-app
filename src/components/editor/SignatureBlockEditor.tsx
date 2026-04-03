"use client";

import { PenLine } from "lucide-react";
import { useRef, useEffect } from "react";

const DEFAULT_MESSAGE =
  "By entering your name below and clicking Accept, you confirm that you have read and agree to the terms of this proposal. Your acceptance will be recorded with a timestamp and IP address.";

interface SignatureBlockEditorProps {
  message?: string;
  onChange?: (message: string) => void;
  readOnly?: boolean;
}

/**
 * Editor-side preview of the Acceptance block.
 * Shows an editable acceptance message. The actual accept form is
 * rendered in PublicProposalView for clients.
 */
export function SignatureBlockEditor({
  message,
  onChange,
  readOnly,
}: SignatureBlockEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  return (
    <div className="bg-white rounded-lg border border-dashed border-gray-300">
      <div className="px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
            <PenLine size={18} className="text-purple-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Acceptance Block</p>
            <p className="text-xs text-gray-400">Clients type their name and click Accept</p>
          </div>
        </div>

        {/* Editable acceptance message */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
            Acceptance message
          </label>
          {readOnly ? (
            <p className="text-sm text-gray-600 leading-relaxed">
              {message || DEFAULT_MESSAGE}
            </p>
          ) : (
            <textarea
              ref={textareaRef}
              value={message ?? DEFAULT_MESSAGE}
              onChange={(e) => onChange?.(e.target.value)}
              rows={3}
              className="w-full text-sm text-gray-600 leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              placeholder="Enter the acceptance message clients will see..."
            />
          )}
        </div>

        {/* Preview of what client sees */}
        <div className="border border-gray-100 rounded-lg bg-gray-50 px-4 py-3 space-y-3 opacity-60 pointer-events-none select-none">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Full name</p>
            <div className="h-9 bg-white border border-gray-200 rounded-lg" />
          </div>
          <div className="h-10 bg-blue-600 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_MESSAGE as DEFAULT_ACCEPTANCE_MESSAGE };
