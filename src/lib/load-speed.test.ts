import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explicitRole } from "./roles.ts";
import {
  EDITOR_EVENT_SELECT,
  EDITOR_REVISION_SELECT,
  PROPOSAL_LIST_SELECT,
  pricingDataForClient,
} from "./proposal-payload.ts";

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

describe("list and editor payloads", () => {
  it("proposal list select omits document JSON", () => {
    const keys = Object.keys(PROPOSAL_LIST_SELECT);
    assert.equal(keys.includes("content"), false);
    assert.equal(keys.includes("pricingData"), false);
    assert.equal(keys.includes("internalNotes"), false);
  });

  it("revision and event selects stay narrow", () => {
    assert.equal("snapshot" in EDITOR_REVISION_SELECT, false);
    assert.equal("ipAddress" in EDITOR_EVENT_SELECT, false);
    assert.equal("userAgent" in EDITOR_EVENT_SELECT, false);
    assert.equal(EDITOR_EVENT_SELECT.metadata, true);
  });

  it("drops the legacy pricing column once content is a v2 document", () => {
    const image = "A".repeat(80_000);
    const content = { version: 2, pages: [] };
    const pricingData = { sections: [], items: [], image };
    assert.equal(pricingDataForClient(content, pricingData), null);
    assert.ok(pricingDataForClient({ type: "doc" }, pricingData));
  });

  it("keeps an editor history list small when snapshots stay on the server", () => {
    const image = "data:image/png;base64," + "A".repeat(200_000);
    const content = {
      version: 2,
      pages: [{ id: "p", blocks: [{ type: "image", src: image }] }],
    };
    const revisions = Array.from({ length: 20 }, (_, index) => ({
      version: index + 1,
      createdAt: "2026-10-02T00:00:00.000Z",
      createdBy: "user_123",
      snapshot: { title: "Website", content },
    }));

    const withSnapshots = bytes(revisions);
    const listOnly = bytes(
      revisions.map((revision) => ({
        version: revision.version,
        createdAt: revision.createdAt,
        createdBy: revision.createdBy,
        savedByName: "Ada Lovelace",
        summary: "",
      }))
    );

    // 20 copies of a ~200KB image is about 4MB. The history list is a few KB.
    assert.ok(withSnapshots > 3_000_000, `expected a large snapshot payload, got ${withSnapshots}`);
    assert.ok(listOnly < 5_000, `expected a small history list, got ${listOnly}`);
    assert.ok(withSnapshots / listOnly > 500);
  });
});

describe("explicit Clerk role", () => {
  it("does not treat a missing claim as member", () => {
    assert.equal(explicitRole(undefined), null);
    assert.equal(explicitRole({}), null);
    assert.equal(explicitRole({ role: "admin" }), "admin");
    assert.equal(explicitRole({ role: "viewer" }), "viewer");
    assert.equal(explicitRole({ role: "owner" }), null);
  });
});
