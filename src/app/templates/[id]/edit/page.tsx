"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  ProposalDocument,
  migrateToDocument,
  isProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

interface Template {
  id: string;
  name: string;
  content: Record<string, unknown>;
}

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // suppress unused var warning
  void router;

  const [template, setTemplate]   = useState<Template | null>(null);
  const [name, setName]           = useState("");
  const [document, setDocument]   = useState<ProposalDocument | null>(null);
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [defaultAcceptanceMessage, setDefaultAcceptanceMessage] = useState<string | null>(null);

  useUnsavedChanges(hasChanges);

  useEffect(() => {
    Promise.all([
      fetch(`/api/templates/${id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([data, settings]) => {
        setTemplate(data);
        setName(data.name);
        const raw = data.content as Record<string, unknown>;
        setDocument(
          isProposalDocument(raw)
            ? raw
            : migrateToDocument(raw, null, defaultPricingSettings())
        );
        setDefaultAcceptanceMessage(settings.defaultAcceptanceMessage ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleEditorUpdate = useCallback((doc: ProposalDocument) => {
    setDocument(doc);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    try {
      await fetch(`/api/templates/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, content: document }),
      });
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !document) {
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
      <div className="flex min-h-full">
        <div className="flex-1 flex flex-col min-h-full overflow-hidden">
          {/* Header */}
          <div className="px-8 py-5 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center justify-between">
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
                  onChange={(e) => { setName(e.target.value); setHasChanges(true); }}
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
          </div>

          {/* Editor */}
          <div className="flex flex-1 overflow-hidden bg-gray-50">
            <ProposalEditor
              initialDocument={document}
              onUpdate={handleEditorUpdate}
              defaultAcceptanceMessage={defaultAcceptanceMessage ?? undefined}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
