"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Save, Send, Copy, Trash2,
  BookmarkPlus, Check, Mail, X, Link2, Lock, History, XCircle, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { getStatusColor, formatDate } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  ProposalDocument,
  migrateToDocument,
  isProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

interface ProposalMeta {
  id:             string;
  title:          string;
  clientName:     string;
  clientEmail:    string;
  clientAbn:      string | null;
  content:        Record<string, unknown>;
  status:         string;
  publicId:       string;
  totalValue:     number | null;
  invoiceNumber:  string | null;
  internalNotes:  string | null;
  lostReason:     string | null;
  expiresAt:      string | null;
  // Legacy flat pricing settings (used for migration only)
  currency:           string;
  exchangeRate:       number;
  gstEnabled:         boolean;
  roundingMode:       string;
  discountType:       string | null;
  discountValue:      number | null;
  showDiscount:       boolean;
  depositType:        string | null;
  depositValue:       number | null;
  billingCadence:     string;
  recurringStartMode: string | null;
  recurringStartDate: string | null;
  fixedTermMonths:    number | null;
  paymentTerms:       string;
  latePaymentClause:  string | null;
  pricingData:        Record<string, unknown> | null;
  // Access + activity (added by the detail API)
  authorName?:        string;
  viewerIsAuthor?:    boolean;
  events?:            ProposalEventMeta[];
}

interface ProposalEventMeta {
  id:        string;
  eventType: string;
  createdAt: string;
  actorName: string | null;
  metadata:  { editedBy?: string; changedFields?: string[] } | null;
}

/** Human-readable description of a proposal activity event. */
function describeEvent(ev: ProposalEventMeta): string {
  if (ev.eventType === "edited") {
    const who = ev.actorName ?? "Someone";
    const fields = ev.metadata?.changedFields ?? [];
    return fields.length > 0
      ? `${who} edited ${fields.join(", ").toLowerCase()}`
      : `${who} made an edit`;
  }
  const labels: Record<string, string> = {
    opened:         "Client opened the proposal",
    viewed_section: "Client viewed a section",
    forwarded:      "Proposal was forwarded",
    signed:         "Proposal was signed",
    accepted:       "Proposal was accepted",
  };
  return labels[ev.eventType] ?? ev.eventType;
}

function legacyPricingSettings(p: ProposalMeta) {
  return {
    ...defaultPricingSettings(),
    currency:           p.currency           as ReturnType<typeof defaultPricingSettings>["currency"],
    exchangeRate:       p.exchangeRate,
    gstEnabled:         p.gstEnabled,
    roundingMode:       p.roundingMode       as ReturnType<typeof defaultPricingSettings>["roundingMode"],
    discountType:       p.discountType       as ReturnType<typeof defaultPricingSettings>["discountType"],
    discountValue:      p.discountValue,
    showDiscount:       p.showDiscount,
    depositType:        p.depositType        as ReturnType<typeof defaultPricingSettings>["depositType"],
    depositValue:       p.depositValue,
    billingCadence:     p.billingCadence     as ReturnType<typeof defaultPricingSettings>["billingCadence"],
    recurringStartMode: p.recurringStartMode as ReturnType<typeof defaultPricingSettings>["recurringStartMode"],
    recurringStartDate: p.recurringStartDate,
    fixedTermMonths:    p.fixedTermMonths,
    paymentTerms:       p.paymentTerms       as ReturnType<typeof defaultPricingSettings>["paymentTerms"],
    latePaymentClause:  p.latePaymentClause,
  };
}

