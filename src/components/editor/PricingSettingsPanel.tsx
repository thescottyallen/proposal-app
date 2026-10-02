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
import {
  computePaymentQuote,
  formatCurrency,
  offeredPaymentChoices,
  projectStageLine,
} from "@/lib/utils";
import { PaymentOptionsCards } from "./PaymentOptionsCards";

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
        data-testid="pricing-settings-toggle"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">Pricing settings</span>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>
            {settings.currency}
            {settings.optionsMode ? " · Options" : ""}
            {settings.paymentOptionsEnabled ? " · Payment options" : ""}
            {settings.gstEnabled ? " · GST" : ""}
            {settings.billingCadence !== "ONE_OFF" ? ` · ${settings.billingCadence === "MONTHLY" ? "Monthly" : "Quarterly"}` : ""}
            {settings.discountType ? " · Discount" : ""}
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 bg-white space-y-5">

          {/* Options mode — present this block's lines as choose-one alternatives */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.optionsMode}
                onChange={e => update({
                  optionsMode: e.target.checked,
                  ...(e.target.checked ? { paymentOptionsEnabled: false } : {}),
                })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm text-gray-700">Client chooses one line (options)</p>
                <p className="text-xs text-gray-400">Shows each line as a choose-one option with a radio button. No total is shown until the client picks one.</p>
              </div>
            </label>
          </div>

          <div id="payment-options-setting">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                data-testid="payment-options-toggle"
                checked={settings.paymentOptionsEnabled === true}
                onChange={e => {
                  const on = e.target.checked;
                  update({
                    paymentOptionsEnabled: on,
                    ...(on ? {
                      optionsMode: false,
                      paymentMonthlyAmount: settings.paymentMonthlyAmount ?? 0,
                      paymentMinimumMonths: settings.paymentMinimumMonths ?? 3,
                      paymentUpfrontDiscountType: settings.paymentUpfrontDiscountType ?? "percentage",
                      paymentUpfrontDiscountValue: settings.paymentUpfrontDiscountValue ?? 0,
                    } : {}),
                  });
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm text-gray-700">Payment options</p>
                <p className="text-xs text-gray-400">Offer a monthly payment, an upfront payment, a project fee, or a mix of those. Line items stay saved. Turn this off and they come back.</p>
              </div>
            </label>
            {settings.paymentOptionsEnabled && (
              <PaymentOptionsFields settings={settings} update={update} />
            )}
          </div>

          <hr className="border-gray-100" />

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
                  <p className="text-xs text-gray-400">Line totals stay ex GST. GST is added once in the summary.</p>
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

function PaymentOptionsFields({
  settings,
  update,
}: {
  settings: ProposalPricingSettings;
  update: (patch: Partial<ProposalPricingSettings>) => void;
}) {
  const quote = computePaymentQuote(settings);
  const offered = offeredPaymentChoices(settings);
  const fmt = (amount: number) => formatCurrency(amount, settings.currency, settings.roundingMode);
  const discountLabel = settings.paymentUpfrontDiscountType === "fixed"
    ? `less ${fmt(settings.paymentUpfrontDiscountValue ?? 0)}`
    : settings.paymentUpfrontDiscountType === "percentage" && (settings.paymentUpfrontDiscountValue ?? 0) > 0
      ? `less ${settings.paymentUpfrontDiscountValue}%`
      : null;
  const percentSum = (settings.paymentProjectStage1Percent ?? 50) + (settings.paymentProjectStage2Percent ?? 50);
  const splitValid = quote.projectPercentsValid;

  const setOffered = (kind: "monthly" | "upfront" | "project", on: boolean) => {
    const monthly = kind === "monthly" ? on : settings.paymentMonthlyOffered !== false;
    const upfront = kind === "upfront" ? on : settings.paymentUpfrontOffered !== false;
    const project = kind === "project" ? on : settings.paymentProjectOffered === true;
    if (!monthly && !upfront && !project) return;
    if (kind === "monthly") {
      update({ paymentMonthlyOffered: on });
      return;
    }
    if (kind === "upfront") {
      update({ paymentUpfrontOffered: on });
      return;
    }
    update({
      paymentProjectOffered: on,
      ...(on ? {
        paymentProjectFee: settings.paymentProjectFee ?? 0,
        paymentProjectStage1Percent: settings.paymentProjectStage1Percent ?? 50,
        paymentProjectStage2Percent: settings.paymentProjectStage2Percent ?? 50,
      } : {}),
    });
  };

  return (
    <div className="mt-4 ml-6 space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Offer</p>
        <div className="flex flex-wrap gap-4">
          <OfferToggle
            label="Monthly"
            testId="payment-offer-monthly"
            checked={offered.includes("monthly")}
            onChange={(on) => setOffered("monthly", on)}
          />
          <OfferToggle
            label="Upfront"
            testId="payment-offer-upfront"
            checked={offered.includes("upfront")}
            onChange={(on) => setOffered("upfront", on)}
          />
          <OfferToggle
            label="Project fee"
            testId="payment-offer-project"
            checked={offered.includes("project")}
            onChange={(on) => setOffered("project", on)}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">Keep at least one on. If Project fee is the only one, the client doesn&apos;t have to choose.</p>
      </div>

      {offered.includes("monthly") && (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Monthly amount</label>
          <input
            type="number"
            data-testid="payment-monthly-amount"
            value={settings.paymentMonthlyAmount ?? 0}
            onChange={e => update({ paymentMonthlyAmount: parseFloat(e.target.value) || 0 })}
            min={0}
            step={50}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Minimum months</label>
          <input
            type="number"
            data-testid="payment-minimum-months"
            value={settings.paymentMinimumMonths ?? 3}
            onChange={e => update({ paymentMinimumMonths: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            min={1}
            step={1}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      )}

      {offered.includes("upfront") && (
      <>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Upfront discount</label>
        <div className="flex items-center gap-2">
          <select
            data-testid="payment-discount-type"
            value={settings.paymentUpfrontDiscountType ?? "none"}
            onChange={e => {
              const val = e.target.value;
              update({
                paymentUpfrontDiscountType: val === "none" ? null : val as DiscountType,
                paymentUpfrontDiscountValue: val === "none" ? null : (settings.paymentUpfrontDiscountValue ?? 0),
              });
            }}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="none">None</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount</option>
          </select>
          {settings.paymentUpfrontDiscountType && (
            <>
              <input
                type="number"
                data-testid="payment-discount-value"
                value={settings.paymentUpfrontDiscountValue ?? 0}
                onChange={e => update({ paymentUpfrontDiscountValue: parseFloat(e.target.value) || 0 })}
                min={0}
                step={settings.paymentUpfrontDiscountType === "percentage" ? 1 : 50}
                className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-400">
                {settings.paymentUpfrontDiscountType === "percentage" ? "%" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500" data-testid="payment-calculated-upfront">
        {discountLabel
          ? `${fmt(quote.monthlyAmount)} × ${quote.minimumMonths} = ${fmt(quote.monthsTotal)}, ${discountLabel} = ${fmt(quote.calculatedUpfront)}.`
          : `${fmt(quote.monthlyAmount)} × ${quote.minimumMonths} = ${fmt(quote.calculatedUpfront)}.`}
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Upfront price</label>
        <input
          type="number"
          data-testid="payment-upfront-override"
          value={settings.paymentUpfrontOverride ?? ""}
          onChange={e => {
            const raw = e.target.value;
            update({ paymentUpfrontOverride: raw === "" ? null : (parseFloat(raw) || 0) });
          }}
          min={0}
          step={1}
          placeholder="Use the calculated price"
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Leave this blank to use the calculated price, or type a round number.</p>
      </div>
      </>
      )}

      {offered.includes("project") && (
        <div className="space-y-3" data-testid="payment-project-fields">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Total fee (ex GST)</label>
            <input
              type="number"
              data-testid="payment-project-fee"
              value={settings.paymentProjectFee ?? 0}
              onChange={e => update({ paymentProjectFee: parseFloat(e.target.value) || 0 })}
              min={0}
              step={100}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-gray-500">Split the fee into two stages. The percentages need to add up to 100.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StageFields
              title="First stage"
              percentTestId="payment-project-stage-1-percent"
              labelTestId="payment-project-stage-1-label"
              percent={settings.paymentProjectStage1Percent ?? 50}
              label={settings.paymentProjectStage1Label ?? ""}
              labelPlaceholder="On commencement"
              onPercent={value => update({ paymentProjectStage1Percent: value })}
              onLabel={value => update({ paymentProjectStage1Label: value || null })}
            />
            <StageFields
              title="Second stage"
              percentTestId="payment-project-stage-2-percent"
              labelTestId="payment-project-stage-2-label"
              percent={settings.paymentProjectStage2Percent ?? 50}
              label={settings.paymentProjectStage2Label ?? ""}
              labelPlaceholder="On completion"
              onPercent={value => update({ paymentProjectStage2Percent: value })}
              onLabel={value => update({ paymentProjectStage2Label: value || null })}
            />
          </div>
          {splitValid ? (
            <ul className="text-xs text-gray-600 space-y-1" data-testid="payment-project-stage-preview">
              {quote.projectStages.map((stage) => (
                <li key={stage.label}>{projectStageLine(stage, settings.gstEnabled, fmt)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600" data-testid="payment-project-split-error">
              These percentages add up to {percentSum}. They need to add up to 100.
            </p>
          )}
          <IncludedField
            label="What's included (project fee)"
            testId="payment-project-included"
            value={settings.paymentProjectIncluded ?? ""}
            onChange={value => update({ paymentProjectIncluded: value || null })}
          />
        </div>
      )}

      {(offered.includes("monthly") || offered.includes("upfront")) && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offered.includes("monthly") && (
          <IncludedField
            label="What's included (monthly)"
            testId="payment-monthly-included"
            value={settings.paymentMonthlyIncluded ?? ""}
            onChange={value => update({ paymentMonthlyIncluded: value || null })}
          />
        )}
        {offered.includes("upfront") && (
          <IncludedField
            label="What's included (upfront)"
            testId="payment-upfront-included"
            value={settings.paymentUpfrontIncluded ?? ""}
            onChange={value => update({ paymentUpfrontIncluded: value || null })}
          />
        )}
      </div>
      )}

      <PaymentOptionsCards settings={settings} />
    </div>
  );
}

function OfferToggle({
  label,
  testId,
  checked,
  onChange,
}: {
  label: string;
  testId: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      {label}
    </label>
  );
}

function StageFields({
  title,
  percentTestId,
  labelTestId,
  percent,
  label,
  labelPlaceholder,
  onPercent,
  onLabel,
}: {
  title: string;
  percentTestId: string;
  labelTestId: string;
  percent: number;
  label: string;
  labelPlaceholder: string;
  onPercent: (value: number) => void;
  onLabel: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{title}</p>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          data-testid={percentTestId}
          value={percent}
          onChange={e => onPercent(parseFloat(e.target.value) || 0)}
          min={0}
          max={100}
          step={1}
          className="w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">%</span>
      </div>
      <input
        type="text"
        data-testid={labelTestId}
        value={label}
        onChange={e => onLabel(e.target.value)}
        placeholder={labelPlaceholder}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function IncludedField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea
        data-testid={testId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Weekly sessions, dashboard access, between-session support"
        rows={2}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <p className="text-xs text-gray-400 mt-1">Optional. Leave it blank and nothing appears under this choice.</p>
    </div>
  );
}
