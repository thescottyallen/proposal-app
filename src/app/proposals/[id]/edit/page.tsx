"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { isValidEmail, optionalCopyError, previewRecipientEmail } from "@/lib/email-recipients";
import {
  ArrowLeft, Save, Send, Copy, Trash2,
  BookmarkPlus, Check, Mail, X, Link2, Lock, History, XCircle, RotateCcw, Eye,
} from "lucide-react";
import Link from "next/link";
import { getStatusColor } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  ProposalDocument,
  migrateToDocument,
  isProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";
import {
  clearLocalBackup,
  contentFromSnapshot,
  readLocalBackup,
  shouldOfferLocalRestore,
  writeLocalBackup,
  type EditorBackup,
} from "@/lib/proposal-save";
import { SaveConflictBanner, SaveStatusText, UnsavedChangesBanner } from "@/components/editor/SaveProtection";
import { ProposalHistoryPanel, type HistoryPreview } from "@/components/editor/ProposalHistoryPanel";

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
  authorEmail?:       string;
  viewerIsAuthor?:    boolean;
  events?:            ProposalEventMeta[];
  updatedAt?:         string;
  revisions?:         ProposalRevisionMeta[];
}

interface ProposalRevisionMeta {
  version:     number;
  createdAt:   string;
  createdBy:   string;
  savedByName: string;
  summary:     string;
}

interface DraftFields {
  title:         string;
  clientName:    string;
  clientEmail:   string;
  clientAbn:     string;
  internalNotes: string;
  expiresAt:     string;
  document:      ProposalDocument;
}

interface ProposalEventMeta {
  id:        string;
  eventType: string;
  createdAt: string;
  actorName: string | null;
  metadata:  {
    editedBy?: string;
    changedFields?: string[];
    to?: string;
    cc?: string[];
    bcc?: string[];
    paymentChoices?: { label?: string }[];
  } | null;
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
  if (ev.eventType === "preview_sent") {
    if (!ev.metadata?.to) return "Preview link emailed";
    const copies = [
      ...(ev.metadata.cc ?? []).map((email) => `CC ${email}`),
      ...(ev.metadata.bcc ?? []).map((email) => `BCC ${email}`),
    ];
    return copies.length > 0
      ? `Preview emailed to ${ev.metadata.to} (${copies.join(", ")})`
      : `Preview emailed to ${ev.metadata.to}`;
  }
  if (ev.eventType === "accepted") {
    const labels = (ev.metadata?.paymentChoices ?? [])
      .map((choice) => choice.label)
      .filter((label): label is string => Boolean(label));
    return labels.length > 0
      ? `Proposal was accepted — ${labels.join("; ")}`
      : "Proposal was accepted";
  }
  const labels: Record<string, string> = {
    opened:         "Client opened the proposal",
    viewed_section: "Client viewed a section",
    forwarded:      "Proposal was forwarded",
    signed:         "Proposal was signed",
  };
  return labels[ev.eventType] ?? ev.eventType;
}

function draftFromProposal(data: ProposalMeta): DraftFields {
  const rawContent = (data.content ?? {}) as Record<string, unknown>;
  const document = isProposalDocument(rawContent)
    ? rawContent
    : migrateToDocument(
        rawContent,
        (data.pricingData ?? null) as Parameters<typeof migrateToDocument>[1],
        legacyPricingSettings(data)
      );
  return {
    title:         data.title ?? "",
    clientName:    data.clientName ?? "",
    clientEmail:   data.clientEmail ?? "",
    clientAbn:     data.clientAbn ?? "",
    internalNotes: data.internalNotes ?? "",
    expiresAt:     data.expiresAt ? data.expiresAt.slice(0, 10) : "",
    document,
  };
}

