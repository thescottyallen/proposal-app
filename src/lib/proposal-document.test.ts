import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultPricingSettings } from "./pricing-types.ts";
import {
  buttonLinkType,
  defaultDocument,
  migrateToDocument,
  pageIdFromHash,
  resolveButtonLink,
  showPageNavigation,
  withDefaultPageNav,
  type ButtonBlock,
  type ProposalDocument,
} from "./proposal-document.ts";

const pages = [
  { id: "overview", name: "Overview" },
  { id: "invest", name: "Investment" },
];

function button(partial: Partial<ButtonBlock> & Pick<ButtonBlock, "targetPageId">): ButtonBlock {
  return {
    type: "button",
    id: "btn",
    label: "Continue",
    ...partial,
  };
}

describe("proposal page links", () => {
  it("keeps a page link working after the page is renamed", () => {
    const block = button({ linkType: "page", targetPageId: "invest" });
    const renamed = pages.map((page) =>
      page.id === "invest" ? { ...page, name: "Fees" } : page
    );
    assert.deepEqual(resolveButtonLink(block, renamed), {
      kind: "page",
      pageId: "invest",
      pageName: "Fees",
    });
  });

  it("reports a deleted page instead of guessing another one", () => {
    assert.deepEqual(
      resolveButtonLink(button({ linkType: "page", targetPageId: "gone" }), pages),
      { kind: "missing-page", pageId: "gone" }
    );
  });

  it("treats a legacy http target as a web address", () => {
    const block = button({ targetPageId: "https://example.com/pricing" });
    assert.equal(buttonLinkType(block), "url");
    assert.deepEqual(resolveButtonLink(block, pages), {
      kind: "url",
      href: "https://example.com/pricing",
    });
  });

  it("reads a page id from the public hash", () => {
    assert.equal(pageIdFromHash("#page-invest", pages), "invest");
    assert.equal(pageIdFromHash("#missing", pages), null);
  });
});

describe("page navigation setting", () => {
  it("is on for a new proposal and off for an existing document", () => {
    assert.equal(showPageNavigation(defaultDocument()), true);

    const migrated = migrateToDocument(
      { type: "doc", content: [] },
      null,
      defaultPricingSettings()
    );
    assert.equal(migrated.showPageNav, undefined);
    assert.equal(showPageNavigation(migrated), false);

    const existing: ProposalDocument = { version: 2, pages: [] };
    assert.equal(showPageNavigation(existing), false);
    assert.equal(showPageNavigation(withDefaultPageNav(existing)), true);
    assert.equal(
      showPageNavigation(withDefaultPageNav({ ...existing, showPageNav: false })),
      false
    );
  });
});
