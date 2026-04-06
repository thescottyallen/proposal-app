"use client";

import { MousePointerClick } from "lucide-react";
import type { ButtonBlock } from "@/lib/proposal-document";
import type { ProposalPage } from "@/lib/proposal-document";

interface ButtonBlockEditorProps {
  block: ButtonBlock;
  pages: ProposalPage[];
  onChange: (updated: ButtonBlock) => void;
  readOnly?: boolean;
}

const STYLE_CLASSES: Record<string, string> = {
  primary:   "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-gray-800 text-white hover:bg-gray-900",
  outline:   "bg-white text-gray-800 border-2 border-gray-800 hover:bg-gray-50",
};

const ALIGN_CLASSES: Record<string, string> = {
  left:   "justify-start",
  center: "justify-center",
  right:  "justify-end",
};

export function ButtonBlockEditor({ block, pages, onChange, readOnly }: ButtonBlockEditorProps) {
  const style     = block.style     ?? "primary";
  const alignment = block.alignment ?? "center";
  const label     = block.label     || "Click here";

  if (readOnly) {
    // In editor readOnly mode, still show a non-functional preview
    return (
      <div
        className="rounded-lg border border-gray-200 shadow-sm px-8 py-6"
        style={{ backgroundColor: block.backgroundColor || "#ffffff" }}
      >
        <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
          <span
            className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold cursor-default ${STYLE_CLASSES[style]}`}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }

  const isExternal = block.targetPageId?.startsWith("http");

  return (
    <div
      className="rounded-lg border border-gray-200 shadow-sm"
      style={{ backgroundColor: block.backgroundColor || "#ffffff" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <MousePointerClick size={14} className="text-indigo-500" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Button</span>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Preview */}
        <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
          <span
            className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold cursor-default transition-colors ${STYLE_CLASSES[style]}`}
          >
            {label || "Button label…"}
          </span>
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Label */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Button label</label>
            <input
              type="text"
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="e.g. View pricing"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Target */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Navigate to</label>
            <select
              value={isExternal ? "__external__" : (block.targetPageId || "")}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__external__") {
                  onChange({ ...block, targetPageId: "https://" });
                } else {
                  onChange({ ...block, targetPageId: val });
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a page…</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__external__">External URL…</option>
            </select>
            {isExternal && (
              <input
                type="url"
                value={block.targetPageId}
                onChange={(e) => onChange({ ...block, targetPageId: e.target.value })}
                placeholder="https://example.com"
                className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Style</label>
            <select
              value={style}
              onChange={(e) => onChange({ ...block, style: e.target.value as ButtonBlock["style"] })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="primary">Primary (blue)</option>
              <option value="secondary">Secondary (dark)</option>
              <option value="outline">Outline</option>
            </select>
          </div>

          {/* Alignment */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Alignment</label>
            <select
              value={alignment}
              onChange={(e) => onChange({ ...block, alignment: e.target.value as ButtonBlock["alignment"] })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only render used in the public proposal view */
export function ButtonBlockView({
  block,
  onNavigatePage,
}: {
  block: ButtonBlock;
  onNavigatePage?: (pageId: string) => void;
}) {
  const style     = block.style     ?? "primary";
  const alignment = block.alignment ?? "center";
  const label     = block.label     || "Click here";
  const isExternal = block.targetPageId?.startsWith("http");

  const handleClick = () => {
    if (isExternal) {
      window.open(block.targetPageId, "_blank", "noopener,noreferrer");
    } else if (block.targetPageId && onNavigatePage) {
      onNavigatePage(block.targetPageId);
    }
  };

  return (
    <div
      className="rounded-lg border border-gray-200 shadow-sm px-8 py-6"
      style={{ backgroundColor: block.backgroundColor || "#ffffff" }}
    >
      <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
        <button
          onClick={handleClick}
          className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold transition-colors ${STYLE_CLASSES[style]}`}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
