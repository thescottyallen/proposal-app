"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Search, XCircle, RotateCcw, X } from "lucide-react";
import { formatDate, formatCurrency, getStatusColor } from "@/lib/utils";

interface Proposal {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  status: string;
  totalValue: number | null;
  createdAt: string;
  _count: { events: number };
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Mark-as-lost modal state
  const [lostTarget, setLostTarget] = useState<Proposal | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [savingLost, setSavingLost] = useState(false);

  useEffect(() => {
    fetch("/api/proposals")
      .then((res) => res.json())
      .then((data) => {
        setProposals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const statuses = ["ALL", "DRAFT", "SENT", "VIEWED", "ACCEPTED", "LOST", "EXPIRED"] as const;

  const statusCounts = proposals.reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {}
  );

  const filtered = proposals.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const patchStatus = async (
    id: string,
    body: { status: string; lostReason: string | null }
  ): Promise<boolean> => {
    const res = await fetch(`/api/proposals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (!res.ok) return false;
    setProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: body.status } : p))
    );
    return true;
  };

  const confirmMarkLost = async () => {
    if (!lostTarget) return;
    setSavingLost(true);
    const ok = await patchStatus(lostTarget.id, {
      status:     "LOST",
      lostReason: lostReason.trim() || null,
    });
    setSavingLost(false);
    if (ok) {
      setLostTarget(null);
      setLostReason("");
    }
  };

  const reopen = async (proposal: Proposal) => {
    if (!confirm("Reopen this proposal? It will be set back to Draft.")) return;
    await patchStatus(proposal.id, { status: "DRAFT", lostReason: null });
  };

  return (
    <Shell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <Link
            href="/proposals/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Proposal
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-sm mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search proposals..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {statuses.map((status) => {
            const count = status === "ALL" ? proposals.length : (statusCounts[status] || 0);
            const isActive = statusFilter === status;
            const label = status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase();
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  isActive
                    ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
                <span
                  className={`text-xs ${
                    isActive ? "text-blue-500" : "text-gray-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">
                {proposals.length === 0
                  ? "No proposals yet"
                  : "No proposals match your search"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium text-right">Views</th>
                  <th className="px-5 py-3 font-medium text-right">Created</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((proposal) => (
                  <tr
                    key={proposal.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/proposals/${proposal.id}/edit`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {proposal.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <p className="text-sm text-gray-900">
                          {proposal.clientName || "---"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {proposal.clientEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          proposal.status
                        )}`}
                      >
                        {proposal.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">
                      {proposal.totalValue
                        ? formatCurrency(proposal.totalValue)
                        : "---"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">
                      {proposal._count.events}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">
                      {formatDate(proposal.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {proposal.status === "LOST" ? (
                        <button
                          onClick={() => reopen(proposal)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                        >
                          <RotateCcw size={12} />
                          Reopen
                        </button>
                      ) : proposal.status !== "ACCEPTED" ? (
                        <button
                          onClick={() => { setLostTarget(proposal); setLostReason(""); }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                        >
                          <XCircle size={12} />
                          Mark lost
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">---</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mark-as-lost modal */}
      {lostTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setLostTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-red-600" />
                <h2 className="text-sm font-semibold text-gray-900">Mark as lost</h2>
              </div>
              <button onClick={() => setLostTarget(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Mark &ldquo;{lostTarget.title}&rdquo; as lost. You can add an optional reason.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="e.g. went with a competitor, no budget, timing..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setLostTarget(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={confirmMarkLost}
                disabled={savingLost}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={14} />
                {savingLost ? "Saving..." : "Mark as lost"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
