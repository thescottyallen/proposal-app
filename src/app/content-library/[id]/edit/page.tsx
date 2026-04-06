"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Save, Check } from "lucide-react";
import Link from "next/link";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  isProposalDocument,
  migrateToDocument,
  ProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

const CATEGORIES = [
  "About Us",
  "Terms & Conditions",
  "Pricing",
  "Introduction",
  "Scope of Work",
  "Timeline",
  "Other",
];

export default function EditContentBlockPage() {
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [doc, setDoc] = useState<ProposalDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useUnsavedChanges(hasChanges);

  useEffect(() => {
    fetch(`/api/content-blocks/${id}`)
      .then((res) => {
        if (!res.ok) { setNotFound(true); setLoading(false); return null; }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setName(data.name);
        setCategory(data.category);

        // Migrate legacy TipTap content to ProposalDocument if needed
        const raw = data.content as Record<string, unknown>;
        const resolved: ProposalDocument = isProposalDocument(raw)
          ? raw
          : migrateToDocument(raw, null, defaultPricingSettings());

        setDoc(resolved);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content-blocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, content: doc }),
      });
      if (!res.ok) { showToast("Save failed"); return; }
      setHasChanges(false);
      showToast("Saved");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading...</p>
        </div>
      </Shell>
    );
  }

  if (notFound || !doc) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Content block not found</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          <Check size={14} />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <Link
            href="/content-library"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setHasChanges(true); }}
            className="text-xl font-bold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 p-0 min-w-[200px]"
            placeholder="Block name..."
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setHasChanges(true); }}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <ProposalEditor
          initialDocument={doc}
          onUpdate={(updated) => { setDoc(updated); setHasChanges(true); }}
        />
      </div>
    </Shell>
  );
}
