"use client";

import { Shell } from "@/components/ui/Shell";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { roleFromMetadata } from "@/lib/roles";

interface Settings {
  businessName:             string;
  abn:                      string | null;
  gstRegistered:            boolean;
  defaultCurrency:          "AUD" | "USD";
  invoicePrefix:            string;
  invoiceSeq:               number;
  roundingMode:             "DOLLAR" | "CENTS";
  defaultAcceptanceMessage: string | null;
  acceptanceEmailSubject:   string | null;
  acceptanceEmailMessage:   string | null;
}

export function SettingsClient() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const role = roleFromMetadata(user?.publicMetadata as Record<string, unknown> | undefined);
    if (role !== "admin") router.replace("/proposals");
  }, [isLoaded, user, router]);
  const [settings, setSettings]   = useState<Settings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<string | null>(null);

  // Local editable state
  const [businessName,             setBusinessName]             = useState("");
  const [abn,                      setAbn]                      = useState("");
  const [gstRegistered,            setGstRegistered]            = useState(false);
  const [defaultCurrency,          setDefaultCurrency]          = useState<"AUD" | "USD">("AUD");
  const [invoicePrefix,            setInvoicePrefix]            = useState("INV");
  const [roundingMode,             setRoundingMode]             = useState<"DOLLAR" | "CENTS">("CENTS");
  const [defaultAcceptanceMessage, setDefaultAcceptanceMessage] = useState("");
  const [acceptanceEmailSubject,   setAcceptanceEmailSubject]   = useState("");
  const [acceptanceEmailMessage,   setAcceptanceEmailMessage]   = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setBusinessName(data.businessName ?? "");
        setAbn(data.abn ?? "");
        setGstRegistered(data.gstRegistered);
        setDefaultCurrency(data.defaultCurrency);
        setInvoicePrefix(data.invoicePrefix);
        setRoundingMode(data.roundingMode);
        setDefaultAcceptanceMessage(data.defaultAcceptanceMessage ?? "");
        setAcceptanceEmailSubject(data.acceptanceEmailSubject ?? "");
        setAcceptanceEmailMessage(data.acceptanceEmailMessage ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          businessName,
          abn:                      abn.trim() || null,
          gstRegistered,
          defaultCurrency,
          invoicePrefix:            invoicePrefix.trim() || "INV",
          roundingMode,
          defaultAcceptanceMessage: defaultAcceptanceMessage.trim() || null,
          acceptanceEmailSubject:   acceptanceEmailSubject.trim() || null,
          acceptanceEmailMessage:   acceptanceEmailMessage.trim() || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        showToast("Settings saved");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading settings...</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="px-8 py-8 max-w-2xl">
        {toast && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
            <Check size={14} />
            {toast}
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Business Settings</h1>

        {/* Business identity */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Business Identity</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="The Product Bus"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                ABN
                <span className="ml-1 text-gray-400">(required for ATO-compliant invoices over $82.50)</span>
              </label>
              <input
                type="text"
                value={abn}
                onChange={e => setAbn(e.target.value)}
                placeholder="12 345 678 901"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Tax */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tax</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={gstRegistered}
              onChange={e => setGstRegistered(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm text-gray-700">GST registered</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When enabled, a GST toggle appears on proposals. When disabled, GST is hidden entirely.
              </p>
            </div>
          </label>
        </section>

        {/* Currency & rounding */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Currency & Rounding</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Default Currency</label>
              <select
                value={defaultCurrency}
                onChange={e => setDefaultCurrency(e.target.value as "AUD" | "USD")}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rounding</label>
              <select
                value={roundingMode}
                onChange={e => setRoundingMode(e.target.value as "DOLLAR" | "CENTS")}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CENTS">Show cents (e.g. $1,234.50)</option>
                <option value="DOLLAR">Nearest dollar (e.g. $1,235)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Default acceptance message */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Default Acceptance Message</h2>
          <p className="text-xs text-gray-400 mb-4">
            This message appears above the signature field on new Acceptance blocks. You can still override
            it per-proposal in the editor.
          </p>
          <textarea
            value={defaultAcceptanceMessage}
            onChange={e => setDefaultAcceptanceMessage(e.target.value)}
            rows={4}
            placeholder="By entering your name below and clicking Accept, you confirm that you have read and agree to the terms of this proposal…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </section>

        {/* Acceptance email */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Acceptance Email</h2>
          <p className="text-xs text-gray-400 mb-4">
            Customise the confirmation email sent to your client when they accept a proposal.
            Use <code className="bg-gray-100 px-1 rounded">{"{title}"}</code> for the proposal title and{" "}
            <code className="bg-gray-100 px-1 rounded">{"{business}"}</code> for your business name.
            Leave blank to use the default wording.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subject line</label>
              <input
                type="text"
                value={acceptanceEmailSubject}
                onChange={e => setAcceptanceEmailSubject(e.target.value)}
                placeholder={`You accepted: {title}`}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email body</label>
              <textarea
                value={acceptanceEmailMessage}
                onChange={e => setAcceptanceEmailMessage(e.target.value)}
                rows={5}
                placeholder={`This confirms your acceptance of {title} from {business}. Your electronic signature has been recorded with a timestamp.`}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </Shell>
  );
}
