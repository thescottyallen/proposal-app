"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Search } from "lucide-react";
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

  useEffect(() => {
    fetch("/api/proposals")
      .then((res) => res.json())
      .then((data) => {
        setProposals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const statuses = ["ALL", "DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] as const;

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
