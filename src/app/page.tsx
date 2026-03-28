"use client";

import { Shell } from "@/components/ui/Shell";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Eye,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { formatDate, formatCurrency, getStatusColor } from "@/lib/utils";

interface Proposal {
  id: string;
  title: string;
  clientName: string;
  status: string;
  totalValue: number | null;
  createdAt: string;
  _count: { events: number };
}

interface Stats {
  total: number;
  sent: number;
  viewed: number;
  accepted: number;
  totalValue: number;
}

export default function Dashboard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proposals")
      .then((res) => res.json())
      .then((data) => {
        setProposals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats: Stats = {
    total: proposals.length,
    sent: proposals.filter((p) => p.status === "SENT").length,
    viewed: proposals.filter((p) => p.status === "VIEWED").length,
    accepted: proposals.filter((p) => p.status === "ACCEPTED").length,
    totalValue: proposals
      .filter((p) => p.status === "ACCEPTED")
      .reduce((sum, p) => sum + (p.totalValue || 0), 0),
  };

  const recentProposals = proposals.slice(0, 5);

  return (
    <Shell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <Link
            href="/proposals/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Proposal
          </Link>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Proposals</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Eye size={20} className="text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Awaiting Response</p>
                <p className="text-2xl font-bold text-gray-900">{stats.sent + stats.viewed}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Accepted</p>
                <p className="text-2xl font-bold text-gray-900">{stats.accepted}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <TrendingUp size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Won Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalValue)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent proposals */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Recent Proposals</h2>
            <Link href="/proposals" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : recentProposals.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 mb-4">No proposals yet</p>
              <Link
                href="/proposals/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                <Plus size={16} />
                Create your first proposal
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentProposals.map((proposal) => (
                  <tr key={proposal.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/proposals/${proposal.id}/edit`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {proposal.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{proposal.clientName || "---"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(proposal.status)}`}>
                        {proposal.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 text-right">
                      {proposal.totalValue ? formatCurrency(proposal.totalValue) : "---"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right">{formatDate(proposal.createdAt)}</td>
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
