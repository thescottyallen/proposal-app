"use client";

import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { PricingTable } from "@/components/editor/PricingTable";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import type { ProposalPricingData, ProposalPricingSettings } from "@/lib/pricing-types";
import { formatDate } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProposalProps {
  id:             string;
  title:          string;
  clientName:     string;
  clientEmail:    string;
  clientAbn:      string | null;
  content:        Record<string, unknown>;
  status:         string;
  expiresAt:      string | null;
  invoiceNumber:  string | null;
  totalValue:     number | null;
  pricingData:    ProposalPricingData | null;
  pricingSettings: ProposalPricingSettings;
}

interface BusinessProps {
  businessName: string;
  abn:          string | null;
}

interface Props {
  proposal: ProposalProps;
  business: BusinessProps;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryDisplay(expiresAt: string | null, status: string) {
  if (!expiresAt || status === "ACCEPTED") return null;
  const days = daysUntil(expiresAt);
  if (status === "EXPIRED" || days < 0) {
    return { label: `Expired ${formatDate(expiresAt)}`, color: "text-red-600 bg-red-50 border-red-200" };
  }
  if (days <= 7) {
    return { label: `Expires ${formatDate(expiresAt)} (${days}d)`, color: "text-orange-600 bg-orange-50 border-orange-200" };
  }
  return { label: `Valid until ${formatDate(expiresAt)}`, color: "text-gray-500 bg-gray-50 border-gray-200" };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PublicProposalView({ proposal, business }: Props) {
  const [pricingData, setPricingData] = useState<ProposalPricingData | null>(proposal.pricingData);
  const [signerName, setSignerName]   = useState("");
  const [accepting, setAccepting]     = useState(false);
  const [accepted, setAccepted]       = useState(proposal.status === "ACCEPTED");
  const [error, setError]             = useState<string | null>(null);

  const isAcceptable = ["SENT", "VIEWED"].includes(proposal.status) && !accepted;
  const isExpired    = proposal.status === "EXPIRED";

  // Read-only TipTap instance for the narrative content
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content:           proposal.content || undefined,
    editable:          false,
    immediatelyRender: false,
  });

  // Client toggles an optional line item
  const handleClientIncludedChange = useCallback((itemId: string, included: boolean) => {
    setPricingData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, clientIncluded: included } : item
        ),
      };
    });
  }, []);

  // Build clientIncluded map for submission
  const buildClientIncluded = (): Record<string, boolean> => {
    if (!pricingData) return {};
    return Object.fromEntries(
      pricingData.items
        .filter(i => i.isOptional)
        .map(i => [i.id, i.clientIncluded])
    );
  };

  const handleAccept = async () => {
    if (!signerName.trim()) {
      setError("Please enter your full name to accept this proposal.");
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/accept`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          signerName:     signerName.trim(),
          clientIncluded: buildClientIncluded(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to accept proposal. Please try again.");
        return;
      }
      setAccepted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const expiry = expiryDisplay(proposal.expiresAt, proposal.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ── Business header ── */}
        <div className="mb-8">
          {business.businessName && (
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {business.businessName}
            </p>
          )}
          {business.abn && (
            <p className="text-xs text-gray-400 mb-4">ABN {business.abn}</p>
          )}

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{proposal.title}</h1>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <p className="text-gray-500 text-sm">
              Prepared for <span className="font-medium text-gray-700">{proposal.clientName}</span>
            </p>
            {proposal.clientAbn && (
              <span className="text-xs text-gray-400">ABN {proposal.clientAbn}</span>
            )}
            {proposal.invoiceNumber && (
              <span className="text-xs font-mono text-gray-400">{proposal.invoiceNumber}</span>
            )}
            {expiry && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${expiry.color}`}>
                {expiry.label}
              </span>
            )}
          </div>
        </div>

        {/* ── Status banners ── */}
        {accepted && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              This proposal has been accepted. A confirmation has been sent to {proposal.clientEmail}.
            </p>
          </div>
        )}
        {isExpired && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 font-medium">
              This proposal has expired and is no longer available for acceptance.
            </p>
          </div>
        )}
        {proposal.status === "DECLINED" && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
            <XCircle size={18} className="text-gray-400 shrink-0" />
            <p className="text-sm text-gray-500">This proposal has been declined.</p>
          </div>
        )}

        {/* ── Narrative content (TipTap read-only) ── */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
          <div className="px-8 py-6">
            <EditorContent
              editor={editor}
              className="prose prose-sm sm:prose-base max-w-none
                [&_.tiptap]:outline-none
                [&_.tiptap_h1]:text-3xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:mt-6
                [&_.tiptap_h2]:text-2xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-5
                [&_.tiptap_h3]:text-xl [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-4
                [&_.tiptap_p]:mb-3 [&_.tiptap_p]:leading-relaxed
                [&_.tiptap_img]:rounded-lg [&_.tiptap_img]:max-w-full
                [&_.tiptap_hr]:my-6 [&_.tiptap_hr]:border-gray-200
                [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6
                [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6
              "
            />
          </div>
        </div>

        {/* ── Pricing table ── */}
        {pricingData && pricingData.items.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6 px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Pricing</h2>
            {pricingData.items.some(i => i.isOptional) && (
              <p className="text-xs text-gray-400 mb-4">
                Items marked as optional can be included or excluded before accepting.
              </p>
            )}
            <PricingTable
              pricingData={pricingData}
              pricingSettings={proposal.pricingSettings}
              onChange={() => {}} // read-only in client view
              onClientIncludedChange={isAcceptable ? handleClientIncludedChange : undefined}
              readOnly={false}
              clientView={true}
            />

            {/* Late payment clause */}
            {proposal.pricingSettings.latePaymentClause && (
              <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
                {proposal.pricingSettings.latePaymentClause}
              </p>
            )}
          </div>
        )}

        {/* ── Digital acceptance ── */}
        {isAcceptable && !isExpired && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-6 mb-8">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Accept this proposal</h2>
            <p className="text-sm text-gray-500 mb-5">
              By entering your name and clicking Accept, you agree to the terms of this proposal.
              Your acceptance will be recorded with a timestamp.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => { setSignerName(e.target.value); setError(null); }}
                  placeholder="Type your full name"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === "Enter" && handleAccept()}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting || !signerName.trim()}
                className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {accepting ? "Recording acceptance..." : "Accept Proposal"}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Your IP address and the time of acceptance will be recorded for verification purposes.
              </p>
            </div>
          </div>
        )}

        {/* ── Accepted confirmation (shown after accepting in this session) ── */}
        {accepted && proposal.status !== "ACCEPTED" && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-6 py-6 mb-8 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-gray-900 mb-1">Accepted</h2>
            <p className="text-sm text-gray-500">
              Thank you, {signerName}. Your acceptance has been recorded and a confirmation sent to {proposal.clientEmail}.
            </p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-200">
          <span>{business.businessName || "The Product Bus"}</span>
          {business.abn && <span>ABN {business.abn}</span>}
        </div>
      </div>
    </div>
  );
}
