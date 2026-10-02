import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPricingItem,
  defaultPricingSettings,
  type PricingItem,
  type ProposalPricingSettings,
} from "./pricing-types.ts";
import {
  computePaymentQuote,
  computePricingTotals,
  displayedLineAmount,
  formatCurrency,
  monthlyOptionLabel,
  paymentChoiceSnapshot,
  upfrontOptionLabel,
} from "./utils.ts";
import {
  allOptionGroupsResolved,
  allPaymentChoicesResolved,
  applyPaymentChoices,
  clearPaymentSelections,
  paymentAcceptanceRecords,
  selectPaymentOption,
  type ProposalDocument,
} from "./proposal-document.ts";

function money(amount: number) {
  return formatCurrency(amount, "AUD", "CENTS");
}

function paymentSettings(
  overrides: Partial<ProposalPricingSettings> = {}
): ProposalPricingSettings {
  return {
    ...defaultPricingSettings(),
    gstEnabled: true,
    paymentOptionsEnabled: true,
    paymentMonthlyAmount: 1500,
    paymentMinimumMonths: 3,
    paymentUpfrontDiscountType: "percentage",
    paymentUpfrontDiscountValue: 7,
    ...overrides,
  };
}

function docWith(settings: ProposalPricingSettings, items: PricingItem[] = []): ProposalDocument {
  return {
    version: 2,
    pages: [
      {
        id: "page",
        name: "Investment",
        blocks: [
          {
            type: "pricing",
            id: "price",
            pricingData: { sections: [], items },
            pricingSettings: settings,
          },
        ],
      },
    ],
  };
}

describe("ex-GST line display", () => {
  it("shows the line ex GST and keeps the charged total inclusive", () => {
    const totals = computePricingTotals(
      {
        sections: [],
        items: [defaultPricingItem({ id: "line", unitPrice: 1500, quantity: 1, gstApplicable: true })],
      },
      { ...defaultPricingSettings(), gstEnabled: true }
    );
    assert.equal(displayedLineAmount(totals.lines[0]), 1500);
    assert.equal(totals.lines[0].total, 1650);
    assert.equal(totals.subtotalAfterDiscount, 1500);
    assert.equal(totals.gstAmount, 150);
    assert.equal(totals.grandTotal, 1650);
  });

  it("breaks a chosen option into subtotal, GST, and an inclusive total", () => {
    const settings = { ...defaultPricingSettings(), optionsMode: true, gstEnabled: true };
    const items = [
      defaultPricingItem({ id: "monthly", unitPrice: 1500, clientIncluded: false, gstApplicable: true }),
      defaultPricingItem({ id: "upfront", unitPrice: 4195, clientIncluded: true, gstApplicable: true }),
    ];
    const chosen = computePricingTotals({ sections: [], items }, settings, true);
    assert.equal(chosen.hasUnresolvedOptions, false);
    assert.equal(chosen.subtotalAfterDiscount, 4195);
    assert.equal(chosen.gstAmount, 419.5);
    assert.equal(chosen.grandTotal, 4614.5);
    assert.equal(displayedLineAmount(chosen.lines[0]), 1500);
    assert.equal(chosen.lines[0].total, 1650);

    const waiting = computePricingTotals(
      {
        sections: [],
        items: items.map((item) => ({ ...item, clientIncluded: false })),
      },
      settings,
      true
    );
    assert.equal(waiting.hasUnresolvedOptions, true);
    assert.equal(waiting.grandTotal, 0);
  });
});

