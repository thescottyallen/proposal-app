import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFirstOpen } from "./proposal-open.ts";

describe("first open notification", () => {
  it("emails the owner only for the first open", () => {
    assert.equal(isFirstOpen(0), true);
    assert.equal(isFirstOpen(1), false);
    assert.equal(isFirstOpen(2), false);
  });
});
