"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import { Plus, Blocks, Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { newId } from "@/lib/proposal-document";

interface ContentBlock {
  id: string;
  name: string;
  category: string;
  content: Record<string, unknown>;
  createdAt: string;
}

const CATEGORIES = [
  "About Us",
  "Terms & Conditions",
  "Pricing",
  "Introduction",
  "Scope of Work",
  "Timeline",
  "Other",
];

export default function ContentLibraryPage() {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [createError, setCreateError] = useState<string | null>(null);

  const loadBlocks = () => {
    fetch("/api/content-blocks")
      .then((res) => res.json())
      .then((data) => {
        setBlocks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadBlocks();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    const res = await fetch("/api/content-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        category: newCategory,
        content: {
          version: 2,
          pages: [
            {
              id: newId(),
              name: "Content",
              blocks: [
                {
                  type: "richText",
                  id: newId(),
                  content: {
                    type: "doc",
                    content: [{ type: "paragraph" }],
                  },
                },
              ],
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      setCreateError("Failed to create content block. Please try again.");
      return;
    }
    setNewName("");
    setShowCreate(false);
    loadBlocks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this content block?")) return;
    await fetch(`/api/content-blocks/${id}`, { method: "DELETE" });
    loadBlocks();
  };

  const filtered =
    filterCategory === "ALL"
      ? blocks
      : blocks.filter((b) => b.category === filterCategory);

  const categories = [...new Set(blocks.map((b) => b.category))];

  return (
    <Shell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Content Library</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Block
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Create Content Block
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Block name..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {createError && (
              <p className="mt-2 text-sm text-red-600">{createError}</p>
            )}
          </div>
        )}

        {/* Filter by category */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setFilterCategory("ALL")}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
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
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
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

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Blocks size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-2">No content blocks yet</p>
            <p className="text-sm text-gray-400">
              Content blocks are reusable sections you can insert into any
              proposal -- things like your standard "About Us," terms and
              conditions, or common pricing structures.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((block) => (
              <div
                key={block.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <Link
                    href={`/content-library/${block.id}/edit`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {block.name}
                      </h3>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {block.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Created {formatDate(block.createdAt)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/content-library/${block.id}/edit`}
                      className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      <Pencil size={14} />
                    </Link>
                    <button
                      onClick={() => handleDelete(block.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
