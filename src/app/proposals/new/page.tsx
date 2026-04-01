"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import {
  defaultDocument,
  migrateToDocument,
  isProposalDocument,
  ProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

function NewProposalForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("template");
  const clientId     = searchParams.get("clientId");

  const [title, setTitle]           = useState("Untitled Proposal");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [document, setDocument]     = useState<ProposalDocument | null>(null);
  const [saving, setSaving]         = useState(false);

  // Load business settings, then initialise the document with correct currency/GST
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setDocument((prev) => {
          if (prev) return prev; // already set by template effect
          return defaultDocument({
            currency:     s.defaultCurrency ?? "AUD",
            roundingMode: s.roundingMode    ?? "CENTS",
          });
        });
      })
      .catch(() => {
        setDocument((prev) => prev ?? defaultDocument());
      });
  }, []);

  // Load template content if templateId is provided
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then((template) => {
        if (template.content) {
          const content = template.content as Record<string, unknown>;
          setDocument(
            isProposalDocument(content)
              ? content
              : migrateToDocument(content, null, defaultPricingSettings())
          );
        }
        setTitle(`New Proposal from ${template.name}`);
      })
      .catch(console.error);
  }, [templateId]);

  // Load client details if clientId is provided
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((client) => {
        setClientName(client.name);
        setClientEmail(client.email);
        if (!templateId) setTitle(`Proposal for ${client.name}`);
      })
      .catch(console.error);
  }, [clientId, templateId]);

  const handleEditorUpdate = useCallback((doc: ProposalDocument) => {
    setDocument(doc);
  }, []);

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    try {
      const res = await fetch("/api/proposals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title,
          clientName,
          clientEmail,
          content: document,
          templateId: templateId || undefined,
          clientId:   clientId   || undefined,
        }),
      });
      const proposal = await res.json();
      router.push(`/proposals/${proposal.id}/edit`);
    } catch (error) {
      console.error("Failed to save proposal:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!document) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading...</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex min-h-full">
        {/* Editor handles its own page sidebar */}
        <div className="flex-1 flex flex-col min-h-full">
          {/* Header bar */}
          <div className="px-8 py-6 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link
                  href="/"
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} />
                </Link>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-bold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
                  placeholder="Proposal Title"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Draft"}
              </button>
            </div>

            {/* Client details */}
            <div className="mt-4 grid grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Client Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contact@acme.com"
                />
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="flex flex-1 overflow-hidden">
            <ProposalEditor
              initialDocument={document}
              onUpdate={handleEditorUpdate}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewProposalForm />
    </Suspense>
  );
}
