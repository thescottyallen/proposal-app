import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALREADY_ACCEPTED_ERROR,
  acceptanceGuard,
  acceptanceUpdateFilter,
  settleAcceptance,
} from "./proposal-accept.ts";

describe("accepting a proposal", () => {
  it("tells a second accept that the proposal is already accepted", () => {
    const guard = acceptanceGuard("ACCEPTED");
    assert.equal(guard.ok, false);
    if (guard.ok) return;
    assert.equal(guard.status, 409);
    assert.equal(guard.error, ALREADY_ACCEPTED_ERROR);
    assert.match(guard.error, /already been accepted/);
  });

  it("only updates a proposal that is still sent or viewed", () => {
    const filter = acceptanceUpdateFilter("prop_1");
    assert.deepEqual(filter, {
      id: "prop_1",
      status: { in: ["SENT", "VIEWED"] },
    });
    assert.equal(acceptanceGuard("SENT").ok, true);
    assert.equal(acceptanceGuard("VIEWED").ok, true);
    assert.equal(acceptanceGuard("DRAFT").ok, false);
  });

  it("leaves the stored agreement unchanged when the update matches nothing", () => {
    const stored = { label: "First agreement", total: "$1,100.00" };
    const incoming = { label: "Second agreement", total: "$9,999.00" };

    assert.deepEqual(
      settleAcceptance({ updatedCount: 0, stored, incoming }),
      stored,
    );
    assert.deepEqual(
      settleAcceptance({ updatedCount: 1, stored, incoming }),
      incoming,
    );
  });
});
