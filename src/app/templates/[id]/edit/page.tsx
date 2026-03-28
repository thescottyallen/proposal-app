"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { PricingItem } from "@/components/editor/PricingTable";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

interface Template {
  id: string;
  name: string;
  content: Record<string, unknown>;
}

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  useUnsavedChanges(hasChanges);

  useEffect(() => {
    fetch(`/api/templates/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setTemplate(data);
        setName(data.name);
        setContent(data.content);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleEditorUpdate = useCallback(
    (newContent: Record<string, unknown>, newPricing: PricingItem[]) => {
      setContent(newContent);
      setPricingItems(newPricing);
      setHasChanges(true);
    },
    []
  );

  const handleNameChange = (value: string) => {
    setName(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading template...</p>
        </div>
      </Shell>
    );
  }

  if (!template) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Template not found</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="px-8 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/templates"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="text-2xl font-bold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
            />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
              Template
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Editor */}
        <ProposalEditor
          initialContent={content}
          initialPricingItems={pricingItems}
          onUpdate={handleEditorUpdate}
        />
      </div>
    </Shell>
  );
}
