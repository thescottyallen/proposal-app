"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Users, Search, Trash2, Mail, Building2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  createdAt: string;
  _count: { proposals: number };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [createError, setCreateError] = useState("");

  const loadClients = () => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => {
        setClients(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      setCreateError("Name and email are required.");
      return;
    }
    setCreateError("");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        email: newEmail,
        company: newCompany || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setCreateError(data.error || "Failed to create client.");
      return;
    }
    setNewName("");
    setNewEmail("");
    setNewCompany("");
    setShowCreate(false);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client? Their proposals will not be deleted."))
      return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    loadClients();
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  );

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
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Add Client
            </h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name *"
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email *"
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Company (optional)"
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            {createError && (
              <p className="text-xs text-red-600 mb-2">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Add Client
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateError("");
                }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Client list */}
        <div className="bg-white rounded-lg border border-gray-200">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Users size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">
                {clients.length === 0
                  ? "No clients yet"
                  : "No clients match your search"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Proposals
                  </th>
                  <th className="px-5 py-3 font-medium text-right">Added</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Mail size={12} className="text-gray-400" />
                        {client.email}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {client.company ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Building2 size={12} className="text-gray-400" />
                          {client.company}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">---</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">
                      {client._count.proposals}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">
                      {formatDate(client.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}
