"use client";

import { useState } from "react";
import { Plus, PencilLine, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProposalPage } from "@/lib/proposal-document";

interface PageSidebarProps {
  pages: ProposalPage[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onRenamePage: (id: string, name: string) => void;
}

export function PageSidebar({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
}: PageSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

  return (
    <div className="w-48 shrink-0 border-r border-gray-200 bg-white flex flex-col sticky top-0 h-screen">
      <div className="px-3 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Pages
        </p>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {pages.map((page, i) => (
          <div
            key={page.id}
            className={cn(
              "group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
              page.id === activePageId
                ? "bg-blue-50 border-r-2 border-blue-600"
                : "hover:bg-gray-50"
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
                  className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded focus:outline-none min-w-0"
                />
                <button
                  onClick={commitEdit}
                  className="text-green-600 hover:text-green-700 shrink-0"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={cancelEdit}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-gray-400 shrink-0 w-4 text-right">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-sm truncate",
                      page.id === activePageId
                        ? "text-blue-700 font-medium"
                        : "text-gray-700"
                    )}
                  >
                    {page.name}
                  </span>
                </div>
                <button
                  onClick={(e) => startEdit(page, e)}
                  className="shrink-0 p-0.5 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Rename page"
                >
                  <PencilLine size={12} />
                </button>
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100">
        <button
          onClick={onAddPage}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          <Plus size={12} />
          Add page
        </button>
      </div>
    </div>
  );
}
