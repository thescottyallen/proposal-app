"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Trash2, Plus, MapPin,
  Star, X, Check, Phone, Mail,
} from "lucide-react";
import { formatDate, formatCurrency, getStatusColor } from "@/lib/utils";

interface Contact {
  id:        string;
  name:      string;
  email:     string;
  phone:     string | null;
  isMain:    boolean;
  createdAt: string;
}

interface ClientProposal {
  id:         string;
  title:      string;
  status:     string;
  totalValue: number | null;
  createdAt:  string;
}

interface Client {
  id:        string;
  name:      string;
  abn:       string | null;
  address:   string | null;
  notes:     string | null;
  createdAt: string;
  contacts:  Contact[];
  proposals: ClientProposal[];
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [client, setClient]   = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<string | null>(null);

  // Company fields
  const [name, setName]       = useState("");
  const [abn, setAbn]         = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes]     = useState("");

  // Add contact form
  const [showAddContact, setShowAddContact]   = useState(false);
  const [newContactName, setNewContactName]   = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [addContactError, setAddContactError] = useState("");
  const [addingContact, setAddingContact]     = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const reload = () => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then((data: Client) => {
        setClient(data);
        setName(data.name);
        setAbn(data.abn ?? "");
        setAddress(data.address ?? "");
        setNotes(data.notes ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/clients/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, abn, address, notes }),
    });
    setSaving(false);
    showToast("Saved");
  };

  const handleDelete = async () => {
    if (!confirm("Delete this client? Their proposals will not be deleted.")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    router.push("/clients");
  };

  // ── Contacts ──────────────────────────────────────────────────────────────────

  const handleAddContact = async () => {
    setAddContactError("");
    if (!newContactName.trim() || !newContactEmail.trim() || !newContactEmail.includes("@")) {
      setAddContactError("Name and a valid email are required.");
      return;
    }
    setAddingContact(true);
    const res = await fetch(`/api/clients/${id}/contacts`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newContactName, email: newContactEmail, phone: newContactPhone || undefined }),
    });
    setAddingContact(false);
    if (!res.ok) {
      const data = await res.json();
      setAddContactError(data.error || "Failed to add contact.");
      return;
    }
    setNewContactName(""); setNewContactEmail(""); setNewContactPhone("");
    setShowAddContact(false);
    reload();
    showToast("Contact added");
  };

  const handleSetMain = async (contactId: string) => {
    await fetch(`/api/clients/${id}/contacts/${contactId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isMain: true }),
    });
    reload();
    showToast("Main contact updated");
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Remove this contact?")) return;
    const res = await fetch(`/api/clients/${id}/contacts/${contactId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to remove contact.");
      return;
    }
    reload();
    showToast("Contact removed");
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const totalProposals = client?.proposals.length ?? 0;
  const totalValue     = client?.proposals.reduce((s, p) => s + (p.totalValue ?? 0), 0) ?? 0;
  const acceptedCount  = client?.proposals.filter((p) => p.status === "ACCEPTED").length ?? 0;

  if (loading) {
    return <Shell><div className="flex items-center justify-center h-full"><p className="text-gray-500">Loading...</p></div></Shell>;
  }
  if (!client) {
    return <Shell><div className="flex items-center justify-center h-full"><p className="text-gray-500">Client not found</p></div></Shell>;
  }

  return (
    <Shell>
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          <Check size={14} />
          {toast}
        </div>
      )}

      <div className="px-8 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/clients" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
              <p className="text-sm text-gray-500">Client since {formatDate(client.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save"}
            </button>
            <Link
              href={`/proposals/new?clientId=${id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              New Proposal
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Proposals", value: totalProposals },
            { label: "Total Value",     value: formatCurrency(totalValue) },
            { label: "Accepted",        value: acceptedCount },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Company details */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Company Details</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Company name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ABN</label>
              <input
                type="text"
                value={abn}
                onChange={(e) => setAbn(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Address</label>
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optional"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Internal notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for your reference only..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Contacts</h3>
            <button
              onClick={() => setShowAddContact(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
            >
              <Plus size={12} />
              Add Contact
            </button>
          </div>

          {showAddContact && (
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Full name *"
                  autoFocus
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="Email *"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                />
              </div>
              {addContactError && <p className="text-xs text-red-600 mb-2">{addContactError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleAddContact}
                  disabled={addingContact}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingContact ? "Adding..." : "Add"}
                </button>
                <button
                  onClick={() => { setShowAddContact(false); setAddContactError(""); }}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {client.contacts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-500">No contacts yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {client.contacts.map((contact) => (
                <li key={contact.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                      {contact.isMain && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                          <Star size={10} className="fill-amber-500 text-amber-500" />
                          Main contact
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Mail size={11} />
                        {contact.email}
                      </span>
                      {contact.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={11} />
                          {contact.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!contact.isMain && (
                      <button
                        onClick={() => handleSetMain(contact.id)}
                        title="Make main contact"
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors"
                      >
                        <Star size={11} />
                        Make main
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      title="Remove contact"
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Proposal history */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Proposal History</h3>
            <Link href={`/proposals/new?clientId=${id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              + New Proposal
            </Link>
          </div>
          {client.proposals.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">No proposals yet.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {client.proposals.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/proposals/${p.id}/edit`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">
                      {p.totalValue ? formatCurrency(p.totalValue) : "---"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
          >
            <Trash2 size={12} />
            Delete Client
          </button>
        </div>
      </div>
    </Shell>
  );
}
