"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProposalPage, SidebarSettings } from "@/lib/proposal-document";

function isDarkColour(hex: string): boolean {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Back / Next row shown under a proposal page. Labels use the neighbouring
 * page names. The first page has no Back; the last page has no Next.
 * Button colours follow the proposal sidebar.
 */
export function PageNavRow({
  pages,
  activePageId,
  onSelectPage,
  sidebar,
}: {
  pages: ProposalPage[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  sidebar?: SidebarSettings;
}) {
  const index = pages.findIndex((page) => page.id === activePageId);
  if (index < 0 || pages.length < 2) return null;

  const prev = index > 0 ? pages[index - 1] : null;
  const next = index < pages.length - 1 ? pages[index + 1] : null;
  if (!prev && !next) return null;

  const backgroundColor = sidebar?.backgroundColor || "#ffffff";
  const dark = isDarkColour(backgroundColor);
  const style = {
    backgroundColor,
    color: dark ? "#ffffff" : "#1f2937",
    borderColor: dark ? "transparent" : "#e5e7eb",
  };
  const buttonClass =
    "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-sm transition-opacity hover:opacity-90";

  return (
    <nav aria-label="Page" data-testid="page-nav" className="mt-8 flex items-stretch gap-3">
      {prev ? (
        <button
          type="button"
          onClick={() => onSelectPage(prev.id)}
          className={`${buttonClass} justify-start text-left`}
          style={style}
        >
          <ChevronLeft size={16} className="shrink-0" />
          <span className="truncate">Back: {prev.name}</span>
        </button>
      ) : (
        <div className="flex-1" aria-hidden />
      )}
      {next ? (
        <button
          type="button"
          onClick={() => onSelectPage(next.id)}
          className={`${buttonClass} justify-end text-right`}
          style={style}
        >
          <span className="truncate">Next: {next.name}</span>
          <ChevronRight size={16} className="shrink-0" />
        </button>
      ) : (
        <div className="flex-1" aria-hidden />
      )}
    </nav>
  );
}
