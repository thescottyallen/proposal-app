"use client";

import { useState, useEffect } from "react";
import { Editor } from "@tiptap/react";
import { Blocks, X, Search, Plus } from "lucide-react";

interface ContentBlock {
  id: string;
  name: string;
  category: string;
  content: Record<string, unknown>;
  createdAt: string;
}

interface ContentBlockPickerProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContentBlockPicker({
  editor,
  isOpen,
  onClose,
}: ContentBlockPickerProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch("/api/content-blocks")
        .then((res) => res.json())
        .then((data) => {
          setBlocks(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const categories = [...new Set(blocks.map((b) => b.category))];

  const filtered = blocks.filter((block) => {
    const matchesCategory =
      filterCategory === "ALL" || block.category === filterCategory;
    const matchesSearch =
      !search ||
      block.name.toLowerCase().includes(search.toLowerCase()) ||
      block.category.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleInsert = (block: ContentBlock) => {
    if (!editor) return;

    const blockContent = block.content as {
      type?: string;
      content?: unknown[];
    };

    // Insert the block's content nodes at the current cursor position
    if (blockContent?.content && Array.isArray(blockContent.content)) {
      // Insert each top-level node from the block
      blockContent.content.forEach((node) => {
        editor.commands.insertContent(node);
      });
    } else {
      // Fallback: insert the whole content object
      editor.commands.insertContent(blockContent);
    }

    editor.commands.focus();
    onClose();
  };

  // Extract a plain-text preview from TipTap JSON content
  const getPreviewText = (content: Record<string, unknown>): string => {
    const doc = content as { content?: Array<{ content?: Array<{ text?: string }> }> };
    if (!doc.content) return "";
    const texts: string[] = [];
    for (const node of doc.content) {
      if (node.content) {
        for (const inline of node.content) {
          if (inline.text) texts.push(inline.text);
        }
      }
    }
    const full = texts.join(" ");
    return full.length > 120 ? full.slice(0, 120) + "..." : full;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Blocks size={18} className="text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Insert Content Block
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100 overflow-x-auto">
            <button
              onClick={() => setFilterCategory("ALL")}
              className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                filterCategory === "ALL"
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                  filterCategory === cat
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Block list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading blocks...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <Blocks size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                {blocks.length === 0
                  ? "No content blocks yet. Create some in the Content Library."
                  : "No blocks match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((block) => (
                <button
                  key={block.id}
                  onClick={() => handleInsert(block)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {block.name}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {block.category}
                      </span>
                    </div>
                    <Plus
                      size={14}
                      className="text-gray-300 group-hover:text-blue-500 transition-colors"
                    />
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {getPreviewText(block.content)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
