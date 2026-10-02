import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initialNewProposalStep,
  pageOutline,
  prepareProposalFromTemplate,
  stepAfterStart,
  summarizeTemplate,
} from "./proposal-start.ts";

const websiteTemplate = {
  version: 2 as const,
  description: "A proposal for a marketing site.",
  pages: [
    {
      id: "overview",
      name: "Overview",
      blocks: [
        {
          type: "richText" as const,
          id: "intro",
          content: {
            type: "doc",
            content: [
              { type: "heading", content: [{ type: "text", text: "Website rebuild" }] },
              { type: "paragraph", content: [{ type: "text", text: "A new site for Acme." }] },
            ],
          },
        },
      ],
    },
    { id: "fees", name: "Fees", blocks: [] },
    { id: "terms", name: "Terms", blocks: [] },
  ],
};

describe("new proposal start step", () => {
  it("starts on the chooser, even when a client is already selected", () => {
    assert.equal(initialNewProposalStep({ templateId: null, clientId: null }), "start");
    assert.equal(initialNewProposalStep({ templateId: null, clientId: "client_1" }), "start");
  });

  it("skips the chooser when the URL already names a template", () => {
    assert.equal(initialNewProposalStep({ templateId: "tpl_1", clientId: null }), "client");
    assert.equal(initialNewProposalStep({ templateId: "tpl_1", clientId: "client_1" }), "contact");
  });

  it("goes to the client, or skips ahead when the client is already known", () => {
    assert.equal(stepAfterStart({ hasClient: false, contactCount: 0 }), "client");
    assert.equal(stepAfterStart({ hasClient: true, contactCount: 3 }), "contact");
    assert.equal(stepAfterStart({ hasClient: true, contactCount: 1 }), "editor");
  });
});

describe("template cards", () => {
  it("reads the description, page names, and a preview of the first page", () => {
    const summary = summarizeTemplate(websiteTemplate);
    assert.equal(summary.description, "A proposal for a marketing site.");
    assert.deepEqual(summary.pageNames, ["Overview", "Fees", "Terms"]);
    assert.equal(summary.previewTitle, "Website rebuild");
    assert.equal(summary.previewBody, "A new site for Acme.");
    assert.equal(pageOutline(summary.pageNames), "Overview · Fees · Terms");
  });

  it("leaves the description off when the template doesn't have one", () => {
    const { description, ...rest } = websiteTemplate;
    void description;
    const summary = summarizeTemplate(rest);
    assert.equal(summary.description, null);
    assert.equal(summary.previewTitle, "Website rebuild");
  });
});

describe("copying a template into a new proposal", () => {
  it("turns page navigation on when the template never chose", () => {
    const proposal = prepareProposalFromTemplate(websiteTemplate);
    assert.equal(proposal.showPageNav, true);
    assert.equal(proposal.pages[1].name, "Fees");
  });

  it("keeps an explicit page navigation choice", () => {
    const proposal = prepareProposalFromTemplate({ ...websiteTemplate, showPageNav: false });
    assert.equal(proposal.showPageNav, false);
  });

  it("copies the content so editing the proposal doesn't change the template", () => {
    const proposal = prepareProposalFromTemplate(websiteTemplate);
    proposal.pages[0].name = "Changed in the proposal";
    proposal.pages[0].blocks.push({
      type: "richText",
      id: "extra",
      content: { type: "doc", content: [] },
    });
    assert.equal(websiteTemplate.pages[0].name, "Overview");
    assert.equal(websiteTemplate.pages[0].blocks.length, 1);
  });
});
