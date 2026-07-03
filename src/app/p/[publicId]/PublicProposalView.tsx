"use client";

import { useState, useCallback } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { RichTextBlockReadOnly } from "@/components/editor/RichTextBlock";
import { PricingBlockEditor } from "@/components/editor/PricingBlockEditor";
import { ColumnBlockReadOnly } from "@/components/editor/ColumnBlockEditor";
import { ButtonBlockView } from "@/components/editor/ButtonBlockEditor";
import {
  ProposalDocument,
  ProposalPage,
  PricingBlock,
  ColumnBlock,
  ButtonBlock,
  migrateToDocument,
  isProposalDocument,
  stripDocumentInternalFields,
  applyClientChoices,
  clearOptionSelections,
  selectOption,
  allOptionGroupsResolved,
} from "@/lib/proposal-document";
import type { ProposalPricingSettings } from "@/lib/pricing-types";
import { formatDate } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProposalProps {
  id:              string;
  title:           string;
  clientName:      string;
  clientEmail:     string;
  clientAbn:       string | null;
  content:         Record<string, unknown>;
  status:          string;
  expiresAt:       string | null;
  invoiceNumber:   string | null;
  totalValue:      number | null;
  // Legacy fields used for migration
  pricingData:     Record<string, unknown> | null;
  currency:        string;
  exchangeRate:    number;
  gstEnabled:      boolean;
  roundingMode:    string;
  discountType:    string | null;
  discountValue:   number | null;
  showDiscount:    boolean;
  depositType:     string | null;
  depositValue:    number | null;
  billingCadence:  string;
  recurringStartMode: string | null;
  recurringStartDate: string | null;
  fixedTermMonths: number | null;
  paymentTerms:    string;
  latePaymentClause: string | null;
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
  return Math.ceil(
    (new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

function expiryDisplay(expiresAt: string | null, status: string) {
  if (!expiresAt || status === "ACCEPTED") return null;
  const days = daysUntil(expiresAt);
  if (status === "EXPIRED" || days < 0) {
    return {
      label: `Expired ${formatDate(expiresAt)}`,
      color: "text-red-600 bg-red-50 border-red-200",
    };
  }
  if (days <= 7) {
    return {
      label: `Expires ${formatDate(expiresAt)} (${days}d)`,
      color: "text-orange-600 bg-orange-50 border-orange-200",
    };
  }
  return {
    label: `Valid until ${formatDate(expiresAt)}`,
    color: "text-gray-500 bg-gray-50 border-gray-200",
  };
}

function legacyPricingSettings(p: ProposalProps): ProposalPricingSettings {
  return {
    currency:           p.currency           as ProposalPricingSettings["currency"],
    exchangeRate:       p.exchangeRate,
    gstEnabled:         p.gstEnabled,
    roundingMode:       p.roundingMode       as ProposalPricingSettings["roundingMode"],
    optionsMode:        false,
    discountType:       p.discountType       as ProposalPricingSettings["discountType"],
    discountValue:      p.discountValue,
    showDiscount:       p.showDiscount,
    depositType:        p.depositType        as ProposalPricingSettings["depositType"],
    depositValue:       p.depositValue,
    billingCadence:     p.billingCadence     as ProposalPricingSettings["billingCadence"],
    recurringStartMode: p.recurringStartMode as ProposalPricingSettings["recurringStartMode"],
    recurringStartDate: p.recurringStartDate,
    fixedTermMonths:    p.fixedTermMonths,
    paymentTerms:       p.paymentTerms       as ProposalPricingSettings["paymentTerms"],
    latePaymentClause:  p.latePaymentClause,
  };
}

/** Detect whether a hex colour is dark enough to warrant light text */
function isDarkColour(hex: string): boolean {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// ─── Signature block ──────────────────────────────────────────────────────────

const DEFAULT_ACCEPTANCE_MESSAGE =
  "By entering your name below and clicking Accept, you confirm that you have read and agree to the terms of this proposal. Your acceptance will be recorded with a timestamp and IP address.";

function SignatureSection({
  proposalId,
  clientEmail,
  isAcceptable,
  isExpired,
  accepted,
  onAccepted,
  message,
}: {
  proposalId: string;
  clientEmail: string;
  isAcceptable: boolean;
  isExpired: boolean;
  accepted: boolean;
  onAccepted: (signerName: string, clientAbn: string) => Promise<void>;
  message?: string;
}) {
  const [signerName, setSignerName] = useState("");
  const [abn, setAbn]               = useState("");
  const [accepting, setAccepting]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [localAccepted, setLocalAccepted] = useState(false);

  void proposalId;

  const handleAccept = async () => {
    if (!signerName.trim()) {
      setError("Please enter your full name to accept this proposal.");
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      await onAccepted(signerName.trim(), abn.trim());
      setLocalAccepted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (accepted || localAccepted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-6 py-6 text-center">
        <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-gray-900 mb-1">Accepted</h2>
        <p className="text-sm text-gray-500">
          Thank you, {signerName || ""}. Your acceptance has been recorded and a
          confirmation sent to {clientEmail}.
        </p>
      </div>
    );
  }

  if (!isAcceptable || isExpired) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">
        Accept this proposal
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        {message || DEFAULT_ACCEPTANCE_MESSAGE}
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => { setSignerName(e.target.value); setError(null); }}
            placeholder="Type your full name"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && handleAccept()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            ABN (optional)
          </label>
          <input
            type="text"
            value={abn}
            onChange={(e) => setAbn(e.target.value)}
            placeholder="e.g. 12 345 678 901"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && handleAccept()}
          />
          <p className="mt-1 text-xs text-gray-400">
            Add your ABN if you&rsquo;d like it shown on your invoice.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleAccept}
          disabled={accepting || !signerName.trim()}
          className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accepting ? "Recording acceptance..." : "Accept Proposal"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Your IP address and the time of acceptance will be recorded for
          verification purposes.
        </p>
      </div>
    </div>
  );
}

// ─── Left sidebar ─────────────────────────────────────────────────────────────

function ProposalSidebar({
  doc,
  activePageId,
  onSelectPage,
}: {
  doc: ProposalDocument;
  activePageId: string;
  onSelectPage: (id: string) => void;
}) {
  const bgColour = doc.sidebar?.backgroundColor || "#ffffff";
  const dark = isDarkColour(bgColour);

  const textClass     = dark ? "text-white"     : "text-gray-800";
  const subTextClass  = dark ? "text-white/60"  : "text-gray-400";
  const dividerClass  = dark ? "border-white/10": "border-gray-100";
  const activeClass   = dark
    ? "bg-white/15 text-white font-medium"
    : "bg-gray-100 text-gray-900 font-medium";
  const hoverClass    = dark
    ? "text-white/70 hover:bg-white/10 hover:text-white"
    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700";

  return (
    <aside
      className="sticky top-0 h-screen w-56 shrink-0 flex flex-col overflow-y-auto"
      style={{ backgroundColor: bgColour }}
    >
      {/* Logo */}
      {doc.sidebar?.logoUrl && (
        <div className="px-4 pt-6 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={doc.sidebar.logoUrl}
            alt="Logo"
            className="max-h-12 max-w-full object-contain"
          />
        </div>
      )}

      {/* Page navigation */}
      {doc.pages.length > 1 && (
        <nav className={`flex-1 px-3 ${doc.sidebar?.logoUrl ? "pt-2" : "pt-6"} pb-6`}>
          {doc.sidebar?.logoUrl && (
            <div className={`border-t ${dividerClass} mb-3`} />
          )}
          <p className={`text-xs font-semibold uppercase tracking-wider px-2 mb-2 ${subTextClass}`}>
            Pages
          </p>
          <ul className="space-y-0.5">
            {doc.pages.map((page) => (
              <li key={page.id}>
                <button
                  onClick={() => onSelectPage(page.id)}
                  className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors ${
                    page.id === activePageId ? activeClass : hoverClass
                  }`}
                >
                  {page.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Spacer when no nav */}
      {doc.pages.length <= 1 && <div className="flex-1" />}

      {/* Bottom branding */}
      <div className={`px-4 py-4 border-t ${dividerClass}`}>
        <p className={`text-xs ${subTextClass}`}>Powered by</p>
        <p className={`text-xs font-medium ${textClass}`}>The Product Bus</p>
      </div>
    </aside>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PublicProposalView({ proposal, business }: Props) {
  // Resolve the ProposalDocument (migrate legacy if needed)
  const rawContent = proposal.content as Record<string, unknown>;
  const resolvedDoc: ProposalDocument = isProposalDocument(rawContent)
    ? stripDocumentInternalFields(rawContent)
    : stripDocumentInternalFields(
        migrateToDocument(
          rawContent,
          proposal.pricingData as Parameters<typeof migrateToDocument>[1],
          legacyPricingSettings(proposal)
        )
      );
  // Start every choose-one option group unselected so the client actively picks
  // one and no combined total shows until they do.
  const initialDoc: ProposalDocument = clearOptionSelections(resolvedDoc);

  const [doc, setDoc] = useState<ProposalDocument>(initialDoc);
  const [activePageId, setActivePageId] = useState<string>(
    initialDoc.pages[0]?.id ?? ""
  );
  const [accepted, setAccepted] = useState(proposal.status === "ACCEPTED");

  const isAcceptable = ["SENT", "VIEWED"].includes(proposal.status) && !accepted;
  const isExpired    = proposal.status === "EXPIRED";
  const expiry       = expiryDisplay(proposal.expiresAt, proposal.status);

  // Show sidebar if there are multiple pages, a logo, or a custom background colour
  const showSidebar =
    doc.pages.length > 1 ||
    !!doc.sidebar?.logoUrl ||
    !!doc.sidebar?.backgroundColor;

  // Client toggles an optional line item in a pricing block
  const handleClientIncludedChange = useCallback(
    (blockId: string, itemId: string, included: boolean) => {
      setDoc((prev) =>
        applyClientChoices(prev, { [itemId]: included })
      );
      void blockId;
    },
    []
  );

  // Client chooses one option within a group (clears the group's alternatives)
  const handleSelectOption = useCallback(
    (blockId: string, itemId: string) => {
      setDoc((prev) => selectOption(prev, blockId, itemId));
    },
    []
  );

  // Build flat clientIncluded map across all pricing blocks for submission
  const buildClientIncluded = (): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const page of doc.pages) {
      for (const block of page.blocks) {
        if (block.type === "pricing") {
          const optionsMode = block.pricingSettings.optionsMode;
          for (const item of block.pricingData.items) {
            if (optionsMode || item.isOptional) map[item.id] = item.clientIncluded;
          }
        }
      }
    }
    return map;
  };

  const handleAccept = async (
    signerName: string,
    clientAbn: string
  ) => {
    if (!allOptionGroupsResolved(doc)) {
      throw new Error("Please choose an option where a choice is offered before accepting.");
    }
    const res = await fetch(`/api/proposals/${proposal.id}/accept`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        signerName,
        clientAbn: clientAbn || null,
        clientIncluded: buildClientIncluded(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to accept proposal.");
    }
    setAccepted(true);
  };

  const activePage: ProposalPage =
    doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];

  // ─── Block renderer ──────────────────────────────────────────────────────────

  const renderBlock = (block: ProposalPage["blocks"][number]) => {
    if (block.type === "richText") {
      return (
        <RichTextBlockReadOnly
          key={block.id}
          content={block.content}
          backgroundColor={block.backgroundColor}
        />
      );
    }

    if (block.type === "pricing") {
      const pricingBlock = block as PricingBlock;
      return (
        <PricingBlockEditor
          key={block.id}
          block={pricingBlock}
          onChange={() => {}}
          readOnly={false}
          clientView={true}
          onClientIncludedChange={
            isAcceptable
              ? (itemId, included) =>
                  handleClientIncludedChange(block.id, itemId, included)
              : undefined
          }
          onSelectOption={
            isAcceptable
              ? (itemId) => handleSelectOption(block.id, itemId)
              : undefined
          }
          backgroundColor={block.backgroundColor}
        />
      );
    }

    if (block.type === "signature") {
      return (
        <SignatureSection
          key={block.id}
          proposalId={proposal.id}
          clientEmail={proposal.clientEmail}
          isAcceptable={isAcceptable}
          isExpired={isExpired}
          accepted={accepted}
          onAccepted={handleAccept}
          message={block.message}
        />
      );
    }

    if (block.type === "columns") {
      return (
        <ColumnBlockReadOnly
          key={block.id}
          block={block as ColumnBlock}
          backgroundColor={block.backgroundColor}
        />
      );
    }

    if (block.type === "button") {
      return (
        <ButtonBlockView
          key={block.id}
          block={block as ButtonBlock}
          onNavigatePage={setActivePageId}
        />
      );
    }

    return null;
  };

  // ─── Status banners ──────────────────────────────────────────────────────────

  const statusBanners = (
    <>
      {accepted && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            This proposal has been accepted. A confirmation has been sent to{" "}
            {proposal.clientEmail}.
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
      {proposal.status === "LOST" && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
          <XCircle size={18} className="text-gray-400 shrink-0" />
          <p className="text-sm text-gray-500">
            This proposal is no longer active.
          </p>
        </div>
      )}
    </>
  );

  // ─── Render: sidebar layout vs centred layout ─────────────────────────────

  if (showSidebar) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <ProposalSidebar
          doc={doc}
          activePageId={activePageId}
          onSelectPage={setActivePageId}
        />

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-10">
            {/* Proposal header */}
            <div className="mb-8">
              {business.businessName && (
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {business.businessName}
                </p>
              )}
              {business.abn && (
                <p className="text-xs text-gray-400 mb-4">ABN {business.abn}</p>
              )}
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {proposal.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <p className="text-gray-500 text-sm">
                  Prepared for{" "}
                  <span className="font-medium text-gray-700">
                    {proposal.clientName}
                  </span>
                </p>
                {proposal.clientAbn && (
                  <span className="text-xs text-gray-400">
                    ABN {proposal.clientAbn}
                  </span>
                )}
                {expiry && (
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium ${expiry.color}`}
                  >
                    {expiry.label}
                  </span>
                )}
              </div>
            </div>

            {statusBanners}

            {/* Active page blocks */}
            <div className="space-y-4">
              {activePage.blocks.map(renderBlock)}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-6 mt-8 border-t border-gray-200">
              <span>{business.businessName || "The Product Bus"}</span>
              {business.abn && <span>ABN {business.abn}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Centred layout (single page, no sidebar customisation)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Proposal header */}
        <div className="mb-8">
          {business.businessName && (
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {business.businessName}
            </p>
          )}
          {business.abn && (
            <p className="text-xs text-gray-400 mb-4">ABN {business.abn}</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {proposal.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <p className="text-gray-500 text-sm">
              Prepared for{" "}
              <span className="font-medium text-gray-700">
                {proposal.clientName}
              </span>
            </p>
            {proposal.clientAbn && (
              <span className="text-xs text-gray-400">
                ABN {proposal.clientAbn}
              </span>
            )}
            {expiry && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full border font-medium ${expiry.color}`}
              >
                {expiry.label}
              </span>
            )}
          </div>
        </div>

        {statusBanners}

        {/* Active page blocks */}
        <div className="space-y-4">
          {activePage.blocks.map(renderBlock)}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-6 mt-8 border-t border-gray-200">
          <span>{business.businessName || "The Product Bus"}</span>
          {business.abn && <span>ABN {business.abn}</span>}
        </div>
      </div>
    </div>
  );
}
