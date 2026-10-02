import { v4 as uuidv4 } from "uuid";
import type {
  Currency,
  RoundingMode,
  ProposalPricingData,
  ProposalPricingSettings,
  PricingTotals,
  LineTotal,
  DiscountType,
  PaymentChoice,
} from "./pricing-types";

// ─── IDs & dates ──────────────────────────────────────────────────────────────

export function generatePublicId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 8);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

// ─── Currency formatting ──────────────────────────────────────────────────────

export function formatCurrency(
  amount:      number,
  currency:    Currency    = "AUD",
  roundingMode: RoundingMode = "CENTS"
): string {
  const rounded = roundingMode === "DOLLAR" ? Math.round(amount) : amount;
  return new Intl.NumberFormat("en-AU", {
    style:                 "currency",
    currency,
    minimumFractionDigits: roundingMode === "DOLLAR" ? 0 : 2,
    maximumFractionDigits: roundingMode === "DOLLAR" ? 0 : 2,
  }).format(rounded);
}

export function applyRounding(amount: number, mode: RoundingMode): number {
  return mode === "DOLLAR" ? Math.round(amount) : Math.round(amount * 100) / 100;
}

// ─── Exchange rate fetch (locked at proposal creation) ────────────────────────

/**
 * Fetches the current AUD/USD exchange rate from frankfurter.app.
 * Returns the number of AUD per 1 USD.
 * Called only when currency is switched to USD; AUD proposals use rate = 1.0.
 */
export async function fetchAudPerUsd(): Promise<number> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=AUD");
  if (!res.ok) throw new Error("Exchange rate fetch failed");
  const data = await res.json() as { rates: { AUD: number } };
  return data.rates.AUD;
}

// ─── Pricing calculations ─────────────────────────────────────────────────────

const GST_RATE = 0.10;

export interface PaymentSide {
  subtotal:  number; // ex GST
  gstAmount: number;
  total:     number; // subtotal + GST
}

export interface ProjectStageQuote {
  label:   string;
  percent: number;
  /** Ex-GST share of the project fee. */
  amount:  number;
}

export interface PaymentQuote {
  monthlyAmount:     number;
  minimumMonths:     number;
  monthsTotal:       number;
  calculatedUpfront: number;
  upfrontPrice:      number;
  saving:            number;
  monthly:           PaymentSide;
  upfront:           PaymentSide;
  projectFee:        number;
  /** True when the two stage percentages add up to 100. */
  projectPercentsValid: boolean;
  projectStages:     ProjectStageQuote[];
  project:           PaymentSide;
}

export interface PaymentChoiceSnapshot {
  option:             PaymentChoice;
  label:              string;
  monthlyAmount:      number;
  minimumMonths:      number;
  monthsTotal:        number;
  calculatedUpfront:  number;
  upfrontPrice:       number;
  saving:             number;
  discountType:       DiscountType | null;
  discountValue:      number | null;
  upfrontOverride:    number | null;
  /** What's included for the chosen option. Null when that field is blank. */
  included:           string | null;
  subtotal:           number;
  gstAmount:          number;
  total:              number;
  /** Set when the client chose the project fee. Null for monthly and upfront. */
  projectFee:         number | null;
  projectStages:      ProjectStageQuote[] | null;
}

/** Blank or whitespace-only copy is treated as no "what's included" line. */
export function paymentIncludedText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const PROJECT_STAGE_1_LABEL = "On commencement";
export const PROJECT_STAGE_2_LABEL = "On completion";

/** Which payment choices this block actually offers. Missing flags keep the old monthly + upfront pair. */
export function offeredPaymentChoices(settings: ProposalPricingSettings): PaymentChoice[] {
  if (settings.paymentOptionsEnabled !== true) return [];
  const offered: PaymentChoice[] = [];
  if (settings.paymentMonthlyOffered !== false) offered.push("monthly");
  if (settings.paymentUpfrontOffered !== false) offered.push("upfront");
  if (settings.paymentProjectOffered === true) offered.push("project");
  return offered;
}

export function projectStageLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

/** The choice that counts: an explicit pick, or the only option on offer. */
export function effectivePaymentChoice(settings: ProposalPricingSettings): PaymentChoice | null {
  const offered = offeredPaymentChoices(settings);
  const selected = settings.selectedPaymentOption;
  if (selected && offered.includes(selected)) return selected;
  if (offered.length === 1) return offered[0];
  return null;
}

/** Activity-log line for one accepted payment choice. */
export function describeAcceptedPaymentChoice(choice: {
  label?: string | null;
  included?: string | null;
}): string | null {
  const label = choice.label?.trim();
  if (!label) return null;
  const included = paymentIncludedText(choice.included);
  return included ? `${label} — ${included}` : label;
}

