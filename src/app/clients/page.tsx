"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Users, Search, Trash2, Building2, User } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Contact {
  id:     string;
  name:   string;
  email:  string;
  phone:  string | null;
  isMain: boolean;
}

interface Client {
  id:        string;
  name:      string;
  abn:       string | null;
  createdAt: string;
  contacts:  Contact[];
  _count:    { proposals: number };
}

export default function ClientsPage() {
  const [clients, setClients]       = useState<Client[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [companyName, setCompanyName]   = useState("");
  const [contactName, setContactName]   = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [createError, setCreateError]   = useState("");
  const [creating, setCreating]         = useState(false);

  const loadClients = () => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadClients(); }, []);

  const handleCreate = async () => {
    setCreateError("");
    if (!companyName.trim()) { setCreateError("Company name is required."); return; }
    if (!contactName.trim() || !contactEmail.trim() || !contactEmail.includes("@")) {
      setCreateError("Contact name and a valid email are required.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/clients", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:    companyName,
        contact: { name: contactName, email: contactEmail, phone: contactPhone || undefined },
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json();
      setCreateError(data.error || "Failed to create client.");
      return;
    }
    setCompanyName(""); setContactName(""); setContactEmail(""); setContactPhone("");
    setShowCreate(false);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client? Their proposals will not be deleted.")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    loadClients();
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.contacts.some((ct) => ct.name.toLowerCase().includes(q) || ct.email.toLowerCase().includes(q))
    );
  });

  return (
    <Shell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Client
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Add Client</h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Company</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name *"
                className="w-full max-w-sm px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Main contact</label>
              <div className="grid grid-cols-3 gap-3 max-w-2xl">
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name *"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email *"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            </div>
            {createError && <p className="text-xs text-red-600 mb-3">{createError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Adding..." : "Add Client"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setCreateError(""); }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="relative max-w-sm mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients or contacts..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Users size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">{clients.length === 0 ? "No clients yet" : "No clients match your search"}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Contacts</th>
                  <th className="px-5 py-3 font-medium text-right">Proposals</th>
                  <th className="px-5 py-3 font-medium text-right">Added</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const main = client.contacts.find((c) => c.isMain) ?? client.contacts[0];
                  return (
                    <tr key={client.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/clients/${client.id}`} className="flex items-center gap-2.5 group">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Building2 size={14} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{client.name}</p>
                            {client.abn && <p className="text-xs text-gray-400">ABN {client.abn}</p>}
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {main ? (
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-700">{main.name}</span>
                            <span className="text-xs text-gray-400">{main.email}</span>
                            {client.contacts.length > 1 && (
                              <span className="ml-1 text-xs text-gray-400">+{client.contacts.length - 1} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No contacts</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600 text-right">{client._count.proposals}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 text-right">{formatDate(client.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}
