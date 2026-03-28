"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, LayoutTemplate, Trash2, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  content: Record<string, unknown>;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const loadTemplates = () => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, content: {} }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to create template:", res.status, err);
        alert(`Failed to create template: ${err.error || res.statusText}`);
        return;
      }
      setNewName("");
      setShowCreate(false);
      loadTemplates();
    } catch (err) {
      console.error("Network error creating template:", err);
      alert("Network error - could not save template.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  };

  return (
    <Shell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Template
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Create Template
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
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
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <LayoutTemplate
              size={48}
              className="mx-auto text-gray-300 mb-4"
            />
            <p className="text-gray-500 mb-2">No templates yet</p>
            <p className="text-sm text-gray-400 mb-4">
              Create a template from scratch, or save any proposal as a template
              from the editor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <Link
                    href={`/templates/${template.id}/edit`}
                    className="flex-1 min-w-0"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">
                      {template.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Created {formatDate(template.createdAt)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/templates/${template.id}/edit`}
                      className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      <Pencil size={14} />
                    </Link>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <Link
                  href={`/proposals/new?template=${template.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                >
                  <Plus size={12} />
                  Use this template
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
