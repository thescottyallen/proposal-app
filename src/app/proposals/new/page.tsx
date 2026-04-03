"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { ArrowLeft, Save, Users, UserPlus, Search, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  defaultDocument,
  migrateToDocument,
  isProposalDocument,
  ProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

interface Client {
  id:      string;
  name:    string;
  email:   string;
  company: string | null;
}

type Step = "client" | "editor";
type ClientMode = "existing" | "new";

function NewProposalForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("template");
  const urlClientId  = searchParams.get("clientId");

  // ── Step management ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(urlClientId ? "editor" : "client");

  // ── Client selection state ───────────────────────────────────────────────────
  const [clientMode, setClientMode]         = useState<ClientMode>("existing");
  const [clients, setClients]               = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientSearch, setClientSearch]     = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(urlClientId);

  // New-client form fields
  const [newClientName, setNewClientName]       = useState("");
  const [newClientEmail, setNewClientEmail]     = useState("");
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientError, setNewClientError]     = useState("");
  const [creatingClient, setCreatingClient]     = useState(false);

  // ── Proposal / editor state ──────────────────────────────────────────────────
  const [clientName, setClientName]   = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [title, setTitle]             = useState("Untitled Proposal");
  const [document, setDocument]       = useState<ProposalDocument | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  // ── Load clients list ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data: Client[]) => {
        setClients(data);
        setClientsLoading(false);
        // If no clients exist, default to new-client mode
        if (data.length === 0) setClientMode("new");
      })
      .catch(() => setClientsLoading(false));
  }, []);

  // ── If clientId was in URL, load that client's details ───────────────────────
  useEffect(() => {
    if (!urlClientId) return;
    fetch(`/api/clients/${urlClientId}`)
      .then((r) => r.json())
      .then((client: Client) => {
        setClientName(client.name);
        setClientEmail(client.email);
        if (!templateId) setTitle(`Proposal for ${client.name}`);
      })
      .catch(console.error);
  }, [urlClientId, templateId]);

  // ── Load business settings + initialise document ─────────────────────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setDocument((prev) => {
          if (prev) return prev;
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

  // ── Load template content if provided ───────────────────────────────────────
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
        // Only set template-based title if we don't yet have a client name
        setTitle((prev) =>
          prev === "Untitled Proposal" ? `New Proposal from ${template.name}` : prev
        );
      })
      .catch(console.error);
  }, [templateId]);

  // ── Client step: continue with existing client ───────────────────────────────
  const handleSelectExisting = () => {
    const client = clients.find((c) => c.id === selectedClientId);
    if (!client) return;
    setClientName(client.name);
    setClientEmail(client.email);
    if (!templateId) setTitle(`Proposal for ${client.name}`);
    else setTitle((prev) => prev); // keep template title
    setStep("editor");
  };

  // ── Client step: create new client then continue ────────────────────────────
  const handleCreateClient = async () => {
    setNewClientError("");
    if (!newClientName.trim()) {
      setNewClientError("Name is required.");
      return;
    }
    if (!newClientEmail.trim() || !newClientEmail.includes("@")) {
      setNewClientError("A valid email address is required.");
      return;
    }
    setCreatingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    newClientName.trim(),
          email:   newClientEmail.trim(),
          company: newClientCompany.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewClientError(data.error || "Failed to create client.");
        return;
      }
      setSelectedClientId(data.id);
      setClientName(data.name);
      setClientEmail(data.email);
      if (!templateId) setTitle(`Proposal for ${data.name}`);
      setStep("editor");
    } catch {
      setNewClientError("Network error. Please try again.");
    } finally {
      setCreatingClient(false);
    }
  };

  // ── Editor: save proposal ────────────────────────────────────────────────────
  const handleEditorUpdate = useCallback((doc: ProposalDocument) => {
    setDocument(doc);
  }, []);

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/proposals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title,
          clientName,
          clientEmail,
          content:    document,
          templateId: templateId  || undefined,
          clientId:   selectedClientId || undefined,
        }),
      });
      if (!res.ok) {
        setSaveError("Failed to save proposal. Please try again.");
        return;
      }
      const proposal = await res.json();
      router.push(`/proposals/${proposal.id}/edit`);
    } catch {
      setSaveError("Failed to save proposal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered client list ─────────────────────────────────────────────────────
  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q)
    );
  });

  // ── Render: client selection step ───────────────────────────────────────────
  if (step === "client") {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-full bg-gray-50 p-8">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-lg">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-1">
                <Link href="/" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft size={16} />
                </Link>
                <h1 className="text-base font-semibold text-gray-900">Who is this proposal for?</h1>
              </div>
              {templateId && (
                <p className="text-xs text-gray-500 ml-9">Using selected template</p>
              )}
            </div>

            {/* Mode tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setClientMode("existing")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  clientMode === "existing"
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Users size={15} />
                Existing client
              </button>
              <button
                onClick={() => setClientMode("new")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  clientMode === "new"
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <UserPlus size={15} />
                New client
              </button>
            </div>

            <div className="px-6 py-5">
              {/* ── Existing client mode ── */}
              {clientMode === "existing" && (
                <>
                  {clientsLoading ? (
                    <p className="text-sm text-gray-500 py-4 text-center">Loading clients...</p>
                  ) : clients.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500 mb-3">No clients yet.</p>
                      <button
                        onClick={() => setClientMode("new")}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Create your first client
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Search */}
                      <div className="relative mb-3">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          placeholder="Search clients..."
                          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      </div>

                      {/* Client list */}
                      <div className="space-y-1 max-h-56 overflow-y-auto mb-4">
                        {filteredClients.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No clients match your search.</p>
                        ) : (
                          filteredClients.map((client) => (
                            <button
                              key={client.id}
                              onClick={() => setSelectedClientId(client.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                                selectedClientId === client.id
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <p className="text-sm font-medium text-gray-900">{client.name}</p>
                              <p className="text-xs text-gray-500">
                                {client.email}
                                {client.company && ` · ${client.company}`}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── New client mode ── */}
              {clientMode === "new" && (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="jane@acme.com"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Company <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                    <input
                      type="text"
                      value={newClientCompany}
                      onChange={(e) => setNewClientCompany(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === "Enter" && handleCreateClient()}
                    />
                  </div>
                  {newClientError && (
                    <p className="text-xs text-red-600">{newClientError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              {clientMode === "existing" ? (
                <button
                  onClick={handleSelectExisting}
                  disabled={!selectedClientId}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  onClick={handleCreateClient}
                  disabled={creatingClient}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creatingClient ? "Creating..." : "Create & Continue"}
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Render: editor step ──────────────────────────────────────────────────────
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
        <div className="flex-1 flex flex-col min-h-full">
          {/* Header bar */}
          <div className="px-8 py-5 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep("client")}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
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

            {/* Client summary — read-only, click back arrow to change */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                <Users size={13} className="text-gray-400 shrink-0" />
                <span className="text-sm font-medium text-gray-700">{clientName}</span>
                <span className="text-sm text-gray-400">{clientEmail}</span>
                <button
                  onClick={() => setStep("client")}
                  className="text-xs text-blue-600 hover:text-blue-700 ml-1"
                >
                  Change
                </button>
              </div>
            </div>

            {saveError && (
              <p className="mt-2 text-sm text-red-600">{saveError}</p>
            )}
          </div>

          {/* Editor */}
          <div className="flex flex-1 overflow-hidden bg-gray-50">
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
