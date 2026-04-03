"use client";

import { Shell } from "@/components/ui/Shell";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import {
  ArrowLeft, Save, Building2, UserPlus, Search,
  ChevronRight, Star, User, Plus,
} from "lucide-react";
import Link from "next/link";
import {
  defaultDocument,
  migrateToDocument,
  isProposalDocument,
  ProposalDocument,
} from "@/lib/proposal-document";
import { defaultPricingSettings } from "@/lib/pricing-types";

interface Contact {
  id:     string;
  name:   string;
  email:  string;
  phone:  string | null;
  isMain: boolean;
}

interface Client {
  id:       string;
  name:     string;
  contacts: Contact[];
}

type Step = "client" | "contact" | "editor";
type ClientMode = "existing" | "new";

function NewProposalForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("template");
  const urlClientId  = searchParams.get("clientId");

  // ── Step ─────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(urlClientId ? "contact" : "client");

  // ── Client selection ─────────────────────────────────────────────────────────
  const [clientMode, setClientMode]         = useState<ClientMode>("existing");
  const [clients, setClients]               = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientSearch, setClientSearch]     = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(urlClientId);
  const [selectedClient, setSelectedClient]     = useState<Client | null>(null);

  // New company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyError, setNewCompanyError] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);

  // ── Contact selection ─────────────────────────────────────────────────────────
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact]         = useState(false);

  // New contact form (used both within "new company" flow and when adding contact to existing)
  const [newContactName, setNewContactName]   = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactError, setNewContactError] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  // ── Proposal / editor ────────────────────────────────────────────────────────
  const [clientName, setClientName]   = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [contactId, setContactId]     = useState<string | null>(null);
  const [title, setTitle]             = useState("Untitled Proposal");
  const [document, setDocument]       = useState<ProposalDocument | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  // ── Load clients ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data: Client[]) => {
        setClients(data);
        setClientsLoading(false);
        if (data.length === 0) setClientMode("new");
      })
      .catch(() => setClientsLoading(false));
  }, []);

  // ── If clientId was in URL, load that client ──────────────────────────────────
  useEffect(() => {
    if (!urlClientId) return;
    fetch(`/api/clients/${urlClientId}`)
      .then((r) => r.json())
      .then((client: Client) => {
        setSelectedClient(client);
        setSelectedClientId(client.id);
        // Auto-select main contact if only one, or the main contact
        const main = client.contacts.find((c) => c.isMain) ?? client.contacts[0];
        if (main) {
          setSelectedContactId(main.id);
          setClientName(client.name);
          setClientEmail(main.email);
          setContactId(main.id);
          if (!templateId) setTitle(`Proposal for ${client.name}`);
          // Auto-advance to editor if only one contact
          if (client.contacts.length === 1) setStep("editor");
        }
      })
      .catch(console.error);
  }, [urlClientId, templateId]);

  // ── Business settings + document ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setDocument((prev) => prev ?? defaultDocument({
          currency:     s.defaultCurrency ?? "AUD",
          roundingMode: s.roundingMode    ?? "CENTS",
        }));
      })
      .catch(() => { setDocument((prev) => prev ?? defaultDocument()); });
  }, []);

  // ── Load template ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then((template) => {
        if (template.content) {
          const content = template.content as Record<string, unknown>;
          setDocument(
            isProposalDocument(content) ? content : migrateToDocument(content, null, defaultPricingSettings())
          );
        }
        setTitle((prev) => prev === "Untitled Proposal" ? `New Proposal from ${template.name}` : prev);
      })
      .catch(console.error);
  }, [templateId]);

  // ── Client step handlers ──────────────────────────────────────────────────────

  const handleSelectExistingClient = () => {
    const client = clients.find((c) => c.id === selectedClientId);
    if (!client) return;
    setSelectedClient(client);
    const main = client.contacts.find((c) => c.isMain) ?? client.contacts[0];
    if (main) setSelectedContactId(main.id);
    setClientName(client.name);
    if (!templateId) setTitle(`Proposal for ${client.name}`);
    // Skip contact step if only one contact
    if (client.contacts.length === 1 && main) {
      setClientEmail(main.email);
      setContactId(main.id);
      setStep("editor");
    } else {
      setStep("contact");
    }
  };

  const handleCreateCompany = async () => {
    setNewCompanyError("");
    if (!newCompanyName.trim()) { setNewCompanyError("Company name is required."); return; }
    if (!newContactName.trim() || !newContactEmail.trim() || !newContactEmail.includes("@")) {
      setNewCompanyError("Contact name and a valid email are required.");
      return;
    }
    setCreatingCompany(true);
    try {
      const res = await fetch("/api/clients", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    newCompanyName.trim(),
          contact: { name: newContactName.trim(), email: newContactEmail.trim(), phone: newContactPhone.trim() || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setNewCompanyError(data.error || "Failed to create client."); return; }
      setSelectedClientId(data.id);
      setSelectedClient(data);
      const contact = data.contacts?.[0];
      if (contact) {
        setSelectedContactId(contact.id);
        setClientEmail(contact.email);
        setContactId(contact.id);
      }
      setClientName(data.name);
      if (!templateId) setTitle(`Proposal for ${data.name}`);
      setStep("editor");
    } catch {
      setNewCompanyError("Network error. Please try again.");
    } finally {
      setCreatingCompany(false);
    }
  };

  // ── Contact step handlers ─────────────────────────────────────────────────────

  const handleSelectContact = () => {
    const contact = selectedClient?.contacts.find((c) => c.id === selectedContactId);
    if (!contact) return;
    setClientEmail(contact.email);
    setContactId(contact.id);
    setStep("editor");
  };

  const handleAddNewContact = async () => {
    setNewContactError("");
    if (!newContactName.trim() || !newContactEmail.trim() || !newContactEmail.includes("@")) {
      setNewContactError("Name and a valid email are required.");
      return;
    }
    if (!selectedClientId) return;
    setCreatingContact(true);
    try {
      const res = await fetch(`/api/clients/${selectedClientId}/contacts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newContactName.trim(), email: newContactEmail.trim(), phone: newContactPhone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setNewContactError(data.error || "Failed to add contact."); return; }
      // Refresh client contacts
      const updated: Client = await fetch(`/api/clients/${selectedClientId}`).then((r) => r.json());
      setSelectedClient(updated);
      setSelectedContactId(data.id);
      setNewContactName(""); setNewContactEmail(""); setNewContactPhone("");
      setShowAddContact(false);
    } catch {
      setNewContactError("Network error. Please try again.");
    } finally {
      setCreatingContact(false);
    }
  };

  // ── Editor ────────────────────────────────────────────────────────────────────

  const handleEditorUpdate = useCallback((doc: ProposalDocument) => { setDocument(doc); }, []);

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
          templateId: templateId      || undefined,
          clientId:   selectedClientId || undefined,
          contactId:  contactId       || undefined,
        }),
      });
      if (!res.ok) { setSaveError("Failed to save proposal. Please try again."); return; }
      const proposal = await res.json();
      router.push(`/proposals/${proposal.id}/edit`);
    } catch {
      setSaveError("Failed to save proposal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.contacts.some((ct) => ct.name.toLowerCase().includes(q) || ct.email.toLowerCase().includes(q))
    );
  });

  // ── Step 1: Client ────────────────────────────────────────────────────────────
  if (step === "client") {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-full bg-gray-50 p-8">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-1">
                <Link href="/" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft size={16} />
                </Link>
                <h1 className="text-base font-semibold text-gray-900">Who is this proposal for?</h1>
              </div>
              {templateId && <p className="text-xs text-gray-500 ml-9">Using selected template</p>}
            </div>

            <div className="flex border-b border-gray-200">
              {(["existing", "new"] as ClientMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setClientMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    clientMode === mode
                      ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {mode === "existing" ? <><Building2 size={15} />Existing client</> : <><UserPlus size={15} />New client</>}
                </button>
              ))}
            </div>

            <div className="px-6 py-5">
              {clientMode === "existing" && (
                <>
                  {clientsLoading ? (
                    <p className="text-sm text-gray-500 py-4 text-center">Loading clients...</p>
                  ) : clients.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500 mb-3">No clients yet.</p>
                      <button onClick={() => setClientMode("new")} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                        Create your first client
                      </button>
                    </div>
                  ) : (
                    <>
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
                      <div className="space-y-1 max-h-56 overflow-y-auto mb-4">
                        {filteredClients.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No clients match your search.</p>
                        ) : filteredClients.map((client) => {
                          const main = client.contacts.find((c) => c.isMain) ?? client.contacts[0];
                          return (
                            <button
                              key={client.id}
                              onClick={() => setSelectedClientId(client.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                                selectedClientId === client.id
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Building2 size={13} className="text-gray-400 shrink-0" />
                                <p className="text-sm font-medium text-gray-900">{client.name}</p>
                              </div>
                              {main && (
                                <p className="text-xs text-gray-500 mt-0.5 ml-5">
                                  {main.name} · {main.email}
                                  {client.contacts.length > 1 && ` +${client.contacts.length - 1} more`}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {clientMode === "new" && (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Company name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Main contact <span className="text-red-500">*</span></label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        placeholder="Full name *"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="email"
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                        placeholder="Email *"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="tel"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => e.key === "Enter" && handleCreateCompany()}
                      />
                    </div>
                  </div>
                  {newCompanyError && <p className="text-xs text-red-600">{newCompanyError}</p>}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              {clientMode === "existing" ? (
                <button
                  onClick={handleSelectExistingClient}
                  disabled={!selectedClientId}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                  <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  onClick={handleCreateCompany}
                  disabled={creatingCompany}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creatingCompany ? "Creating..." : "Create & Continue"}
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Step 2: Contact ────────────────────────────────────────────────────────────
  if (step === "contact") {
    const contacts = selectedClient?.contacts ?? [];
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-full bg-gray-50 p-8">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => setStep("client")} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Who is the approver?</h1>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedClient?.name}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="space-y-1 mb-4">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                      selectedContactId === contact.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                      {contact.isMain && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Star size={10} className="fill-amber-500 text-amber-500" />
                          Main
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-5">{contact.email}</p>
                  </button>
                ))}
              </div>

              {/* Add new contact inline */}
              {showAddContact ? (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-600">New contact</p>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Full name *"
                    autoFocus
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="Email *"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="tel"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {newContactError && <p className="text-xs text-red-600">{newContactError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAddNewContact}
                      disabled={creatingContact}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creatingContact ? "Adding..." : "Add contact"}
                    </button>
                    <button onClick={() => { setShowAddContact(false); setNewContactError(""); }} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddContact(true)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={14} />
                  Add a new contact
                </button>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleSelectContact}
                disabled={!selectedContactId}
                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Step 3: Editor ────────────────────────────────────────────────────────────
  if (!document) {
    return <Shell><div className="flex items-center justify-center h-full"><p className="text-gray-500">Loading...</p></div></Shell>;
  }

  const activeContact = selectedClient?.contacts.find((c) => c.id === selectedContactId);

  return (
    <Shell>
      <div className="flex min-h-full">
        <div className="flex-1 flex flex-col min-h-full">
          <div className="px-8 py-5 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep("contact")} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
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

            {/* Client + contact summary */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                <Building2 size={13} className="text-gray-400 shrink-0" />
                <span className="text-sm font-medium text-gray-700">{clientName}</span>
                {activeContact && (
                  <>
                    <span className="text-gray-300">·</span>
                    <User size={12} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-600">{activeContact.name}</span>
                    <span className="text-sm text-gray-400">{activeContact.email}</span>
                  </>
                )}
                <button onClick={() => setStep("contact")} className="text-xs text-blue-600 hover:text-blue-700 ml-1">
                  Change
                </button>
              </div>
            </div>

            {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
          </div>

          <div className="flex flex-1 overflow-hidden bg-gray-50">
            <ProposalEditor initialDocument={document} onUpdate={handleEditorUpdate} />
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
