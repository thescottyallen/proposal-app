import { v4 as uuidv4 } from "uuid";
import type {
  Currency,
  RoundingMode,
  ProposalPricingData,
  ProposalPricingSettings,
  PricingTotals,
  LineTotal,
  DiscountType,
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
