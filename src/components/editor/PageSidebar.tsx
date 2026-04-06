"use client";

import { useRef, useState } from "react";
import { Plus, PencilLine, Check, X, Upload, Palette, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProposalPage, SidebarSettings } from "@/lib/proposal-document";

interface PageSidebarProps {
  pages: ProposalPage[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onRenamePage: (id: string, name: string) => void;
  onDeletePage?: (id: string) => void;
  onMovePage?: (id: string, direction: "up" | "down") => void;
  /** Current sidebar branding settings */
  sidebar?: SidebarSettings;
  /** When provided, editing controls (logo upload, colour picker) are shown */
  onUpdateSidebar?: (settings: SidebarSettings) => void;
}

export function PageSidebar({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
  onMovePage,
  sidebar,
  onUpdateSidebar,
}: PageSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  const startEdit = (page: ProposalPage, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(page.id);
    setEditingName(page.name);
  };

  const commitEdit = () => {
    if (editingId && editingName.trim()) {
      onRenamePage(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) onUpdateSidebar?.({ ...sidebar, logoUrl: data.url });
    } finally {
      setUploadingLogo(false);
    }
  };

  const bgColor = sidebar?.backgroundColor || "#ffffff";

  // Pick contrasting text colours based on sidebar brightness
  const isDark = (() => {
    try {
      const hex = bgColor.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    } catch {
      return false;
    }
  })();

  const textClass      = isDark ? "text-white/90"  : "text-gray-700";
  const subTextClass   = isDark ? "text-white/50"  : "text-gray-400";
  const activeClass    = isDark ? "bg-white/15 border-r-2 border-white" : "bg-blue-50 border-r-2 border-blue-600";
  const hoverClass     = isDark ? "hover:bg-white/10"  : "hover:bg-gray-50";
  const dividerClass   = isDark ? "border-white/10"    : "border-gray-200";
  const iconClass      = isDark ? "text-white/60 hover:text-white/90" : "text-gray-400 hover:text-gray-600";
  const dashedBtnClass = isDark
    ? "border-white/20 text-white/50 hover:border-white/40 hover:text-white/70"
    : "border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800";

  return (
    <div
      className={cn("w-52 shrink-0 border-r flex flex-col sticky top-0 h-screen", dividerClass)}
      style={{ backgroundColor: bgColor }}
    >
      {/* ── Logo / branding area ── */}
      <div className={cn("px-3 py-3 border-b min-h-[64px] flex items-center", dividerClass)}>
        {sidebar?.logoUrl ? (
          <div className="group/logo relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sidebar.logoUrl}
              alt="Logo"
              className="max-h-14 max-w-full object-contain"
            />
            {onUpdateSidebar && (
              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/logo:opacity-100 transition-opacity bg-black/30 rounded">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-2 py-0.5 bg-white text-gray-800 text-[10px] font-medium rounded shadow"
                >
                  Change
                </button>
                <button
                  onClick={() => onUpdateSidebar({ ...sidebar, logoUrl: undefined })}
                  className="px-2 py-0.5 bg-white text-red-600 text-[10px] font-medium rounded shadow"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          onUpdateSidebar && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed text-xs transition-colors",
                dashedBtnClass
              )}
            >
              {uploadingLogo ? (
                <span className="animate-pulse">Uploading…</span>
              ) : (
                <><Upload size={12} />Add logo</>
              )}
            </button>
          )
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLogoUpload(f);
          }}
        />
      </div>

      {/* ── Section label ── */}
      <div className={cn("px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide", subTextClass)}>
        Pages
      </div>

      {/* ── Page list ── */}
      <nav className="flex-1 py-1 overflow-y-auto">
        {pages.map((page, i) => (
          <div
            key={page.id}
            className={cn(
              "group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
              page.id === activePageId ? activeClass : hoverClass
            )}
            onClick={() => {
              if (editingId !== page.id) onSelectPage(page.id);
            }}
          >
            {editingId === page.id ? (
              <div
                className="flex items-center gap-1 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded bg-white focus:outline-none min-w-0"
                />
                <button onClick={commitEdit} className="text-green-500 shrink-0">
                  <Check size={12} />
                </button>
                <button onClick={cancelEdit} className="text-gray-400 shrink-0">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={cn("text-xs shrink-0 w-4 text-right", subTextClass)}>
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-sm truncate",
                      page.id === activePageId
                        ? isDark ? "text-white font-medium" : "text-blue-700 font-medium"
                        : textClass
                    )}
                  >
                    {page.name}
                  </span>
                </div>
                {onUpdateSidebar !== undefined && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {onMovePage && i > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMovePage(page.id, "up"); }}
                        className={cn("p-0.5", iconClass)}
                        title="Move page up"
                      >
                        <ChevronUp size={12} />
                      </button>
                    )}
                    {onMovePage && i < pages.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMovePage(page.id, "down"); }}
                        className={cn("p-0.5", iconClass)}
                        title="Move page down"
                      >
                        <ChevronDown size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => startEdit(page, e)}
                      className={cn("p-0.5", iconClass)}
                      title="Rename page"
                    >
                      <PencilLine size={12} />
                    </button>
                    {onDeletePage && pages.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete page "${page.name}"? This cannot be undone.`)) {
                            onDeletePage(page.id);
                          }
                        }}
                        className={cn("p-0.5", isDark ? "text-white/40 hover:text-red-300" : "text-gray-300 hover:text-red-500")}
                        title="Delete page"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className={cn("px-3 py-3 border-t space-y-2", dividerClass)}>
        {onUpdateSidebar && (
          <button
            onClick={onAddPage}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-dashed rounded-lg transition-colors",
              dashedBtnClass
            )}
          >
            <Plus size={12} />
            Add page
          </button>
        )}

        {/* Sidebar background colour */}
        {onUpdateSidebar && (
          <div className="flex items-center justify-between">
            <span className={cn("text-xs", subTextClass)}>Sidebar colour</span>
            <button
              onClick={() => colorRef.current?.click()}
              className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors", iconClass)}
              title="Change sidebar background colour"
            >
              <Palette size={12} />
              <span
                className="w-4 h-4 rounded border border-black/10 inline-block"
                style={{ backgroundColor: bgColor }}
              />
            </button>
            <input
              ref={colorRef}
              type="color"
              value={bgColor}
              onChange={(e) =>
                onUpdateSidebar({ ...sidebar, backgroundColor: e.target.value })
              }
              className="sr-only"
            />
          </div>
        )}
      </div>
    </div>
  );
}
