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
  describeAcceptedPaymentChoice,
  displayedLineAmount,
  effectivePaymentChoice,
  formatCurrency,
  monthlyOptionLabel,
  offeredPaymentChoices,
  paymentChoiceSnapshot,
  paymentIncludedText,
  projectOptionLabel,
  projectStageLine,
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
    assert.equal(record.included, null);
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

  it("keeps line items when a payment choice is recorded, and stores what's included", () => {
    const items = [
      defaultPricingItem({ id: "kept", description: "Traction Lab", unitPrice: 1500 }),
    ];
    const included = "Weekly sessions, dashboard access, between-session support";
    const document = docWith(paymentSettings({
      paymentUpfrontOverride: 4195,
      paymentMonthlyIncluded: `  ${included}  `,
      paymentUpfrontIncluded: "   ",
    }), items);

    const monthly = selectPaymentOption(document, "price", "monthly");
    const monthlyBlock = monthly.pages[0].blocks[0];
    assert.equal(monthlyBlock.type, "pricing");
    if (monthlyBlock.type !== "pricing") return;
    assert.deepEqual(monthlyBlock.pricingData.items, items);
    assert.equal(paymentIncludedText(monthlyBlock.pricingSettings.paymentMonthlyIncluded), included);
    assert.equal(paymentIncludedText(monthlyBlock.pricingSettings.paymentUpfrontIncluded), null);

    const [record] = paymentAcceptanceRecords(monthly);
    assert.equal(record.option, "monthly");
    assert.equal(record.included, included);
    assert.equal(
      describeAcceptedPaymentChoice(record),
      `${record.label} — ${included}`
    );

    const upfront = selectPaymentOption(document, "price", "upfront");
    const [upfrontRecord] = paymentAcceptanceRecords(upfront);
    assert.equal(upfrontRecord.included, null);
    assert.equal(describeAcceptedPaymentChoice(upfrontRecord), upfrontRecord.label);
    const upfrontBlock = upfront.pages[0].blocks[0];
    assert.equal(upfrontBlock.type, "pricing");
    if (upfrontBlock.type === "pricing") {
      assert.deepEqual(upfrontBlock.pricingData.items, items);
    }
  });

  it("leaves project fee off until it's turned on", () => {
    const settings = paymentSettings();
    assert.deepEqual(offeredPaymentChoices(settings), ["monthly", "upfront"]);
    assert.equal(settings.paymentProjectOffered, undefined);
    const quote = computePaymentQuote(settings);
    assert.equal(quote.projectFee, 0);
    assert.equal(quote.projectPercentsValid, true);
    assert.equal(effectivePaymentChoice(settings), null);
  });
});

