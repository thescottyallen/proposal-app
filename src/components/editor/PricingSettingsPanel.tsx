"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ProposalPricingSettings,
  Currency,
  BillingCadence,
  RecurringStartMode,
  PaymentTerms,
  RoundingMode,
  DiscountType,
  DepositType,
} from "@/lib/pricing-types";

interface PricingSettingsPanelProps {
  settings:          ProposalPricingSettings;
  onChange:          (settings: ProposalPricingSettings) => void;
  gstRegistered:     boolean; // from BusinessSettings — controls whether GST toggle is visible
  onFetchExchangeRate?: () => Promise<void>;
  fetchingRate?:     boolean;
}

export function PricingSettingsPanel({
  settings,
  onChange,
  gstRegistered,
  onFetchExchangeRate,
  fetchingRate = false,
}: PricingSettingsPanelProps) {
  const [open, setOpen] = useState(false);

  function update(patch: Partial<ProposalPricingSettings>) {
    onChange({ ...settings, ...patch });
  }

  const isRecurring = settings.billingCadence !== "ONE_OFF";

  return (
    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">Pricing settings</span>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>
            {settings.currency}
            {settings.gstEnabled ? " · GST" : ""}
            {settings.billingCadence !== "ONE_OFF" ? ` · ${settings.billingCadence === "MONTHLY" ? "Monthly" : "Quarterly"}` : ""}
            {settings.discountType ? " · Discount" : ""}
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 bg-white space-y-5">

          {/* Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select
                value={settings.currency}
                onChange={async e => {
                  const currency = e.target.value as Currency;
                  update({ currency });
                  // Auto-fetch exchange rate when switching to USD
                  if (currency === "USD" && onFetchExchangeRate) {
                    await onFetchExchangeRate();
                  }
                }}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rounding</label>
              <select
                value={settings.roundingMode}
                onChange={e => update({ roundingMode: e.target.value as RoundingMode })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CENTS">Show cents</option>
                <option value="DOLLAR">Nearest dollar</option>
              </select>
            </div>
          </div>

          {settings.currency === "USD" && (
            <div className="flex items-center gap-3 text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg">
              <span>
                Locked rate: 1 USD = {settings.exchangeRate.toFixed(4)} AUD
              </span>
              <button
                type="button"
                onClick={onFetchExchangeRate}
                disabled={fetchingRate}
                className="ml-auto text-blue-600 hover:underline disabled:opacity-50"
              >
                {fetchingRate ? "Fetching..." : "Refresh rate"}
              </button>
            </div>
          )}

          {/* GST — only visible if business is GST registered */}
          {gstRegistered && (
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.gstEnabled}
                  onChange={e => update({ gstEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm text-gray-700">Charge GST (10%)</p>
                  <p className="text-xs text-gray-400">Adds a GST column per line and a GST subtotal row</p>
                </div>
              </label>
            </div>
          )}

          <hr className="border-gray-100" />

          {/* Proposal-level discount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Proposal discount</label>
            <div className="flex items-center gap-2">
              <select
                value={settings.discountType ?? "none"}
                onChange={e => {
                  const val = e.target.value;
                  update({
                    discountType:  val === "none" ? null : val as DiscountType,
                    discountValue: val === "none" ? null : (settings.discountValue ?? 0),
                  });
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount</option>
              </select>
              {settings.discountType && (
                <>
                  <input
                    type="number"
                    value={settings.discountValue ?? 0}
                    onChange={e => update({ discountValue: parseFloat(e.target.value) || 0 })}
                    min={0}
                    step={settings.discountType === "percentage" ? 1 : 50}
                    className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">
                    {settings.discountType === "percentage" ? "%" : ""}
                  </span>
                  <label className="flex items-center gap-1.5 ml-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showDiscount}
                      onChange={e => update({ showDiscount: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-xs text-gray-500">Show label on client view</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Deposit */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Deposit / upfront payment</label>
            <div className="flex items-center gap-2">
              <select
                value={settings.depositType ?? "none"}
                onChange={e => {
                  const val = e.target.value;
                  update({
                    depositType:  val === "none" ? null : val as DepositType,
                    depositValue: val === "none" ? null : (settings.depositValue ?? 0),
                  });
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount</option>
              </select>
              {settings.depositType && (
                <>
                  <input
                    type="number"
                    value={settings.depositValue ?? 0}
                    onChange={e => update({ depositValue: parseFloat(e.target.value) || 0 })}
                    min={0}
                    step={settings.depositType === "percentage" ? 5 : 100}
                    className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">
                    {settings.depositType === "percentage" ? "%" : ""}
                  </span>
                </>
              )}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Billing cadence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing cadence</label>
              <select
                value={settings.billingCadence}
                onChange={e => {
                  const cadence = e.target.value as BillingCadence;
                  update({
                    billingCadence:     cadence,
                    recurringStartMode: cadence !== "ONE_OFF" ? (settings.recurringStartMode ?? "ON_ACCEPTANCE") : null,
                  });
                }}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ONE_OFF">One-off</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment terms</label>
              <select
                value={settings.paymentTerms}
                onChange={e => update({ paymentTerms: e.target.value as PaymentTerms })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="UPON_RECEIPT">Upon receipt</option>
                <option value="NET7">Net 7 days</option>
                <option value="NET14">Net 14 days</option>
                <option value="NET30">Net 30 days</option>
              </select>
            </div>
          </div>

          {/* Recurring options — only shown for monthly/quarterly */}
          {isRecurring && (
            <div className="space-y-3 pl-3 border-l-2 border-blue-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Billing starts</label>
                  <select
                    value={settings.recurringStartMode ?? "ON_ACCEPTANCE"}
                    onChange={e => update({ recurringStartMode: e.target.value as RecurringStartMode })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="IMMEDIATE">Immediately</option>
                    <option value="ON_ACCEPTANCE">On acceptance</option>
                    <option value="SPECIFIC_DATE">Specific date</option>
                  </select>
                </div>
                {settings.recurringStartMode === "SPECIFIC_DATE" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                    <input
                      type="date"
                      value={settings.recurringStartDate ?? ""}
                      onChange={e => update({ recurringStartDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contract term</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={settings.fixedTermMonths ?? ""}
                    onChange={e => update({ fixedTermMonths: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Open-ended"
                    min={1}
                    className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">months (blank = open-ended)</span>
                </div>
              </div>
            </div>
          )}

          {/* Late payment clause */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Late payment clause (optional, appears in proposal footer)</label>
            <textarea
              value={settings.latePaymentClause ?? ""}
              onChange={e => update({ latePaymentClause: e.target.value || null })}
              placeholder="e.g. Invoices unpaid after 30 days will incur a 1.5% monthly late fee."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
