import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linkedImageHref,
  publicButtonHref,
  publicProposalPayload,
  sanitiseProposalContent,
  type PublicProposalInput,
} from "./public-proposal.ts";

function keysDeep(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.push(key);
      keysDeep(child, found);
    }
  }
  return found;
}

const base = {
  id: "prop_1",
  title: "Website rebuild",
  clientName: "Ada",
  clientEmail: "ada@example.com",
  clientAbn: null,
  status: "SENT",
  expiresAt: null,
  invoiceNumber: null,
  totalValue: 1800,
  currency: "AUD",
  gstEnabled: true,
  roundingMode: "CENTS",
  discountType: null,
  discountValue: null,
  showDiscount: true,
  depositType: null,
  depositValue: null,
  billingCadence: "ONE_OFF",
  recurringStartMode: null,
  recurringStartDate: null,
  fixedTermMonths: null,
  paymentTerms: "NET14",
  latePaymentClause: null,
};

describe("public proposal payload", () => {
  it("leaves margin, cost, and editor notes out of the page data", () => {
    const payload = publicProposalPayload({
      ...base,
      content: {
        version: 2,
        showPageNav: true,
        createdBy: "user_secret_owner",
        internalNotes: "Staff only: do not show",
        sidebar: { logoUrl: "https://example.com/logo.png", exchangeRate: 1.6123 },
        pages: [
          {
            id: "page-1",
            name: "Investment",
            internalNotes: "Staff only: do not show",
            blocks: [
              {
                type: "richText",
                id: "text-1",
                content: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Prepared for Ada" }],
                      attrs: { margin: 37.5, cost: 19.25 },
                    },
                  ],
                },
              },
              {
                type: "pricing",
                id: "price-1",
                pricingData: {
                  sections: [{ id: "s1", name: "Design", order: 0, cost: 19.25 }],
                  items: [
                    {
                      id: "line-1",
                      sectionId: "s1",
                      type: "fixed",
                      description: "Design",
                      scopeNote: "Visible scope",
                      quantity: 1,
                      unitPrice: 1800,
                      isOptional: false,
                      clientIncluded: true,
                      gstApplicable: true,
                      discountType: null,
                      discountValue: null,
                      order: 0,
                      margin: 37.5,
                      cost: 19.25,
                      internalNotes: "Staff only: do not show",
                    },
                  ],
                },
                pricingSettings: {
                  currency: "AUD",
                  exchangeRate: 1.6123,
                  gstEnabled: true,
                  roundingMode: "CENTS",
                  optionsMode: false,
                  showDiscount: true,
                  billingCadence: "ONE_OFF",
                  paymentTerms: "NET14",
                  paymentOptionsEnabled: true,
                  paymentMonthlyAmount: 900,
                  paymentMonthlyOffered: true,
                  paymentUpfrontOffered: true,
                },
              },
            ],
          },
        ],
      },
      pricingData: {
        sections: [],
        items: [{ id: "legacy", description: "Hidden legacy", margin: 37.5, cost: 19.25, unitPrice: 50 }],
      },
      internalNotes: "Staff only: do not show",
      lostReason: "Internal loss reason",
      createdBy: "user_secret_owner",
      exchangeRate: 1.6123,
    } as PublicProposalInput);

    const serialised = JSON.stringify(payload);
    const keys = keysDeep(payload);

    assert.equal(serialised.includes("Staff only: do not show"), false);
    assert.equal(serialised.includes("Internal loss reason"), false);
    assert.equal(serialised.includes("user_secret_owner"), false);
    assert.equal(serialised.includes("37.5"), false);
    assert.equal(serialised.includes("19.25"), false);
    assert.equal(serialised.includes("1.6123"), false);
    for (const key of ["margin", "cost", "internalNotes", "lostReason", "createdBy", "exchangeRate"]) {
      assert.equal(keys.includes(key), false, key);
    }

    assert.equal(payload.pricingData, null);
    assert.match(serialised, /Prepared for Ada/);
    assert.match(serialised, /Visible scope/);
    assert.match(serialised, /"unitPrice":1800/);
    assert.match(serialised, /"paymentMonthlyAmount":900/);
    assert.equal(payload.title, "Website rebuild");
    assert.equal(payload.clientName, "Ada");
  });

  it("keeps a legacy pricing table and still drops margin and cost", () => {
    const payload = publicProposalPayload({
      ...base,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      pricingData: {
        sections: [{ id: "s1", name: "Build", order: 1 }],
        items: [
          {
            id: "line-1",
            description: "Build",
            unitPrice: 500,
            margin: 37.5,
            cost: 19.25,
            internalNotes: "Staff only: do not show",
          },
        ],
      },
    });

    const serialised = JSON.stringify(payload);
    assert.equal(keysDeep(payload).includes("margin"), false);
    assert.equal(keysDeep(payload).includes("cost"), false);
    assert.equal(serialised.includes("37.5"), false);
    assert.equal(serialised.includes("Staff only: do not show"), false);
    assert.match(serialised, /"description":"Build"/);
    const pricing = payload.pricingData as { items: unknown[] } | null;
    assert.equal(pricing?.items.length, 1);
  });

  it("keeps https, mailto, and tel on buttons", () => {
    assert.equal(publicButtonHref("https://example.com/a"), "https://example.com/a");
    assert.equal(publicButtonHref("mailto:ada@example.com"), "mailto:ada@example.com");
    assert.equal(publicButtonHref("tel:+61390000000"), "tel:+61390000000");
    assert.equal(publicButtonHref(" example.com/a "), "https://example.com/a");
    assert.equal(publicButtonHref("javascript:alert(1)"), null);
    assert.equal(publicButtonHref("http://example.com"), "https://example.com");
    assert.equal(publicButtonHref("HTTP://example.com/a"), "https://example.com/a");
    assert.equal(publicButtonHref("http://"), null);
    assert.equal(publicButtonHref("data:text/html,hi"), null);

    const payload = publicProposalPayload({
      ...base,
      content: {
        version: 2,
        pages: [
          {
            id: "page-1",
            name: "Start",
            blocks: [
              {
                type: "button",
                id: "bad",
                label: "Bad",
                linkType: "url",
                href: "javascript:alert(1)",
                targetPageId: "javascript:alert(1)",
              },
              {
                type: "button",
                id: "mail",
                label: "Email",
                linkType: "url",
                href: "mailto:ada@example.com",
                targetPageId: "mailto:ada@example.com",
              },
              {
                type: "button",
                id: "web",
                label: "Site",
                linkType: "url",
                href: "http://example.com/pricing",
                targetPageId: "http://example.com/pricing",
              },
            ],
          },
        ],
      },
    } as PublicProposalInput);
    const serialised = JSON.stringify(payload);
    assert.equal(serialised.includes("javascript:"), false);
    assert.equal(serialised.includes("http://"), false);
    assert.match(serialised, /mailto:ada@example.com/);
    assert.match(serialised, /https:\/\/example.com\/pricing/);
  });

  it("drops a javascript link on a linked image in the page, the editor, and stored content", () => {
    const image = {
      type: "image",
      attrs: {
        src: "https://cdn.example/photo.png",
        alt: "Photo",
        href: "javascript:alert(1)",
      },
    };
    const content = {
      version: 2,
      pages: [
        {
          id: "page-1",
          name: "Start",
          blocks: [{ type: "richText", id: "rt", content: { type: "doc", content: [image] } }],
        },
      ],
    };

    const payload = publicProposalPayload({ ...base, content } as PublicProposalInput);
    const serialised = JSON.stringify(payload);
    assert.equal(serialised.includes("javascript:"), false);
    assert.equal(serialised.includes("cdn.example/photo.png"), true);

    assert.equal(linkedImageHref("javascript:alert(1)"), null);
    assert.equal(linkedImageHref("https://example.com/photo"), "https://example.com/photo");
    assert.equal(linkedImageHref("http://example.com/photo"), "https://example.com/photo");

    const stored = sanitiseProposalContent(content);
    assert.equal(JSON.stringify(stored).includes("javascript:"), false);
    const again = sanitiseProposalContent(stored);
    assert.equal(again, stored);

    const httpImage = {
      type: "image",
      attrs: { src: "https://cdn.example/photo.png", href: "http://example.com/photo" },
    };
    const upgraded = sanitiseProposalContent(httpImage) as { attrs: { href?: string } };
    assert.equal(upgraded.attrs.href, "https://example.com/photo");
  });
});