/** Line amounts shown in the editor and on the public page are ex GST. */
export function displayedLineAmount(line: Pick<LineTotal, "afterDiscount">): number {
  return line.afterDiscount;
}

function paymentSide(amount: number, gstEnabled: boolean, mode: RoundingMode): PaymentSide {
  const subtotal  = applyRounding(Math.max(0, amount), mode);
  const gstAmount = gstEnabled ? applyRounding(subtotal * GST_RATE, mode) : 0;
  return {
    subtotal,
    gstAmount,
    total: applyRounding(subtotal + gstAmount, mode),
  };
}

/**
 * Monthly amount × minimum months, then the upfront discount.
 * An override replaces the calculated upfront price. The saving is the
 * difference against paying monthly for the minimum term, ex GST.
 */
export function computePaymentQuote(settings: ProposalPricingSettings): PaymentQuote {
  const mode = settings.roundingMode ?? "CENTS";
  const monthlyAmount = applyRounding(Math.max(0, settings.paymentMonthlyAmount ?? 0), mode);
  const minimumMonths = Math.max(1, Math.floor(settings.paymentMinimumMonths ?? 1) || 1);
  const monthsTotal = applyRounding(monthlyAmount * minimumMonths, mode);

  const discountType = settings.paymentUpfrontDiscountType ?? null;
  const discountValue = settings.paymentUpfrontDiscountValue ?? null;
  let discount = 0;
  if (discountType && discountValue != null && discountValue > 0) {
    discount = discountType === "percentage"
      ? applyRounding(monthsTotal * (discountValue / 100), mode)
      : applyRounding(discountValue, mode);
  }
  discount = Math.min(discount, monthsTotal);
  const calculatedUpfront = applyRounding(Math.max(0, monthsTotal - discount), mode);
  const override = settings.paymentUpfrontOverride;
  const upfrontPrice = override != null && Number.isFinite(override)
    ? applyRounding(Math.max(0, override), mode)
    : calculatedUpfront;
  const saving = applyRounding(monthsTotal - upfrontPrice, mode);
  const projectFee = applyRounding(Math.max(0, settings.paymentProjectFee ?? 0), mode);
  const stage1Percent = settings.paymentProjectStage1Percent ?? 50;
  const stage2Percent = settings.paymentProjectStage2Percent ?? 50;
  const projectPercentsValid =
    Number.isFinite(stage1Percent) &&
    Number.isFinite(stage2Percent) &&
    stage1Percent >= 0 &&
    stage2Percent >= 0 &&
    Math.abs(stage1Percent + stage2Percent - 100) < 0.001;
  const stage1Amount = applyRounding(projectFee * (stage1Percent / 100), mode);
  const stage2Amount = applyRounding(projectFee - stage1Amount, mode);

  return {
    monthlyAmount,
    minimumMonths,
    monthsTotal,
    calculatedUpfront,
    upfrontPrice,
    saving,
    monthly: paymentSide(monthlyAmount, settings.gstEnabled, mode),
    upfront: paymentSide(upfrontPrice, settings.gstEnabled, mode),
    projectFee,
    projectPercentsValid,
    projectStages: [
      {
        label: projectStageLabel(settings.paymentProjectStage1Label, PROJECT_STAGE_1_LABEL),
        percent: stage1Percent,
        amount: stage1Amount,
      },
      {
        label: projectStageLabel(settings.paymentProjectStage2Label, PROJECT_STAGE_2_LABEL),
        percent: stage2Percent,
        amount: stage2Amount,
      },
    ],
    project: paymentSide(projectFee, settings.gstEnabled, mode),
  };
}

export function monthlyOptionLabel(
  quote: PaymentQuote,
  fmt: (amount: number) => string
): string {
  const unit = quote.minimumMonths === 1 ? "month" : "months";
  return `Monthly: ${fmt(quote.monthlyAmount)} a month for at least ${quote.minimumMonths} ${unit}`;
}

export function upfrontOptionLabel(
  quote: PaymentQuote,
  fmt: (amount: number) => string
): string {
  return `Upfront: ${fmt(quote.upfrontPrice)} once, saving ${fmt(quote.saving)}`;
}