describe("project fee", () => {
  const included = "Discovery, build, and a handover workshop";

  function projectSettings(
    overrides: Partial<ProposalPricingSettings> = {}
  ): ProposalPricingSettings {
    return paymentSettings({
      paymentMonthlyOffered: false,
      paymentUpfrontOffered: false,
      paymentProjectOffered: true,
      paymentProjectFee: 12000,
      paymentProjectIncluded: included,
      ...overrides,
    });
  }

  it("splits the fee and shows each stage ex GST, plus GST", () => {
    const settings = projectSettings();
    const quote = computePaymentQuote(settings);
    assert.equal(quote.projectFee, 12000);
    assert.equal(quote.project.subtotal, 12000);
    assert.equal(quote.project.gstAmount, 1200);
    assert.equal(quote.project.total, 13200);
    assert.deepEqual(
      quote.projectStages.map((stage) => stage.amount),
      [6000, 6000]
    );
    assert.equal(
      projectStageLine(quote.projectStages[0], true, money),
      "$6,000.00 + GST on commencement"
    );
    assert.equal(
      projectStageLine(quote.projectStages[1], true, money),
      "$6,000.00 + GST on completion"
    );
    assert.equal(
      projectOptionLabel(quote, true, money),
      "Project fee: $12,000.00 ($6,000.00 + GST on commencement, $6,000.00 + GST on completion)"
    );
  });

  it("uses a custom stage label and drops GST wording when GST is off", () => {
    const quote = computePaymentQuote(projectSettings({
      gstEnabled: false,
      paymentProjectStage1Label: "At kickoff",
    }));
    assert.equal(
      projectStageLine(quote.projectStages[0], false, money),
      "$6,000.00 at kickoff"
    );
  });

  it("rejects a split that doesn't add up to 100", () => {
    const settings = projectSettings({
      paymentProjectStage1Percent: 40,
      paymentProjectStage2Percent: 50,
    });
    const quote = computePaymentQuote(settings);
    assert.equal(quote.projectPercentsValid, false);
    assert.equal(paymentChoiceSnapshot(settings), null);
    assert.equal(allPaymentChoicesResolved(docWith(settings)), false);
    const totals = computePricingTotals({ sections: [], items: [] }, settings);
    assert.equal(totals.hasUnresolvedOptions, true);
    assert.equal(totals.grandTotal, 0);
  });

  it("charges a lone project fee without a separate choice, and records the stages", () => {
    const settings = projectSettings();
    const document = docWith(settings);
    assert.equal(allPaymentChoicesResolved(document), true);
    assert.equal(effectivePaymentChoice(settings), "project");

    const totals = computePricingTotals({ sections: [], items: [] }, settings);
    assert.equal(totals.subtotalAfterDiscount, 12000);
    assert.equal(totals.gstAmount, 1200);
    assert.equal(totals.grandTotal, 13200);
    assert.equal(totals.hasUnresolvedOptions, false);

    const stored = applyPaymentChoices(document, {});
    const block = stored.pages[0].blocks[0];
    assert.equal(block.type, "pricing");
    if (block.type !== "pricing") return;
    assert.equal(block.pricingSettings.selectedPaymentOption, "project");

    const [record] = paymentAcceptanceRecords(stored);
    assert.equal(record.option, "project");
    assert.equal(record.projectFee, 12000);
    assert.equal(record.subtotal, 12000);
    assert.equal(record.gstAmount, 1200);
    assert.equal(record.total, 13200);
    assert.equal(record.included, included);
    assert.deepEqual(
      record.projectStages?.map((stage) => ({ label: stage.label, amount: stage.amount })),
      [
        { label: "On commencement", amount: 6000 },
        { label: "On completion", amount: 6000 },
      ]
    );
    assert.equal(
      describeAcceptedPaymentChoice(record),
      `${record.label} — ${included}`
    );
  });

  it("sits beside monthly and upfront until the client picks one", () => {
    const settings = projectSettings({
      paymentMonthlyOffered: true,
      paymentUpfrontOffered: true,
      paymentUpfrontOverride: 4195,
    });
    assert.deepEqual(offeredPaymentChoices(settings), ["monthly", "upfront", "project"]);
    const document = docWith(settings);
    assert.equal(allPaymentChoicesResolved(document), false);
    assert.equal(computePricingTotals({ sections: [], items: [] }, settings).grandTotal, 0);

    const monthly = selectPaymentOption(document, "price", "monthly");
    const monthlyBlock = monthly.pages[0].blocks[0];
    assert.equal(monthlyBlock.type, "pricing");
    if (monthlyBlock.type !== "pricing") return;
    const monthlyRecord = paymentChoiceSnapshot(monthlyBlock.pricingSettings);
    assert.equal(monthlyRecord?.option, "monthly");
    assert.equal(monthlyRecord?.projectFee, null);
    assert.equal(monthlyRecord?.total, 1650);

    const project = selectPaymentOption(document, "price", "project");
    const [record] = paymentAcceptanceRecords(project);
    assert.equal(record.option, "project");
    assert.equal(record.projectFee, 12000);
    assert.equal(record.projectStages?.[0].amount, 6000);

    assert.equal(applyPaymentChoices(document, { price: "nope" }).pages[0].blocks[0], document.pages[0].blocks[0]);
  });

  it("gives the remainder of an uneven split to the second stage", () => {
    const quote = computePaymentQuote(projectSettings({
      paymentProjectFee: 100,
      paymentProjectStage1Percent: 33,
      paymentProjectStage2Percent: 67,
    }));
    assert.equal(quote.projectStages[0].amount, 33);
    assert.equal(quote.projectStages[1].amount, 67);
    assert.equal(quote.projectStages[0].amount + quote.projectStages[1].amount, 100);
  });
});
