"use client";

import { Shell } from "@/components/ui/Shell";
import { useState, useEffect, useCallback } from "react";
import { UserPlus, Trash2, Shield, Eye, Edit3 } from "lucide-react";
import type { AppRole } from "@/lib/roles";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/roles";

interface TeamMember {
  id:        string;
  firstName: string | null;
  lastName:  string | null;
  email:     string;
  imageUrl:  string;
  role:      AppRole;
  createdAt: number;
}

const ROLE_ICONS: Record<AppRole, React.ReactNode> = {
  admin:  <Shield size={14} className="text-purple-500" />,
  member: <Edit3  size={14} className="text-blue-500" />,
  viewer: <Eye    size={14} className="text-gray-400" />,
};

export function TeamClient() {
  const [members, setMembers]     = useState<TeamMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<AppRole>("member");
  const [inviting, setInviting]   = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res  = await fetch("/api/team");
      const data = await res.json() as TeamMember[] | { error: string };
      if (!res.ok) {
        setApiError((data as { error: string }).error ?? `Error ${res.status}`);
        return;
      }
      const members = data as TeamMember[];
      setMembers(members.sort((a, b) => a.createdAt - b.createdAt));
    } catch (err) {
      setApiError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (userId: string, role: AppRole) => {
    await fetch(`/api/team/${userId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role }),
    });
    await loadMembers();
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the team? This cannot be undone.`)) return;
    await fetch(`/api/team/${userId}`, { method: "DELETE" });
    await loadMembers();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/team", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ emailAddress: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        setInviteMsg({ type: "success", text: `Invitation sent to ${inviteEmail.trim()}` });
        setInviteEmail("");
      } else {
        const err = await res.json() as { error: string };
        setInviteMsg({ type: "error", text: err.error ?? "Failed to send invitation" });
      }
    } catch {
      setInviteMsg({ type: "error", text: "Failed to send invitation" });
    } finally {
      setInviting(false);
    }
  };

  const displayName = (m: TeamMember) =>
    [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;

  return (
    <Shell>
      <div className="px-8 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who has access to the proposals app and what they can do.
          </p>
        </div>

        {/* Invite form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserPlus size={16} className="text-gray-500" />
            Invite a team member
          </h2>
          <form onSubmit={(e) => { void handleInvite(e); }} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AppRole)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {(["admin", "member", "viewer"] as AppRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {inviting ? "Sending..." : "Send invite"}
            </button>
          </form>
          {inviteMsg && (
            <p className={`mt-3 text-sm ${inviteMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {inviteMsg.text}
            </p>
          )}

          {/* Role descriptions */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["admin", "member", "viewer"] as AppRole[]).map((r) => (
              <div key={r} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="mt-0.5">{ROLE_ICONS[r]}</span>
                <div>
                  <p className="text-xs font-medium text-gray-700">{ROLE_LABELS[r]}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Member list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Current team members</h2>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">Loading...</div>
          ) : apiError ? (
            <div className="px-6 py-8 text-center text-sm text-red-500">
              Failed to load team: {apiError}
            </div>
          ) : members.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              No team members found.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-4 px-6 py-4">
                  {/* Avatar */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.imageUrl}
                    alt={displayName(m)}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName(m)}</p>
                    <p className="text-xs text-gray-500 truncate">{m.email}</p>
                  </div>
                  {/* Role selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="flex-shrink-0">{ROLE_ICONS[m.role]}</span>
                    <select
                      value={m.role}
                      onChange={(e) => { void handleRoleChange(m.id, e.target.value as AppRole); }}
                      className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {(["admin", "member", "viewer"] as AppRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                  {/* Remove */}
                  <button
                    onClick={() => { void handleRemove(m.id, displayName(m)); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded"
                    title="Remove from team"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}
