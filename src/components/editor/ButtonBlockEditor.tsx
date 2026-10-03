"use client";

import { useState } from "react";
import { ChevronDown, MousePointerClick, TriangleAlert } from "lucide-react";
import { AnchoredPanel } from "./AnchoredPanel";
import {
  buttonLinkType,
  buttonWebAddress,
  resolveButtonLink,
  type ButtonBlock,
  type ProposalPage,
} from "@/lib/proposal-document";
import { publicButtonHref } from "@/lib/public-proposal";

interface ButtonBlockEditorProps {
  block: ButtonBlock;
  pages: ProposalPage[];
  onChange: (updated: ButtonBlock) => void;
  readOnly?: boolean;
  /** Drop the outer card when the button sits inside a column cell. */
  embedded?: boolean;
  onNavigatePage?: (pageId: string) => void;
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

function openWebAddress(href: string) {
  const url = publicButtonHref(href);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ButtonBlockEditor({
  block,
  pages,
  onChange,
  readOnly,
  embedded = false,
  onNavigatePage,
}: ButtonBlockEditorProps) {
  const style     = block.style     ?? "primary";
  const alignment = block.alignment ?? "center";
  const label     = block.label     || "Click here";
  const linkType  = buttonLinkType(block);
  const resolved  = resolveButtonLink(block, pages);
  const missing   = resolved.kind === "missing-page";
  const [pageMenuAnchor, setPageMenuAnchor] = useState<HTMLElement | null>(null);

  const selectedPageName =
    resolved.kind === "page" ? resolved.pageName : missing ? "Deleted page" : "";

  const setWebAddress = (href: string) => {
    onChange({ ...block, linkType: "url", href, targetPageId: href });
  };

  const setPageTarget = (pageId: string) => {
    onChange({ ...block, linkType: "page", targetPageId: pageId });
    setPageMenuAnchor(null);
  };

  if (readOnly) {
    if (missing) {
      return (
        <DeletedPageWarning label={label} style={style} alignment={alignment} backgroundColor={block.backgroundColor} />
      );
    }
    return (
      <ButtonBlockView
        block={block}
        pages={pages}
        onNavigatePage={onNavigatePage}
        bare={embedded}
      />
    );
  }

  const shell = embedded
    ? "space-y-4"
    : "rounded-lg border border-gray-200 shadow-sm";

  return (
    <div className={shell} style={embedded ? undefined : { backgroundColor: block.backgroundColor || "#ffffff" }}>
      {!embedded && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
          <MousePointerClick size={14} className="text-indigo-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Button</span>
        </div>
      )}

      <div className={embedded ? "space-y-4" : "px-6 py-5 space-y-4"}>
        {missing && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <p>
              This page was deleted. Choose another page. Clients will not see this button until it points at a page.
            </p>
          </div>
        )}

        <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
          <span
            className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold cursor-default transition-colors ${STYLE_CLASSES[style]} ${missing ? "opacity-50" : ""}`}
          >
            {label || "Button label…"}
          </span>
        </div>

        <div className={`grid gap-3 ${embedded ? "grid-cols-1" : "grid-cols-2"}`}>
          <div className={embedded ? "" : "col-span-2"}>
            <label className="block text-xs text-gray-500 mb-1">Button label</label>
            <input
              type="text"
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="e.g. View pricing"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className={embedded ? "" : "col-span-2"}>
            <label className="block text-xs text-gray-500 mb-1">Link</label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  const href = buttonWebAddress(block) || block.href || "https://";
                  setWebAddress(href);
                }}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  linkType === "url" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Web address
              </button>
              <button
                type="button"
                data-testid="button-link-type-page"
                onClick={() => {
                  const current = pages.some((page) => page.id === block.targetPageId)
                    ? block.targetPageId
                    : "";
                  onChange({ ...block, linkType: "page", targetPageId: current });
                }}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  linkType === "page" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Page in this proposal
              </button>
            </div>

            {linkType === "url" ? (
              <>
                <input
                  type="url"
                  value={buttonWebAddress(block)}
                  onChange={(e) => setWebAddress(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/^http:\/\//i.test(buttonWebAddress(block).trim()) && (
                  <p className="mt-1 text-xs text-amber-700">This link will open with https.</p>
                )}
              </>
            ) : (
              <div className="mt-2">
                <button
                  type="button"
                  data-testid="button-page-select"
                  aria-haspopup="listbox"
                  aria-expanded={pageMenuAnchor !== null}
                  onClick={(event) => {
                    setPageMenuAnchor((current) =>
                      current ? null : event.currentTarget
                    );
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-lg bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    missing ? "border-amber-300 text-amber-800" : "border-gray-200 text-gray-900"
                  }`}
                >
                  <span className={selectedPageName ? "" : "text-gray-400"}>
                    {selectedPageName || "Select a page…"}
                  </span>
                  <ChevronDown size={14} className="text-gray-400 shrink-0" />
                </button>
                {pageMenuAnchor && (
                  <AnchoredPanel
                    anchor={pageMenuAnchor}
                    onClose={() => setPageMenuAnchor(null)}
                    matchAnchorWidth
                  >
                    <ul
                      role="listbox"
                      data-testid="button-page-menu"
                      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                    >
                      {pages.length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-400">No pages yet</li>
                      )}
                      {pages.map((page) => (
                        <li key={page.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={page.id === block.targetPageId}
                            onClick={() => setPageTarget(page.id)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                              page.id === block.targetPageId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"
                            }`}
                          >
                            {page.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </AnchoredPanel>
                )}
              </div>
            )}
          </div>

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

function DeletedPageWarning({
  label,
  style,
  alignment,
  backgroundColor,
}: {
  label: string;
  style: string;
  alignment: string;
  backgroundColor?: string;
}) {
  return (
    <div
      className="rounded-lg border border-amber-200 shadow-sm px-8 py-6"
      style={{ backgroundColor: backgroundColor || "#fffbeb" }}
    >
      <div className="flex items-start gap-2 mb-3 text-xs text-amber-800">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <p>This page was deleted. Clients will not see this button.</p>
      </div>
      <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
        <span className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold opacity-50 ${STYLE_CLASSES[style]}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** Read-only render used on the public proposal and in the editor preview. */
export function ButtonBlockView({
  block,
  pages,
  onNavigatePage,
  bare = false,
}: {
  block: ButtonBlock;
  pages: { id: string; name: string }[];
  onNavigatePage?: (pageId: string) => void;
  bare?: boolean;
}) {
  const style     = block.style     ?? "primary";
  const alignment = block.alignment ?? "center";
  const label     = block.label     || "Click here";
  const resolved  = resolveButtonLink(block, pages);

  // A button whose page was deleted is left out of the public page.
  if (resolved.kind === "missing-page" || resolved.kind === "unset") return null;

  const handleClick = () => {
    if (resolved.kind === "url") {
      openWebAddress(resolved.href);
      return;
    }
    onNavigatePage?.(resolved.pageId);
  };

  const control = (
    <div className={`flex ${ALIGN_CLASSES[alignment]}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold transition-colors ${STYLE_CLASSES[style]}`}
      >
        {label}
      </button>
    </div>
  );

  if (bare) return control;

  return (
    <div
      className="rounded-lg border border-gray-200 shadow-sm px-8 py-6"
      style={{ backgroundColor: block.backgroundColor || "#ffffff" }}
    >
      {control}
    </div>
  );
}
