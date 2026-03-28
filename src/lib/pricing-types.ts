// ─── Pricing Data Types ───────────────────────────────────────────────────────
// These define the shape of the `pricingData` JSON column on Proposal.
// All prices are stored in the proposal's currency (AUD or USD).
// The `margin` field is stripped from any API response sent to the public route.

export type LineItemType = "fixed" | "hourly" | "day" | "retainer" | "milestone";
export type DiscountType = "percentage" | "fixed";
export type DepositType  = "percentage" | "fixed";

export interface PricingSection {
  id:    string;
  name:  string;
  order: number;
}

export interface PricingItem {
  id:             string;
  sectionId:      string | null; // null = ungrouped
  type:           LineItemType;
  description:    string;
  scopeNote:      string;        // visible on client view
  quantity:       number;
  unitPrice:      number;        // in proposal currency
  isOptional:     boolean;       // client can include/exclude
  clientIncluded: boolean;       // client's choice; true by default; updated on acceptance
  margin:         number;        // percentage, internal only — stripped before client render
  gstApplicable:  boolean;       // whether GST applies to this line (only relevant if gstEnabled)
  discountType:   DiscountType | null;
  discountValue:  number | null; // % or fixed amount
  order:          number;
}

export interface ProposalPricingData {
  sections: PricingSection[];
  items:    PricingItem[];
}

// ─── Computed totals (derived, never stored) ──────────────────────────────────

export interface LineTotal {
  itemId:        string;
  subtotal:      number; // quantity * unitPrice before discount
  discountAmount: number;
  afterDiscount: number;
  gstAmount:     number;
  total:         number; // after discount + GST
}

export interface PricingTotals {
  lines:               LineTotal[];
  sectionSubtotals:    Record<string, number>; // sectionId → subtotal (included items only)
  subtotalBeforeDiscount: number;
  proposalDiscountAmount: number;
  subtotalAfterDiscount:  number;
  gstAmount:           number;
  depositAmount:       number;
  grandTotal:          number;
}

// ─── Proposal settings types (mirror Prisma enums) ───────────────────────────

export type Currency           = "AUD" | "USD";
export type BillingCadence     = "ONE_OFF" | "MONTHLY" | "QUARTERLY";
export type RecurringStartMode = "IMMEDIATE" | "ON_ACCEPTANCE" | "SPECIFIC_DATE";
export type PaymentTerms       = "UPON_RECEIPT" | "NET7" | "NET14" | "NET30";
export type RoundingMode       = "DOLLAR" | "CENTS";

export interface ProposalPricingSettings {
  currency:           Currency;
  exchangeRate:       number;
  gstEnabled:         boolean;
  roundingMode:       RoundingMode;
  discountType:       DiscountType | null;
  discountValue:      number | null;
  showDiscount:       boolean;
  depositType:        DepositType | null;
  depositValue:       number | null;
  billingCadence:     BillingCadence;
  recurringStartMode: RecurringStartMode | null;
  recurringStartDate: string | null; // ISO date string
  fixedTermMonths:    number | null;
  paymentTerms:       PaymentTerms;
  latePaymentClause:  string | null;
}

// ─── BusinessSettings type ────────────────────────────────────────────────────

export interface BusinessSettingsData {
  businessName:    string;
  abn:             string | null;
  gstRegistered:   boolean;
  defaultCurrency: Currency;
  invoicePrefix:   string;
  invoiceSeq:      number;
  roundingMode:    RoundingMode;
}

// ─── Utility: default values ──────────────────────────────────────────────────

export function defaultPricingItem(overrides?: Partial<PricingItem>): PricingItem {
  return {
    id:             Math.random().toString(36).slice(2, 10),
    sectionId:      null,
    type:           "fixed",
    description:    "",
    scopeNote:      "",
    quantity:       1,
    unitPrice:      0,
    isOptional:     false,
    clientIncluded: true,
    margin:         0,
    gstApplicable:  true,
    discountType:   null,
    discountValue:  null,
    order:          0,
    ...overrides,
  };
}

export function defaultPricingData(): ProposalPricingData {
  return {
    sections: [],
    items:    [defaultPricingItem()],
  };
}

export function defaultPricingSettings(): ProposalPricingSettings {
  return {
    currency:           "AUD",
    exchangeRate:       1.0,
    gstEnabled:         false,
    roundingMode:       "CENTS",
    discountType:       null,
    discountValue:      null,
    showDiscount:       true,
    depositType:        null,
    depositValue:       null,
    billingCadence:     "ONE_OFF",
    recurringStartMode: null,
    recurringStartDate: null,
    fixedTermMonths:    null,
    paymentTerms:       "NET30",
    latePaymentClause:  null,
  };
}

// ─── Utility: strip client-hidden fields before sending to public route ───────

export function stripInternalFields(data: ProposalPricingData): ProposalPricingData {
  return {
    sections: data.sections,
    items: data.items.map(({ margin: _margin, ...rest }) => ({
      ...rest,
      margin: 0, // replace with 0 rather than omitting to keep type shape consistent
    })),
  };
}