describe("payment options", () => {
  it("works out the upfront price and lets an override replace it", () => {
    const quote = computePaymentQuote(paymentSettings());
    assert.equal(quote.monthsTotal, 4500);
    assert.equal(quote.calculatedUpfront, 4185);
    assert.equal(quote.upfrontPrice, 4185);
    assert.equal(quote.saving, 315);

    const overridden = computePaymentQuote(paymentSettings({ paymentUpfrontOverride: 4195 }));
    assert.equal(overridden.calculatedUpfront, 4185);
    assert.equal(overridden.upfrontPrice, 4195);
    assert.equal(overridden.saving, 305);
    assert.equal(overridden.monthly.subtotal, 1500);
    assert.equal(overridden.monthly.gstAmount, 150);
    assert.equal(overridden.monthly.total, 1650);
    assert.equal(overridden.upfront.subtotal, 4195);
    assert.equal(overridden.upfront.gstAmount, 419.5);
    assert.equal(overridden.upfront.total, 4614.5);
    assert.equal(
      monthlyOptionLabel(overridden, money),
      "Monthly: $1,500.00 a month for at least 3 months"
    );
    assert.equal(
      upfrontOptionLabel(overridden, money),
      "Upfront: $4,195.00 once, saving $305.00"
    );
  });

  it("treats a fixed discount the same way as a percentage", () => {
    const quote = computePaymentQuote(paymentSettings({
      paymentUpfrontDiscountType: "fixed",
      paymentUpfrontDiscountValue: 305,
    }));
    assert.equal(quote.calculatedUpfront, 4195);
    assert.equal(quote.saving, 305);
  });

  it("charges only the chosen option, and nothing until one is chosen", () => {
    const settings = paymentSettings({ paymentUpfrontOverride: 4195 });
    const lines = {
      sections: [],
      items: [defaultPricingItem({ id: "ignored", unitPrice: 9999, gstApplicable: true })],
    };
    const waiting = computePricingTotals(lines, settings);
    assert.equal(waiting.hasUnresolvedOptions, true);
    assert.equal(waiting.grandTotal, 0);

    const upfront = computePricingTotals(lines, {
      ...settings,
      selectedPaymentOption: "upfront",
    });
    assert.equal(upfront.grandTotal, 4614.5);
    assert.equal(upfront.subtotalAfterDiscount, 4195);
    assert.equal(upfront.gstAmount, 419.5);

    const monthly = computePricingTotals(lines, {
      ...settings,
      selectedPaymentOption: "monthly",
    });
    assert.equal(monthly.grandTotal, 1650);
  });

  it("leaves a choose-one proposal alone when the new fields are missing", () => {
    const settings = { ...defaultPricingSettings(), optionsMode: true, gstEnabled: true };
    assert.equal(settings.paymentOptionsEnabled, undefined);
    const items = [
      defaultPricingItem({ id: "a", description: "Option 1", unitPrice: 1500, clientIncluded: false }),
      defaultPricingItem({ id: "b", description: "Option 2", unitPrice: 4195, clientIncluded: true }),
    ];
    const totals = computePricingTotals({ sections: [], items }, settings, true);
    assert.equal(totals.grandTotal, 4614.5);
    assert.equal(totals.hasUnresolvedOptions, false);

    const document = docWith(settings, items);
    assert.equal(allOptionGroupsResolved(document), true);
    assert.equal(allPaymentChoicesResolved(document), true);
    const untouched = clearPaymentSelections(document);
    const untouchedBlock = untouched.pages[0].blocks[0];
    assert.equal(untouchedBlock.type, "pricing");
    if (untouchedBlock.type === "pricing") {
      assert.equal(untouchedBlock.pricingSettings.selectedPaymentOption, undefined);
      assert.equal(untouchedBlock.pricingData.items[0].clientIncluded, false);
      assert.equal(untouchedBlock.pricingData.items[1].clientIncluded, true);
    }
    assert.equal(paymentAcceptanceRecords(document).length, 0);
  });

  it("stores the choice and the amounts on acceptance", () => {
    const document = docWith(paymentSettings({ paymentUpfrontOverride: 4195 }));
    assert.equal(allPaymentChoicesResolved(document), false);

    const chosen = selectPaymentOption(document, "price", "upfront");
    assert.equal(allPaymentChoicesResolved(chosen), true);
    const block = chosen.pages[0].blocks[0];
    assert.equal(block.type, "pricing");
    if (block.type !== "pricing") return;
    assert.equal(block.pricingSettings.selectedPaymentOption, "upfront");

    const [record] = paymentAcceptanceRecords(chosen);
    assert.equal(record.blockId, "price");
    assert.equal(record.option, "upfront");
    assert.equal(record.upfrontPrice, 4195);
    assert.equal(record.saving, 305);
    assert.equal(record.subtotal, 4195);
    assert.equal(record.gstAmount, 419.5);
    assert.equal(record.total, 4614.5);
    assert.equal(paymentChoiceSnapshot(block.pricingSettings)?.label, record.label);

    const cleared = clearPaymentSelections(chosen);
    assert.equal(allPaymentChoicesResolved(cleared), false);
    const applied = applyPaymentChoices(document, { price: "monthly" });
    const appliedBlock = applied.pages[0].blocks[0];
    assert.equal(appliedBlock.type, "pricing");
    if (appliedBlock.type === "pricing") {
      assert.equal(appliedBlock.pricingSettings.selectedPaymentOption, "monthly");
    }
    assert.deepEqual(applyPaymentChoices(document, { price: "nope" }), document);
  });
});