export default function EditProposalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [proposal, setProposal]           = useState<ProposalMeta | null>(null);
  const [title, setTitle]                 = useState("");
  const [clientName, setClientName]       = useState("");
  const [clientEmail, setClientEmail]     = useState("");
  const [clientAbn, setClientAbn]         = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [expiresAt, setExpiresAt]         = useState("");
  const [document, setDocument]           = useState<ProposalDocument | null>(null);
  const [gstRegistered, setGstRegistered]                     = useState(false);
  const [defaultAcceptanceMessage, setDefaultAcceptanceMessage] = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [loading, setLoading]             = useState(true);
  const [hasChanges, setHasChanges]       = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);
  const [showHistory, setShowHistory]     = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReasonInput, setLostReasonInput] = useState("");
  const [savingLost, setSavingLost]       = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName]   = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo]               = useState("");
  const [sendMessage, setSendMessage]     = useState("");
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState("");
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpTo, setFollowUpTo]               = useState("");
  const [followUpMessage, setFollowUpMessage]     = useState("");
  const [followUpSending, setFollowUpSending]     = useState(false);
  const [followUpError, setFollowUpError]         = useState("");

  const { clearChanges } = useUnsavedChanges(hasChanges);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/proposals/${id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([data, settings]) => {
      setProposal(data);
      setTitle(data.title);
      setClientName(data.clientName);
      setClientEmail(data.clientEmail);
      setClientAbn(data.clientAbn ?? "");
      setInternalNotes(data.internalNotes ?? "");
      setExpiresAt(data.expiresAt ? data.expiresAt.slice(0, 10) : "");
      setGstRegistered(settings.gstRegistered ?? false);
      setDefaultAcceptanceMessage(settings.defaultAcceptanceMessage ?? null);

      // Migrate legacy content to ProposalDocument if needed
      const rawContent = data.content as Record<string, unknown>;
      const doc = isProposalDocument(rawContent)
        ? rawContent
        : migrateToDocument(
            rawContent,
            data.pricingData ?? null,
            legacyPricingSettings(data)
          );
      setDocument(doc);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleEditorUpdate = useCallback((doc: ProposalDocument) => {
    setDocument(doc);
    setHasChanges(true);
  }, []);

  const buildSaveBody = () => ({
    title,
    clientName,
    clientEmail,
    clientAbn:     clientAbn    || null,
    internalNotes: internalNotes || null,
    expiresAt:     expiresAt    || null,
    content:       document,
  });

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildSaveBody()),
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

  const handleDelete = async () => {
    if (!confirm("Delete this proposal?")) return;
    const res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Delete failed");
      return;
    }
    clearChanges();
    router.push("/");
  };

  // Refresh activity then open the change-log modal.
  const openHistory = async () => {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProposal((prev) =>
          prev
            ? {
                ...prev,
                events:         data.events,
                authorName:     data.authorName,
                viewerIsAuthor: data.viewerIsAuthor,
              }
            : data
        );
      }
    } catch {
      /* non-fatal — open with whatever we already have */
    }
    setShowHistory(true);
  };

  const markAsLost = async () => {
    setSavingLost(true);
    try {
      const reason = lostReasonInput.trim() || null;
      const res = await fetch(`/api/proposals/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: "LOST", lostReason: reason }),
      });
      if (!res.ok) { showToast("Failed to mark as lost"); return; }
      setProposal((prev) => (prev ? { ...prev, status: "LOST", lostReason: reason } : prev));
      setShowLostModal(false);
      showToast("Marked as lost");
    } catch {
      showToast("Failed to mark as lost");
    } finally {
      setSavingLost(false);
    }
  };

  const reopenProposal = async () => {
    if (!confirm("Reopen this proposal? It will be set back to Draft.")) return;
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: "DRAFT", lostReason: null }),
      });
      if (!res.ok) { showToast("Failed to reopen"); return; }
      setProposal((prev) => (prev ? { ...prev, status: "DRAFT", lostReason: null } : prev));
      showToast("Proposal reopened");
    } catch {
      showToast("Failed to reopen");
    }
  };

  const handleDuplicate = async () => {
    if (!document) return;
    await handleSave();
    const res = await fetch("/api/proposals", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       `${title} (Copy)`,
        clientName,
        clientEmail,
        content:     document,
      }),
    });
    if (!res.ok) { showToast("Failed to duplicate"); return; }
    const newProposal = await res.json();
    clearChanges();
    router.push(`/proposals/${newProposal.id}/edit`);
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim() || !document) return;
    await fetch("/api/templates", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: templateName, content: document }),
    });
    setShowSaveAsTemplate(false);
    setTemplateName("");
    showToast("Template saved");
  };

  const copyPublicLink = async () => {
    if (!proposal) return;
    const url = `${window.location.origin}/p/${proposal.publicId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = window.document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity  = "0";
      window.document.body.appendChild(ta);
      ta.select();
      window.document.execCommand("copy");
      window.document.body.removeChild(ta);
    }
    showToast("Link copied");
  };

  const handleSendEmail = async () => {
    if (!sendTo.trim() || !sendTo.includes("@")) {
      setSendError("Please enter a valid email address.");
      return;
    }
    setSending(true);
    setSendError("");
    await handleSave();
    try {
      const res = await fetch(`/api/proposals/${id}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: sendTo, message: sendMessage }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSendError(data.error || "Failed to send email.");
        return;
      }
      setProposal((prev) =>
        prev?.status === "DRAFT" ? { ...prev, status: "SENT" } : prev
      );
      setShowSendModal(false);
      showToast("Proposal sent to " + sendTo);
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSendFollowUp = async () => {
    if (!followUpTo.trim() || !followUpTo.includes("@")) {
      setFollowUpError("Please enter a valid email address.");
      return;
    }
    setFollowUpSending(true);
    setFollowUpError("");
    try {
      const res = await fetch(`/api/proposals/${id}/followup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: followUpTo, message: followUpMessage }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFollowUpError(data.error || "Failed to send follow-up.");
        return;
      }
      setShowFollowUpModal(false);
      showToast("Follow-up sent to " + followUpTo);
    } catch {
      setFollowUpError("Network error. Please try again.");
    } finally {
      setFollowUpSending(false);
    }
  };

  if (loading || !document) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading proposal...</p>
        </div>
      </Shell>
    );
  }

  if (!proposal) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Proposal not found</p>
        </div>
      </Shell>
    );
  }

  const isAccepted = proposal.status === "ACCEPTED";
  // Admins can open & edit any proposal, but sending, follow-ups and deletion
  // stay with the author. (Older API responses omit the flag -> treat as author.)
  const isAuthor = proposal.viewerIsAuthor !== false;

  return (
    <Shell>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          <Check size={14} />
          {toast}
        </div>
      )}

      {/* Accepted lock banner */}
      {isAccepted && (
        <div className="flex items-center gap-3 px-8 py-3 bg-green-50 border-b border-green-200">
          <Lock size={14} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            This proposal has been accepted and is locked from editing.
          </p>
        </div>
      )}

      {/* Lost banner */}
      {proposal.status === "LOST" && (
        <div className="flex items-center gap-3 px-8 py-3 bg-red-50 border-b border-red-200">
          <XCircle size={14} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            This proposal is marked as lost{proposal.lostReason ? `: ${proposal.lostReason}` : ""}.
          </p>
        </div>
      )}

      <div className="flex min-h-full">
        <div className="flex-1 flex flex-col min-h-full overflow-hidden">
          {/* Sticky header */}
          <div className="px-8 py-5 border-b border-gray-200 bg-white shrink-0">
            {/* Title row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} />
                </Link>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => { if (!isAccepted) { setTitle(e.target.value); setHasChanges(true); } }}
                  readOnly={isAccepted}
                  className={`text-2xl font-bold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 p-0 ${isAccepted ? "cursor-default select-none" : ""}`}
                />
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(proposal.status)}`}>
                  {proposal.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isAccepted && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
                {isAuthor && (
                  <button
                    onClick={() => {
                      setSendTo(clientEmail || "");
                      setSendMessage("");
                      setSendError("");
                      setShowSendModal(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Send size={14} />
                    {isAccepted ? "Resend" : "Send"}
                  </button>
                )}
              </div>
            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={copyPublicLink} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                <Link2 size={12} />
                Copy public link
              </button>
              {isAuthor && ["SENT", "VIEWED"].includes(proposal.status) && (
                <button
                  onClick={() => {
                    setFollowUpTo(clientEmail || "");
                    setFollowUpMessage("");
                    setFollowUpError("");
                    setShowFollowUpModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50"
                >
                  <Mail size={12} />
                  Send Follow-up
                </button>
              )}
              <button onClick={handleDuplicate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                <Copy size={12} />
                Duplicate
              </button>
              <button onClick={() => setShowSaveAsTemplate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                <BookmarkPlus size={12} />
                Save as Template
              </button>
              {!isAccepted && (proposal.status === "LOST" ? (
                <button onClick={reopenProposal} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                  <RotateCcw size={12} />
                  Reopen
                </button>
              ) : (
                <button onClick={() => { setLostReasonInput(proposal.lostReason ?? ""); setShowLostModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50">
                  <XCircle size={12} />
                  Mark as Lost
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={openHistory} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                  <History size={12} />
                  History
                </button>
                {isAuthor && (
                  <button onClick={handleDelete} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50">
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Save as template inline form */}
            {showSaveAsTemplate && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveAsTemplate()}
                  />
                  <button onClick={handleSaveAsTemplate} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Save</button>
                  <button onClick={() => setShowSaveAsTemplate(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Client details */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => { if (!isAccepted) { setClientName(e.target.value); setHasChanges(true); } }}
                  readOnly={isAccepted}
                  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none ${isAccepted ? "bg-gray-50 cursor-default" : "focus:ring-2 focus:ring-blue-500"}`}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => { if (!isAccepted) { setClientEmail(e.target.value); setHasChanges(true); } }}
                  readOnly={isAccepted}
                  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none ${isAccepted ? "bg-gray-50 cursor-default" : "focus:ring-2 focus:ring-blue-500"}`}
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client ABN</label>
                <input
                  type="text"
                  value={clientAbn}
                  onChange={(e) => { if (!isAccepted) { setClientAbn(e.target.value); setHasChanges(true); } }}
                  readOnly={isAccepted}
                  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none ${isAccepted ? "bg-gray-50 cursor-default" : "focus:ring-2 focus:ring-blue-500"}`}
                  placeholder="12 345 678 901"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Expiry date</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => { if (!isAccepted) { setExpiresAt(e.target.value); setHasChanges(true); } }}
                  readOnly={isAccepted}
                  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none ${isAccepted ? "bg-gray-50 cursor-default" : "focus:ring-2 focus:ring-blue-500"}`}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Internal notes (never visible to client)</label>
              <textarea
                value={internalNotes}
                onChange={(e) => { if (!isAccepted) { setInternalNotes(e.target.value); setHasChanges(true); } }}
                readOnly={isAccepted}
                rows={2}
                placeholder="Notes for your reference only..."
                className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none resize-none ${isAccepted ? "bg-gray-50 cursor-default" : "focus:ring-2 focus:ring-blue-500"}`}
              />
            </div>
          </div>

          {/* Editor (fills remaining height) */}
          <div className="flex flex-1 overflow-hidden bg-gray-50">
            <ProposalEditor
              initialDocument={document}
              onUpdate={handleEditorUpdate}
              gstRegistered={gstRegistered}
              readOnly={isAccepted}
              defaultAcceptanceMessage={defaultAcceptanceMessage ?? undefined}
            />
          </div>
        </div>
      </div>

      {/* Send modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-900">Send Proposal</h2>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                This will email the client a link to view &ldquo;{title}&rdquo;.
                {proposal.status === "DRAFT" && " Status will update to SENT."}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Send to</label>
                <input
                  type="email"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSendEmail()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Personal message (optional)</label>
                <textarea
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  placeholder="Add a personal note..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowSendModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSendEmail}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowFollowUpModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-900">Send Follow-up</h2>
              </div>
              <button onClick={() => setShowFollowUpModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Send a follow-up email with a link back to &ldquo;{title}&rdquo;.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Send to</label>
                <input
                  type="email"
                  value={followUpTo}
                  onChange={(e) => setFollowUpTo(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSendFollowUp()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Message (optional)</label>
                <textarea
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  placeholder="Just checking in..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {followUpError && <p className="text-xs text-red-600">{followUpError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowFollowUpModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSendFollowUp}
                disabled={followUpSending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={14} />
                {followUpSending ? "Sending..." : "Send Follow-up"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mark-as-lost modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowLostModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-red-600" />
                <h2 className="text-sm font-semibold text-gray-900">Mark as lost</h2>
              </div>
              <button onClick={() => setShowLostModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">Add an optional note about why this proposal was lost.</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea
                  value={lostReasonInput}
                  onChange={(e) => setLostReasonInput(e.target.value)}
                  placeholder="e.g. went with a competitor, no budget, timing..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowLostModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={markAsLost} disabled={savingLost} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                <XCircle size={14} />
                {savingLost ? "Saving..." : "Mark as lost"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* History / change log modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowHistory(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <History size={18} className="text-gray-600" />
                <h2 className="text-sm font-semibold text-gray-900">Activity &amp; change log</h2>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-3">
                Created by {proposal.authorName ?? "the author"}.
              </p>
              {(!proposal.events || proposal.events.length === 0) ? (
                <p className="text-sm text-gray-500">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {proposal.events.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
                      <div>
                        <p className="text-gray-900">{describeEvent(ev)}</p>
                        <p className="text-xs text-gray-400">{formatDate(ev.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
