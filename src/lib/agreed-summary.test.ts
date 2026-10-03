import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agreedSummaryHtml,
  buildAgreedSummary,
  formatAcceptedAt,
  parseAgreedSummary,
} from "./agreed-summary.ts";
import {
  acceptanceClientEmailHtml,
  acceptanceOwnerEmailHtml,
} from "./email.ts";
import {
  defaultPricingItem,
  defaultPricingSettings,
  type ProposalPricingSettings,
} from "./pricing-types.ts";
import type { ProposalDocument } from "./proposal-document.ts";

function paymentSettings(overrides: Partial<ProposalPricingSettings> = {}): ProposalPricingSettings {
  return {
    ...defaultPricingSettings(),
    gstEnabled: true,
    currency: "AUD",
    roundingMode: "CENTS",
    paymentOptionsEnabled: true,
    paymentMonthlyAmount: 1500,
    paymentMinimumMonths: 3,
    paymentUpfrontDiscountType: "percentage",
    paymentUpfrontDiscountValue: 7,
    ...overrides,
  };
}

function docWith(settings: ProposalPricingSettings, items = [defaultPricingItem({ unitPrice: 9999 })]): ProposalDocument {
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

const acceptedAt = new Date("2026-10-02T05:58:00.000Z");

function summarise(settings: ProposalPricingSettings, items?: ReturnType<typeof defaultPricingItem>[]) {
  return buildAgreedSummary({
    doc: items ? docWith(settings, items) : docWith(settings),
    proposalTitle: "Website rebuild",
    clientName: "Jane Chen",
    acceptedAt,
    currency: "AUD",
    roundingMode: "CENTS",
  });
}

function flat(summary: ReturnType<typeof summarise>): string {
  return summary.sections
    .flatMap((section) => [section.heading, ...section.rows.map((row) => `${row.label} ${row.value ?? ""}`.trim())])
    .join("\n");
}

describe("accepted time", () => {
  it("formats the timestamp in Melbourne time", () => {
    assert.equal(formatAcceptedAt(acceptedAt), "2 October 2026 at 3:58 pm (Melbourne)");
  });
});

describe("project fee agreement", () => {
  it("records the fee, each stage, and the GST totals", () => {
    const summary = summarise(paymentSettings({
      paymentMonthlyOffered: false,
      paymentUpfrontOffered: false,
      paymentProjectOffered: true,
      paymentProjectFee: 12000,
      paymentProjectStage1Percent: 50,
      paymentProjectStage2Percent: 50,
      paymentProjectIncluded: "Discovery, build, and a handover workshop",
    }));
    const text = flat(summary);
    assert.equal(summary.proposalTitle, "Website rebuild");
    assert.equal(summary.clientName, "Jane Chen");
    assert.match(summary.acceptedAt, /2 October 2026 at 3:58 pm \(Melbourne\)/);
    assert.match(text, /Payment/);
    assert.match(text, /Project fee/);
    assert.match(text, /Fee \(ex GST\) \$12,000\.00/);
    assert.match(text, /On commencement \(50%\) \$6,000\.00 \+ GST/);
    assert.match(text, /On completion \(50%\) \$6,000\.00 \+ GST/);
    assert.match(text, /Subtotal \$12,000\.00/);
    assert.match(text, /GST \(10%\) \$1,200\.00/);
    assert.match(text, /Total \$13,200\.00/);
    assert.match(text, /What's included/);
    assert.match(text, /Discovery, build, and a handover workshop/);
    assert.doesNotMatch(text, /Pricing/);
  });

  it("leaves GST off the stage lines when GST isn't charged", () => {
    const summary = summarise(paymentSettings({
      gstEnabled: false,
      paymentMonthlyOffered: false,
      paymentUpfrontOffered: false,
      paymentProjectOffered: true,
      paymentProjectFee: 12000,
    }));
    const text = flat(summary);
    assert.match(text, /On commencement \(50%\) \$6,000\.00/);
    assert.doesNotMatch(text, /\+ GST/);
    assert.doesNotMatch(text, /GST \(10%\)/);
    assert.match(text, /Total \$12,000\.00/);
  });

  it("keeps the stored summary after the proposal fee changes", () => {
    const settings = paymentSettings({
      paymentMonthlyOffered: false,
      paymentUpfrontOffered: false,
      paymentProjectOffered: true,
      paymentProjectFee: 12000,
      paymentProjectIncluded: "Discovery, build, and a handover workshop",
    });
    const summary = summarise(settings);
    settings.paymentProjectFee = 1;
    settings.paymentProjectIncluded = "Something else";
    const text = flat(summary);
    assert.match(text, /\$12,000\.00/);
    assert.match(text, /Discovery, build, and a handover workshop/);
    assert.doesNotMatch(text, /Something else/);
    const rebuilt = summarise(settings);
    assert.match(flat(rebuilt), /Fee \(ex GST\) \$1\.00/);
  });
});

describe("monthly agreement", () => {
  it("shows the monthly amount, the minimum term, and the term total", () => {
    const summary = summarise(paymentSettings({
      paymentMonthlyIncluded: "A working session each month",
      selectedPaymentOption: "monthly",
    }));
    const text = flat(summary);
    assert.match(text, /Monthly/);
    assert.match(text, /Each month \$1,500\.00 ex GST \+ \$150\.00 GST/);
    assert.match(text, /Minimum term 3 months/);
    assert.match(text, /Over the minimum term/);
    assert.match(text, /Subtotal \$4,500\.00/);
    assert.match(text, /GST \(10%\) \$450\.00/);
    assert.match(text, /Total \$4,950\.00/);
    assert.match(text, /A working session each month/);
    assert.doesNotMatch(text, /Project fee/);
  });
});

describe("upfront agreement", () => {
  it("shows the upfront amount, the discount, and the totals", () => {
    const summary = summarise(paymentSettings({
      selectedPaymentOption: "upfront",
      paymentUpfrontIncluded: "The same engagement, paid once",
    }));
    const text = flat(summary);
    assert.match(text, /Upfront/);
    assert.match(text, /Amount \(ex GST\) \$4,185\.00/);
    assert.match(text, /Discount 7% off/);
    assert.match(text, /Subtotal \$4,185\.00/);
    assert.match(text, /GST \(10%\) \$418\.50/);
    assert.match(text, /Total \$4,603\.50/);
    assert.match(text, /The same engagement, paid once/);
  });

  it("leaves the discount off when there isn't one", () => {
    const summary = summarise(paymentSettings({
      selectedPaymentOption: "upfront",
      paymentUpfrontDiscountType: null,
      paymentUpfrontDiscountValue: null,
    }));
    const text = flat(summary);
    assert.match(text, /Amount \(ex GST\) \$4,500\.00/);
    assert.doesNotMatch(text, /Discount/);
  });

  it("shows a fixed discount as an amount off", () => {
    const summary = summarise(paymentSettings({
      selectedPaymentOption: "upfront",
      paymentUpfrontDiscountType: "fixed",
      paymentUpfrontDiscountValue: 200,
    }));
    assert.match(flat(summary), /Discount \$200\.00 off/);
    assert.match(flat(summary), /Amount \(ex GST\) \$4,300\.00/);
  });
});

describe("pricing without payment options", () => {
  it("shows subtotal, GST, and total for the lines they kept", () => {
    const summary = summarise(
      { ...defaultPricingSettings(), gstEnabled: true },
      [
        defaultPricingItem({ id: "kept", unitPrice: 1000, quantity: 1, gstApplicable: true }),
        defaultPricingItem({
          id: "dropped",
          unitPrice: 500,
          quantity: 1,
          gstApplicable: true,
          isOptional: true,
          clientIncluded: false,
        }),
      ]
    );
    const text = flat(summary);
    assert.match(text, /Pricing/);
    assert.match(text, /Subtotal \$1,000\.00/);
    assert.match(text, /GST \(10%\) \$100\.00/);
    assert.match(text, /Total \$1,100\.00/);
    assert.doesNotMatch(text, /Payment/);
    assert.doesNotMatch(text, /\$1,500\.00/);
  });
});

describe("acceptance emails", () => {
  it("puts the same agreement in the client and owner emails, and keeps the logo", () => {
    const agreed = summarise(paymentSettings({
      paymentMonthlyOffered: false,
      paymentUpfrontOffered: false,
      paymentProjectOffered: true,
      paymentProjectFee: 12000,
      paymentProjectIncluded: "Discovery <workshop>",
    }));
    const client = acceptanceClientEmailHtml({
      clientName: "Jane Chen",
      proposalTitle: "Website rebuild",
      signerName: "Jane Chen",
      businessName: "The Product Bus",
      publicUrl: "https://example.com/p/abc",
      agreed,
    });
    const owner = acceptanceOwnerEmailHtml({
      clientName: "Jane Chen",
      signerName: "Jane Chen",
      proposalTitle: "Website rebuild",
      proposalId: "prop-1",
      agreed,
    });
    for (const html of [client, owner]) {
      assert.match(html, /width="132"/);
      assert.match(html, /height="68"/);
      assert.match(html, /Website rebuild/);
      assert.match(html, /Jane Chen/);
      assert.match(html, /2 October 2026 at 3:58 pm \(Melbourne\)/);
      assert.match(html, /Project fee/);
      assert.match(html, /\$6,000\.00 \+ GST/);
      assert.match(html, /What's included/);
      assert.match(html, /Discovery &lt;workshop&gt;/);
      assert.doesNotMatch(html, /Discovery <workshop>/);
    }
    assert.match(client, /View Accepted Proposal/);
    assert.match(owner, /Signed by/);
    assert.match(owner, /View Proposal/);
  });

  it("shows a signer name and a custom note as plain text", () => {
    const agreed = summarise({ ...defaultPricingSettings(), gstEnabled: false }, [
      defaultPricingItem({ unitPrice: 1000, gstApplicable: false }),
    ]);
    const client = acceptanceClientEmailHtml({
      clientName: "Ada & Co",
      proposalTitle: 'Site "rebuild"',
      signerName: "Ada <script>",
      businessName: "Bus & Co",
      publicUrl: "https://example.com/p/abc",
      agreed,
      customMessage: "Thanks <b>Ada</b>\nSee {title} from {business}",
    });
    const owner = acceptanceOwnerEmailHtml({
      clientName: "Ada & Co",
      signerName: "Ada <script>",
      proposalTitle: 'Site "rebuild"',
      proposalId: "prop-1",
      agreed,
    });

    assert.match(client, /Hi Ada &amp; Co,/);
    assert.match(client, /Thanks &lt;b&gt;Ada&lt;\/b&gt;<br\/>See Site &quot;rebuild&quot; from Bus &amp; Co/);
    assert.doesNotMatch(client, /<script>/);
    assert.doesNotMatch(client, /<b>Ada<\/b>/);
    assert.match(owner, /Signed by: <strong>Ada &lt;script&gt;<\/strong>/);
    assert.match(owner, /Site &quot;rebuild&quot;/);
    assert.doesNotMatch(owner, /<script>/);
  });

  it("round-trips the stored summary", () => {
    const agreed = summarise({ ...defaultPricingSettings(), gstEnabled: true }, [
      defaultPricingItem({ unitPrice: 1000, gstApplicable: true }),
    ]);
    const parsed = parseAgreedSummary(JSON.parse(JSON.stringify(agreed)));
    assert.deepEqual(parsed, agreed);
    assert.equal(parseAgreedSummary(null), null);
    assert.match(agreedSummaryHtml(agreed), /Subtotal/);
  });
});
