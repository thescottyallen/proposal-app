"use client";

import type { PaymentChoice, ProposalPricingSettings } from "@/lib/pricing-types";
import {
  computePaymentQuote,
  formatCurrency,
  monthlyOptionLabel,
  paymentIncludedText,
  upfrontOptionLabel,
} from "@/lib/utils";

interface PaymentOptionsCardsProps {
  settings: ProposalPricingSettings;
  selected?: PaymentChoice | null;
  onSelect?: (choice: PaymentChoice) => void;
}

export function PaymentOptionsCards({
  settings,
  selected = null,
  onSelect,
}: PaymentOptionsCardsProps) {
  const quote = computePaymentQuote(settings);
  const fmt = (amount: number) => formatCurrency(amount, settings.currency, settings.roundingMode);
  const cards: {
    id: PaymentChoice;
    title: string;
    included: string | null;
    subtotal: number;
    gstAmount: number;
    total: number;
  }[] = [
    {
      id: "monthly",
      title: monthlyOptionLabel(quote, fmt),
      included: paymentIncludedText(settings.paymentMonthlyIncluded),
      subtotal: quote.monthly.subtotal,
      gstAmount: quote.monthly.gstAmount,
      total: quote.monthly.total,
    },
    {
      id: "upfront",
      title: upfrontOptionLabel(quote, fmt),
      included: paymentIncludedText(settings.paymentUpfrontIncluded),
      subtotal: quote.upfront.subtotal,
      gstAmount: quote.upfront.gstAmount,
      total: quote.upfront.total,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {cards.map((card) => {
        const isSelected = selected === card.id;
        const className = `w-full text-left rounded-lg border px-4 py-4 transition-colors ${
          isSelected
            ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
            : "border-gray-200 bg-white hover:border-gray-300"
        } ${onSelect ? "cursor-pointer" : ""}`;
        const body = (
          <span className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                isSelected ? "border-blue-600" : "border-gray-300"
              }`}
              aria-hidden
            >
              {isSelected && <span className="h-2 w-2 rounded-full bg-blue-600" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 leading-snug">{card.title}</span>
              {card.included && (
                <span className="mt-1 block text-sm font-normal text-gray-600 leading-snug">{card.included}</span>
              )}
              <span className="mt-3 block space-y-1">
                <AmountRow label="Subtotal" value={fmt(card.subtotal)} />
                {settings.gstEnabled && (
                  <AmountRow label="GST (10%)" value={fmt(card.gstAmount)} muted />
                )}
                <AmountRow label="Total" value={fmt(card.total)} bold />
              </span>
            </span>
          </span>
        );

        if (!onSelect) {
          return (
            <div key={card.id} className={className} data-testid={`payment-option-${card.id}`}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            aria-pressed={isSelected}
            data-testid={`payment-option-${card.id}`}
            className={className}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function AmountRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <span className={`flex items-center justify-between gap-4 ${bold ? "border-t border-gray-200 pt-1.5 mt-1.5" : ""}`}>
      <span className={muted ? "text-xs text-gray-400" : "text-sm text-gray-600"}>{label}</span>
      <span className={bold ? "text-sm font-semibold text-gray-900" : muted ? "text-xs text-gray-500" : "text-sm text-gray-700"}>
        {value}
      </span>
    </span>
  );
}