/** "On commencement" becomes "on commencement" so it reads inside a sentence. */
export function projectStagePhrase(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** Ex-GST stage amount, with "+ GST" when GST is on. */
export function projectStageLine(
  stage: ProjectStageQuote,
  gstEnabled: boolean,
  fmt: (amount: number) => string
): string {
  const phrase = projectStagePhrase(stage.label);
  return gstEnabled
    ? `${fmt(stage.amount)} + GST ${phrase}`
    : `${fmt(stage.amount)} ${phrase}`;
}

export function projectOptionLabel(
  quote: PaymentQuote,
  gstEnabled: boolean,
  fmt: (amount: number) => string
): string {
  const stages = quote.projectStages
    .map((stage) => projectStageLine(stage, gstEnabled, fmt))
    .join(", ");
  return `Project fee: ${fmt(quote.projectFee)} (${stages})`;
}

/** Amounts recorded when a client accepts a monthly or upfront choice. */
export function paymentChoiceSnapshot(
  settings: ProposalPricingSettings
): PaymentChoiceSnapshot | null {
  if (settings.paymentOptionsEnabled !== true) return null;
  const option = effectivePaymentChoice(settings);
  if (!option) return null;
  const quote = computePaymentQuote(settings);
  if (option === "project" && !quote.projectPercentsValid) return null;
  const fmt = (amount: number) => formatCurrency(amount, settings.currency, settings.roundingMode);
  const side = option === "monthly" ? quote.monthly : option === "upfront" ? quote.upfront : quote.project;
  const includedSource = option === "monthly"
    ? settings.paymentMonthlyIncluded
    : option === "upfront"
      ? settings.paymentUpfrontIncluded
      : settings.paymentProjectIncluded;
  const label = option === "monthly"
    ? monthlyOptionLabel(quote, fmt)
    : option === "upfront"
      ? upfrontOptionLabel(quote, fmt)
      : projectOptionLabel(quote, settings.gstEnabled, fmt);
  return {
    option,
    label,
    monthlyAmount: quote.monthlyAmount,
    minimumMonths: quote.minimumMonths,
    monthsTotal: quote.monthsTotal,
    calculatedUpfront: quote.calculatedUpfront,
    upfrontPrice: quote.upfrontPrice,
    saving: quote.saving,
    discountType: settings.paymentUpfrontDiscountType ?? null,
    discountValue: settings.paymentUpfrontDiscountValue ?? null,
    upfrontOverride: settings.paymentUpfrontOverride ?? null,
    included: paymentIncludedText(includedSource),
    subtotal: side.subtotal,
    gstAmount: side.gstAmount,
    total: side.total,
    projectFee: option === "project" ? quote.projectFee : null,
    projectStages: option === "project" ? quote.projectStages : null,
  };
}

function calcLineDiscount(
  subtotal:      number,
  discountType:  DiscountType | null,
  discountValue: number | null
): number {
  if (!discountType || discountValue == null || discountValue <= 0) return 0;
  if (discountType === "percentage") return subtotal * (discountValue / 100);
  return Math.min(discountValue, subtotal); // fixed: can't exceed line subtotal
}

/**
 * Computes all totals for a proposal's pricing data + settings.
 * Only items with clientIncluded = true (or isOptional = false) count toward totals
 * when clientView = true; in the editor all items are counted.
 */
export function computePricingTotals(
  pricingData: ProposalPricingData,
  settings:    ProposalPricingSettings,
  clientView:  boolean = false
): PricingTotals {
  const mode = settings.roundingMode;

  // Per-line totals for EVERY item, so each option can show its own price even
  // when it is not the currently selected one.
  const lines: LineTotal[] = pricingData.items.map(item => {
    const subtotal      = applyRounding(item.quantity * item.unitPrice, mode);
    const discountAmount = applyRounding(calcLineDiscount(subtotal, item.discountType, item.discountValue), mode);
    const afterDiscount = applyRounding(subtotal - discountAmount, mode);
    const gstAmount     = settings.gstEnabled && item.gstApplicable
      ? applyRounding(afterDiscount * GST_RATE, mode)
      : 0;
    return {
      itemId: item.id,
      subtotal,
      discountAmount,
      afterDiscount,
      gstAmount,
      total: applyRounding(afterDiscount + gstAmount, mode),
    };
  });

  // PAYMENT OPTIONS: the client picks one offered way to pay. Until they do, this
  // block adds nothing, so a draft doesn't invent a total from every choice.
  // A block with only one option doesn't need a pick. Line items aren't charged.
  if (settings.paymentOptionsEnabled === true) {
    const quote = computePaymentQuote(settings);
    const choice = effectivePaymentChoice(settings);
    const projectBlocked = choice === "project" && !quote.projectPercentsValid;
    const side = projectBlocked
      ? null
      : choice === "monthly"
        ? quote.monthly
        : choice === "upfront"
          ? quote.upfront
          : choice === "project"
            ? quote.project
            : null;
    return {
      lines,
      sectionSubtotals: {},
      subtotalBeforeDiscount: side?.subtotal ?? 0,
      proposalDiscountAmount: 0,
      subtotalAfterDiscount:  side?.subtotal ?? 0,
      gstAmount:  side?.gstAmount ?? 0,
      depositAmount: 0,
      grandTotal: side?.total ?? 0,
      hasUnresolvedOptions: !side,
    };
  }

  // OPTIONS MODE: the block's lines are mutually-exclusive alternatives. Only the
  // line the client has selected counts, and no combined total is shown until they
  // choose (the UI keys off hasUnresolvedOptions). This is the "choose one" case
  // that stops alternative payment options being added together.
  if (settings.optionsMode) {
    const selected = pricingData.items.find(i => i.clientIncluded);
    const selLine  = selected ? lines.find(l => l.itemId === selected.id) : undefined;
    const afterDiscount = selLine?.afterDiscount ?? 0;
    const gst           = selLine?.gstAmount ?? 0;
    return {
      lines,
      sectionSubtotals: {},
      subtotalBeforeDiscount: afterDiscount,
      proposalDiscountAmount: 0,
      subtotalAfterDiscount:  afterDiscount,
      gstAmount:  gst,
      depositAmount: 0,
      grandTotal: applyRounding(afterDiscount + gst, mode),
      hasUnresolvedOptions: !selected,
    };
  }

  // NORMAL MODE: in client view, exclude optional items the client unticked; in
  // the editor everything counts.
  const countedIds = new Set<string>();
  for (const item of pricingData.items) {
    const include = clientView ? (!item.isOptional || item.clientIncluded) : true;
    if (include) countedIds.add(item.id);
  }
  const hasUnresolvedOptions = false;
  const countedLines = lines.filter(l => countedIds.has(l.itemId));

  // Section subtotals (counted items only; after line discounts, before GST)
  const sectionSubtotals: Record<string, number> = {};
  pricingData.items.forEach(item => {
    if (item.sectionId && countedIds.has(item.id)) {
      const line = lines.find(l => l.itemId === item.id);
      sectionSubtotals[item.sectionId] =
        applyRounding((sectionSubtotals[item.sectionId] ?? 0) + (line?.afterDiscount ?? 0), mode);
    }
  });

  const subtotalBeforeDiscount = applyRounding(
    countedLines.reduce((sum, l) => sum + l.afterDiscount, 0),
    mode
  );

  // Proposal-level discount
  const proposalDiscountAmount = applyRounding(
    calcLineDiscount(subtotalBeforeDiscount, settings.discountType, settings.discountValue),
    mode
  );
  const subtotalAfterDiscount = applyRounding(subtotalBeforeDiscount - proposalDiscountAmount, mode);

  // GST is applied per-line above; sum the counted lines here for the subtotal row
  const gstAmount = applyRounding(countedLines.reduce((sum, l) => sum + l.gstAmount, 0), mode);

  // Deposit
  let depositAmount = 0;
  if (settings.depositType && settings.depositValue) {
    const base = subtotalAfterDiscount + gstAmount;
    depositAmount = settings.depositType === "percentage"
      ? applyRounding(base * (settings.depositValue / 100), mode)
      : applyRounding(Math.min(settings.depositValue, base), mode);
  }

  const grandTotal = applyRounding(subtotalAfterDiscount + gstAmount, mode);

  return {
    lines,
    sectionSubtotals,
    subtotalBeforeDiscount,
    proposalDiscountAmount,
    subtotalAfterDiscount,
    gstAmount,
    depositAmount,
    grandTotal,
    hasUnresolvedOptions,
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT:    "bg-gray-100 text-gray-700",
    SENT:     "bg-blue-100 text-blue-700",
    VIEWED:   "bg-yellow-100 text-yellow-700",
    ACCEPTED: "bg-green-100 text-green-700",
    LOST:     "bg-red-100 text-red-700",
    DECLINED: "bg-red-100 text-red-700",
    EXPIRED:  "bg-gray-100 text-gray-500",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
}

export function paymentTermsLabel(terms: string): string {
  const labels: Record<string, string> = {
    UPON_RECEIPT: "Upon receipt",
    NET7:         "Net 7 days",
    NET14:        "Net 14 days",
    NET30:        "Net 30 days",
  };
  return labels[terms] || terms;
}

export function billingCadenceLabel(cadence: string): string {
  const labels: Record<string, string> = {
    ONE_OFF:   "One-off payment",
    MONTHLY:   "Monthly",
    QUARTERLY: "Quarterly",
  };
  return labels[cadence] || cadence;
}

export function formatInvoiceNumber(prefix: string, seq: number): string {
  const year = new Date().getFullYear();
  const padded = String(seq).padStart(3, "0");
  return `${prefix}-${year}-${padded}`;
}