function documentFromUnknown(content: unknown, proposal: ProposalMeta): ProposalDocument {
  if (isProposalDocument(content)) return content;
  const raw = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  return migrateToDocument(
    raw,
    (proposal.pricingData ?? null) as Parameters<typeof migrateToDocument>[1],
    legacyPricingSettings(proposal)
  );
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

function OptionalCopyFields({
  cc,
  bcc,
  onCc,
  onBcc,
}: {
  cc: string;
  bcc: string;
  onCc: (value: string) => void;
  onBcc: (value: string) => void;
}) {
  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">CC (optional)</label>
        <input
          type="text"
          value={cc}
          onChange={(e) => onCc(e.target.value)}
          placeholder="colleague@company.com, finance@company.com"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">BCC (optional)</label>
        <input
          type="text"
          value={bcc}
          onChange={(e) => onBcc(e.target.value)}
          placeholder="another@company.com"
          className={inputClass}
        />
      </div>
    </>
  );
}

export default function EditProposalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user } = useUser();

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
  const [sendCc, setSendCc]               = useState("");
  const [sendBcc, setSendBcc]             = useState("");
  const [sendMessage, setSendMessage]     = useState("");
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState("");
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpTo, setFollowUpTo]               = useState("");
  const [followUpCc, setFollowUpCc]               = useState("");
  const [followUpBcc, setFollowUpBcc]             = useState("");
  const [followUpMessage, setFollowUpMessage]     = useState("");
  const [followUpSending, setFollowUpSending]     = useState(false);
  const [followUpError, setFollowUpError]         = useState("");
  const [showPreviewModal, setShowPreviewModal]   = useState(false);
  const [previewTo, setPreviewTo]                 = useState("");
  const [previewCc, setPreviewCc]                 = useState("");
  const [previewBcc, setPreviewBcc]               = useState("");
  const [previewMessage, setPreviewMessage]       = useState("");
  const [previewSending, setPreviewSending]       = useState(false);
  const [previewError, setPreviewError]           = useState("");
  const [baseUpdatedAt, setBaseUpdatedAt]         = useState<string | null>(null);
  const [conflictAt, setConflictAt]               = useState<string | null>(null);
  const [backupOffer, setBackupOffer]             = useState<EditorBackup | null>(null);
  const [savePhase, setSavePhase]                 = useState<"idle" | "saving" | "saved" | "retrying">("idle");
  const [savedAt, setSavedAt]                     = useState<string | null>(null);
  const [editorEpoch, setEditorEpoch]             = useState(0);
  const [historyPreview, setHistoryPreview]       = useState<HistoryPreview | null>(null);
  const [historyPreviewLoading, setHistoryPreviewLoading] = useState(false);
  const [restoring, setRestoring]                 = useState(false);

  const hasChangesRef = useRef(false);
  const conflictRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const draftRef = useRef<DraftFields | null>(null);
  const saveTail = useRef(Promise.resolve());

  const { clearChanges } = useUnsavedChanges(hasChanges);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    conflictRef.current = conflictAt != null;
  }, [conflictAt]);

  useEffect(() => {
    baseUpdatedAtRef.current = baseUpdatedAt;
  }, [baseUpdatedAt]);

  useEffect(() => {
    if (!document) {
      draftRef.current = null;
      return;
    }
    draftRef.current = {
      title,
      clientName,
      clientEmail,
      clientAbn,
      internalNotes,
      expiresAt,
      document,
    };
  }, [title, clientName, clientEmail, clientAbn, internalNotes, expiresAt, document]);

  const applyDraft = (draft: DraftFields) => {
    draftRef.current = draft;
    setTitle(draft.title);
    setClientName(draft.clientName);
    setClientEmail(draft.clientEmail);
    setClientAbn(draft.clientAbn);
    setInternalNotes(draft.internalNotes);
    setExpiresAt(draft.expiresAt);
    setDocument(draft.document);
    setEditorEpoch((epoch) => epoch + 1);
  };

  const serverStateFromDraft = (draft: DraftFields, updatedAt: string) => ({
    updatedAt,
    title: draft.title,
    clientName: draft.clientName,
    clientEmail: draft.clientEmail,
    clientAbn: draft.clientAbn,
    internalNotes: draft.internalNotes,
    expiresAt: draft.expiresAt,
    content: draft.document,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/proposals/${id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([data, settings]) => {
      const draft = draftFromProposal(data);
      setProposal(data);
      applyDraft(draft);
      setGstRegistered(settings.gstRegistered ?? false);
      setDefaultAcceptanceMessage(settings.defaultAcceptanceMessage ?? null);
      const loadedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
      baseUpdatedAtRef.current = loadedAt;
      setBaseUpdatedAt(loadedAt);
      setSavedAt(loadedAt);
      const backup = readLocalBackup(window.localStorage, id);
      setBackupOffer(
        backup && loadedAt && shouldOfferLocalRestore(backup, serverStateFromDraft(draft, loadedAt))
          ? backup
          : null
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleEditorUpdate = useCallback((doc: ProposalDocument) => {
    setDocument(doc);
    setHasChanges(true);
  }, []);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  type SaveResult = "saved" | "skipped" | "conflict" | "error";

  const saveProposal = useCallback((opts?: {
    force?: boolean;
    auto?: boolean;
    override?: DraftFields;
  }): Promise<SaveResult> => {
    const run = async (): Promise<SaveResult> => {
      const draft = opts?.override ?? draftRef.current;
      if (!draft?.document) return "error";
      if (opts?.auto && (conflictRef.current || !hasChangesRef.current)) return "skipped";
      if (!opts?.force && !opts?.auto && !opts?.override && !hasChangesRef.current) return "skipped";

      if (opts?.override) {
        draftRef.current = opts.override;
      }

      const payload = {
        title:         draft.title,
        clientName:    draft.clientName,
        clientEmail:   draft.clientEmail,
        clientAbn:     draft.clientAbn || null,
        internalNotes: draft.internalNotes || null,
        expiresAt:     draft.expiresAt || null,
        content:       draft.document,
        baseUpdatedAt: baseUpdatedAtRef.current,
        force:         opts?.force === true,
      };
      const body = JSON.stringify(payload);

      setSaving(true);
      setSavePhase("saving");
      try {
        writeLocalBackup(window.localStorage, id, {
          savedAt:       new Date().toISOString(),
          title:         draft.title,
          clientName:    draft.clientName,
          clientEmail:   draft.clientEmail,
          clientAbn:     draft.clientAbn,
          internalNotes: draft.internalNotes,
          expiresAt:     draft.expiresAt,
          content:       draft.document,
        });
        const res = await fetch(`/api/proposals/${id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          keepalive: opts?.auto === true && body.length < 60_000,
          body,
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          const at = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
          conflictRef.current = true;
          setConflictAt(at);
          setSavePhase("idle");
          if (opts?.override) {
            applyDraft(opts.override);
            hasChangesRef.current = true;
            setHasChanges(true);
          }
          return "conflict";
        }
        if (!res.ok) {
          setSavePhase("retrying");
          if (!opts?.auto) showToastRef.current("Couldn't save just now. We'll keep trying.");
          return "error";
        }
        const saved = await res.json();
        const nextUpdatedAt = typeof saved.updatedAt === "string" ? saved.updatedAt : new Date().toISOString();
        baseUpdatedAtRef.current = nextUpdatedAt;
        setBaseUpdatedAt(nextUpdatedAt);
        setSavedAt(nextUpdatedAt);
        hasChangesRef.current = false;
        setHasChanges(false);
        conflictRef.current = false;
        setConflictAt(null);
        setSavePhase("saved");
        clearLocalBackup(window.localStorage, id);
        setBackupOffer(null);
        if (opts?.override) applyDraft(opts.override);
        setProposal((prev) => (prev ? { ...prev, updatedAt: nextUpdatedAt, status: saved.status ?? prev.status } : prev));
        if (!opts?.auto) showToastRef.current("Saved");
        return "saved";
      } catch {
        setSavePhase("retrying");
        if (!opts?.auto) showToastRef.current("Couldn't save just now. We'll keep trying.");
        return "error";
      } finally {
        setSaving(false);
      }
    };

    const job = saveTail.current.then(run, run);
    saveTail.current = job.then(() => undefined, () => undefined);
    return job;
  }, [id]);

  const isAccepted = proposal?.status === "ACCEPTED";

  useEffect(() => {
    if (loading || isAccepted || !hasChanges || conflictAt) return;
    const tick = () => { void saveProposal({ auto: true }); };
    const interval = window.setInterval(tick, 30_000);
    const onHide = () => { void saveProposal({ auto: true }); };
    window.addEventListener("blur", onHide);
    window.addEventListener("pagehide", onHide);
    const onVis = () => {
      if (window.document.visibilityState === "hidden") onHide();
    };
    window.document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("pagehide", onHide);
      window.document.removeEventListener("visibilitychange", onVis);
    };
  }, [loading, isAccepted, hasChanges, conflictAt, saveProposal]);

  useEffect(() => {
    if (loading || !hasChanges || !document) return;
    const handle = window.setTimeout(() => {
      const draft = draftRef.current;
      if (!draft) return;
      writeLocalBackup(window.localStorage, id, {
        savedAt:       new Date().toISOString(),
        title:         draft.title,
        clientName:    draft.clientName,
        clientEmail:   draft.clientEmail,
        clientAbn:     draft.clientAbn,
        internalNotes: draft.internalNotes,
        expiresAt:     draft.expiresAt,
        content:       draft.document,
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [loading, hasChanges, document, title, clientName, clientEmail, clientAbn, internalNotes, expiresAt, id]);

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
                revisions:      data.revisions,
                authorName:     data.authorName,
                authorEmail:    data.authorEmail,
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
      const saved = await res.json().catch(() => ({}));
      if (typeof saved.updatedAt === "string") {
        baseUpdatedAtRef.current = saved.updatedAt;
        setBaseUpdatedAt(saved.updatedAt);
      }
      setProposal((prev) => (prev ? { ...prev, status: "LOST", lostReason: reason, updatedAt: saved.updatedAt ?? prev.updatedAt } : prev));
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
      const saved = await res.json().catch(() => ({}));
      if (typeof saved.updatedAt === "string") {
        baseUpdatedAtRef.current = saved.updatedAt;
        setBaseUpdatedAt(saved.updatedAt);
      }
      setProposal((prev) => (prev ? { ...prev, status: "DRAFT", lostReason: null, updatedAt: saved.updatedAt ?? prev.updatedAt } : prev));
      showToast("Proposal reopened");
    } catch {
      showToast("Failed to reopen");
    }
  };

  const reloadFromServer = async () => {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      if (!res.ok) { showToast("Couldn't reload this proposal"); return; }
      const data = await res.json() as ProposalMeta;
      const draft = draftFromProposal(data);
      applyDraft(draft);
      setProposal(data);
      const loadedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
      baseUpdatedAtRef.current = loadedAt;
      setBaseUpdatedAt(loadedAt);
      setSavedAt(loadedAt);
      hasChangesRef.current = false;
      setHasChanges(false);
      conflictRef.current = false;
      setConflictAt(null);
      setSavePhase(loadedAt ? "saved" : "idle");
      const backup = readLocalBackup(window.localStorage, id);
      setBackupOffer(
        backup && loadedAt && shouldOfferLocalRestore(backup, serverStateFromDraft(draft, loadedAt))
          ? backup
          : null
      );
    } catch {
      showToast("Couldn't reload this proposal");
    }
  };

  const restoreLocalBackup = () => {
    if (!backupOffer || !proposal) return;
    const draft: DraftFields = {
      title:         backupOffer.title,
      clientName:    backupOffer.clientName,
      clientEmail:   backupOffer.clientEmail,
      clientAbn:     backupOffer.clientAbn,
      internalNotes: backupOffer.internalNotes,
      expiresAt:     backupOffer.expiresAt,
      document:      documentFromUnknown(backupOffer.content, proposal),
    };
    applyDraft(draft);
    hasChangesRef.current = true;
    setHasChanges(true);
    setBackupOffer(null);
  };

  const discardLocalBackup = () => {
    clearLocalBackup(window.localStorage, id);
    setBackupOffer(null);
  };

  const previewRevision = async (version: number) => {
    if (!proposal) return;
    setHistoryPreviewLoading(true);
    try {
      const res = await fetch(`/api/proposals/${id}/revisions/${version}`);
      if (!res.ok) { showToast("Couldn't open that version"); return; }
      const data = await res.json();
      const content = contentFromSnapshot(data.snapshot);
      setHistoryPreview({
        version:     data.version,
        createdAt:   data.createdAt,
        savedByName: data.savedByName ?? "Unknown user",
        summary:     data.summary ?? "",
        document:    documentFromUnknown(content, proposal),
      });
    } catch {
      showToast("Couldn't open that version");
    } finally {
      setHistoryPreviewLoading(false);
    }
  };

  const restoreRevision = async (version: number) => {
    if (!proposal) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/proposals/${id}/revisions/${version}`);
      if (!res.ok) { showToast("Couldn't restore that version"); return; }
      const data = await res.json();
      const snap = (data.snapshot ?? {}) as Record<string, unknown>;
      const current = draftRef.current;
      const draft: DraftFields = {
        title:         typeof snap.title === "string" ? snap.title : (current?.title ?? title),
        clientName:    typeof snap.clientName === "string" ? snap.clientName : (current?.clientName ?? clientName),
        clientEmail:   typeof snap.clientEmail === "string" ? snap.clientEmail : (current?.clientEmail ?? clientEmail),
        clientAbn:     typeof snap.clientAbn === "string" ? snap.clientAbn : (current?.clientAbn ?? clientAbn),
        internalNotes: typeof snap.internalNotes === "string" ? snap.internalNotes : (current?.internalNotes ?? internalNotes),
        expiresAt:     typeof snap.expiresAt === "string" ? snap.expiresAt.slice(0, 10) : (current?.expiresAt ?? expiresAt),
        document:      documentFromUnknown(contentFromSnapshot(snap), proposal),
      };
      const result = await saveProposal({ override: draft });
      if (result === "saved") {
        setShowHistory(false);
        setHistoryPreview(null);
        showToast("Restored. The version you replaced is in history if you want it back.");
      } else if (result === "conflict") {
        setShowHistory(false);
        setHistoryPreview(null);
      }
    } catch {
      showToast("Couldn't restore that version");
    } finally {
      setRestoring(false);
    }
  };

  const handleDuplicate = async () => {
    if (!document) return;
    const saved = await saveProposal();
    if (saved === "conflict" || saved === "error") return;
    const draft = draftRef.current;
    if (!draft) return;
    const res = await fetch("/api/proposals", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       `${draft.title} (Copy)`,
        clientName:  draft.clientName,
        clientEmail: draft.clientEmail,
        content:     draft.document,
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
    showToast(proposal.status === "DRAFT" ? "Preview link copied" : "Link copied");
  };

  const handleSendEmail = async () => {
    if (!sendTo.trim() || !sendTo.includes("@")) {
      setSendError("Please enter a valid email address.");
      return;
    }
    const copyError = optionalCopyError(sendCc, sendBcc);
    if (copyError) {
      setSendError(copyError);
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const saved = await saveProposal();
      if (saved === "conflict" || saved === "error") {
        setSendError("We couldn't save your latest edits, so the email wasn't sent.");
        return;
      }
      const res = await fetch(`/api/proposals/${id}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: sendTo, cc: sendCc, bcc: sendBcc, message: sendMessage }),
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

  const handleSendPreview = async () => {
    const to = previewTo.trim();
    if (!isValidEmail(to)) {
      setPreviewError("Please enter a valid email address.");
      return;
    }
    const copyError = optionalCopyError(previewCc, previewBcc);
    if (copyError) {
      setPreviewError(copyError);
      return;
    }
    setPreviewSending(true);
    setPreviewError("");
    try {
      const saved = await saveProposal();
      if (saved === "conflict" || saved === "error") {
        setPreviewError("We couldn't save your latest edits, so the email wasn't sent.");
        return;
      }
      const res = await fetch(`/api/proposals/${id}/preview`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to, cc: previewCc, bcc: previewBcc, message: previewMessage }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPreviewError(data.error || "Failed to send preview.");
        return;
      }
      setShowPreviewModal(false);
      showToast("Preview sent to " + to);
    } catch {
      setPreviewError("Network error. Please try again.");
    } finally {
      setPreviewSending(false);
    }
  };

  const handleSendFollowUp = async () => {
    if (!followUpTo.trim() || !followUpTo.includes("@")) {
      setFollowUpError("Please enter a valid email address.");
      return;
    }
    const copyError = optionalCopyError(followUpCc, followUpBcc);
    if (copyError) {
      setFollowUpError(copyError);
      return;
    }
    setFollowUpSending(true);
    setFollowUpError("");
    try {
      const res = await fetch(`/api/proposals/${id}/followup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ to: followUpTo, cc: followUpCc, bcc: followUpBcc, message: followUpMessage }),
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

  // Admins can open & edit any proposal, but sending, follow-ups and deletion
  // stay with the author. (Older API responses omit the flag -> treat as author.)
  const isAuthor = proposal.viewerIsAuthor !== false;
  const creatorEmail = previewRecipientEmail({
    authorEmail: proposal.authorEmail,
    viewerEmail: user?.primaryEmailAddress?.emailAddress,
    isAuthor,
  });

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

      {conflictAt && (
        <SaveConflictBanner
          updatedAt={conflictAt}
          onReload={() => { void reloadFromServer(); }}
          onOverwrite={() => { void saveProposal({ force: true }); }}
          overwriting={saving}
        />
      )}

      {backupOffer && !conflictAt && !isAccepted && (
        <UnsavedChangesBanner
          savedAt={backupOffer.savedAt}
          onRestore={restoreLocalBackup}
          onDiscard={discardLocalBackup}
        />
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
                  <>
                    {!conflictAt && <SaveStatusText phase={savePhase} savedAt={savedAt} />}
                    <button
                      onClick={() => { void saveProposal(); }}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <Save size={14} />
                      Save
                    </button>
                  </>
                )}
                {isAuthor && (
                  <button
                    onClick={() => {
                      setSendTo(clientEmail || "");
                      setSendCc("");
                      setSendBcc("");
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
              {isAuthor && (
                <button
                  onClick={() => {
                    setPreviewTo(creatorEmail);
                    setPreviewCc("");
                    setPreviewBcc("");
                    setPreviewMessage("");
                    setPreviewError("");
                    setShowPreviewModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <Eye size={12} />
                  Send Preview
                </button>
              )}
              {isAuthor && ["SENT", "VIEWED"].includes(proposal.status) && (
                <button
                  onClick={() => {
                    setFollowUpTo(clientEmail || "");
                    setFollowUpCc("");
                    setFollowUpBcc("");
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
              key={editorEpoch}
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
              <OptionalCopyFields cc={sendCc} bcc={sendBcc} onCc={setSendCc} onBcc={setSendBcc} />
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

      {/* Preview email modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowPreviewModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-amber-600" />
                <h2 className="text-sm font-semibold text-gray-900">Send Preview</h2>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Email a preview link for &ldquo;{title}&rdquo; to yourself so you can check it before the client sees it.
                The recipient can open it without signing in.
                {proposal.status === "DRAFT"
                  ? " The proposal stays a draft, and this visit is not recorded as a client view."
                  : " This does not change the proposal status."}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Send to</label>
                <input
                  type="email"
                  value={previewTo}
                  onChange={(e) => setPreviewTo(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSendPreview()}
                />
              </div>
              <OptionalCopyFields cc={previewCc} bcc={previewBcc} onCc={setPreviewCc} onBcc={setPreviewBcc} />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Personal message (optional)</label>
                <textarea
                  value={previewMessage}
                  onChange={(e) => setPreviewMessage(e.target.value)}
                  placeholder="Add a note about this preview..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {previewError && <p className="text-xs text-red-600">{previewError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSendPreview}
                disabled={previewSending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={14} />
                {previewSending ? "Sending..." : "Send Preview"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowFollowUpModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
              <OptionalCopyFields cc={followUpCc} bcc={followUpBcc} onCc={setFollowUpCc} onBcc={setFollowUpBcc} />
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
      {showHistory && (
        <ProposalHistoryPanel
          authorName={proposal.authorName ?? "the author"}
          revisions={proposal.revisions ?? []}
          activity={(proposal.events ?? []).map((ev) => ({
            id: ev.id,
            text: describeEvent(ev),
            createdAt: ev.createdAt,
          }))}
          preview={historyPreview}
          previewLoading={historyPreviewLoading}
          restoreDisabled={isAccepted}
          restoring={restoring}
          onClose={() => { setShowHistory(false); setHistoryPreview(null); }}
          onPreview={(version) => { void previewRevision(version); }}
          onRestore={(version) => { void restoreRevision(version); }}
        />
      )}
    </Shell>
  );
}
