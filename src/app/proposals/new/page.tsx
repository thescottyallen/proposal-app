"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { blankProposalContent } from "@/lib/default-content";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import {
  ProposalPricingData,
  ProposalPricingSettings,
  defaultPricingData,
  defaultPricingSettings,
} from "@/lib/pricing-types";

function NewProposalForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("template");
  const clientId     = searchParams.get("clientId");

  const [title, setTitle]           = useState("Untitled Proposal");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [content, setContent]       = useState<Record<string, unknown>>(blankProposalContent);
  const [pricingData, setPricingData]         = useState<ProposalPricingData>(defaultPricingData());
  const [pricingSettings, setPricingSettings] = useState<ProposalPricingSettings>(defaultPricingSettings());
  const [gstRegistered, setGstRegistered]     = useState(false);
  const [saving, setSaving] = useState(false);

  // Load business settings (for GST toggle and currency defaults)
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(s => {
        setGstRegistered(s.gstRegistered ?? false);
        setPricingSettings(prev => ({
          ...prev,
          currency:     s.defaultCurrency ?? "AUD",
          roundingMode: s.roundingMode    ?? "CENTS",
        }));
      })
      .catch(console.error);
  }, []);

  // Load template content if templateId is provided
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`)
      .then(r => r.json())
      .then(template => {
        if (template.content) setContent(template.content);
        setTitle(`New Proposal from ${template.name}`);
      })
      .catch(console.error);
  }, [templateId]);

  // Load client details if clientId is provided
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(client => {
        setClientName(client.name);
        setClientEmail(client.email);
        if (!templateId) setTitle(`Proposal for ${client.name}`);
      })
      .catch(console.error);
  }, [clientId, templateId]);

  const handleEditorUpdate = useCallback((
    newContent:         Record<string, unknown>,
    newPricingData:     ProposalPricingData,
    newPricingSettings: ProposalPricingSettings,
  ) => {
    setContent(newContent);
    setPricingData(newPricingData);
    setPricingSettings(newPricingSettings);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/proposals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title,
          clientName,
          clientEmail,
          content,
          pricingData,
          pricingSettings,
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

  return (
    <Shell>
      <div className="px-8 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
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
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Client Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="contact@acme.com"
              />
            </div>
          </div>
        </div>

        <ProposalEditor
          initialContent={content}
          initialPricingData={pricingData}
          initialPricingSettings={pricingSettings}
          onUpdate={handleEditorUpdate}
          gstRegistered={gstRegistered}
        />
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
