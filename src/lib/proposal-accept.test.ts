import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALREADY_ACCEPTED_ERROR,
  CLIENT_ABN_MAX,
  SIGNER_NAME_MAX,
  acceptanceGuard,
  acceptanceUpdateFilter,
  expiryUpdateWhere,
  parseClientAbn,
  parseSignerName,
  settleAcceptance,
  statusAfterUpdate,
  viewedUpdateWhere,
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

  it("only marks a sent proposal as viewed, and only expires the status just read", () => {
    assert.deepEqual(viewedUpdateWhere("prop_1"), { id: "prop_1", status: "SENT" });
    assert.deepEqual(expiryUpdateWhere("prop_1", "VIEWED"), { id: "prop_1", status: "VIEWED" });
    assert.equal(
      statusAfterUpdate({ updatedCount: 0, previousStatus: "ACCEPTED", nextStatus: "VIEWED" }),
      "ACCEPTED",
    );
    assert.equal(
      statusAfterUpdate({ updatedCount: 1, previousStatus: "SENT", nextStatus: "EXPIRED" }),
      "EXPIRED",
    );
  });

  it("requires a signer name and an ABN to be short text", () => {
    assert.equal(parseSignerName("  Ada Chen  ").ok, true);
    const name = parseSignerName("  Ada Chen  ");
    if (name.ok) assert.equal(name.signerName, "Ada Chen");

    assert.equal(parseSignerName(12).ok, false);
    assert.equal(parseSignerName("   ").ok, false);
    assert.equal(parseSignerName("A".repeat(SIGNER_NAME_MAX + 1)).ok, false);
    assert.equal(parseSignerName("A".repeat(SIGNER_NAME_MAX)).ok, true);

    assert.deepEqual(parseClientAbn(null), { ok: true, clientAbn: null });
    assert.equal(parseClientAbn("").ok, false);
    assert.equal(parseClientAbn(123).ok, false);
    assert.equal(parseClientAbn("1".repeat(CLIENT_ABN_MAX + 1)).ok, false);
    const abn = parseClientAbn("  12 345 678 901  ");
    assert.equal(abn.ok, true);
    if (abn.ok) assert.equal(abn.clientAbn, "12 345 678 901");
  });
});
