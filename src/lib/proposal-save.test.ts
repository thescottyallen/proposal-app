import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCEPTED_STATUS_MESSAGE,
  INVALID_STATUS_MESSAGE,
  STATUS_SET_ON_ACCEPT_MESSAGE,
  acceptedFieldChange,
  acceptedStatusChange,
  buildRevisionSnapshot,
  conflictMessage,
  contentWriteResult,
  contentWriteWhere,
  evaluateProposalPatch,
  nextRevisionVersion,
  shouldOfferLocalRestore,
  summarizeProposalContent,
  type AcceptedFieldSnapshot,
  type EditorBackup,
  type RevisionSource,
} from "./proposal-save.ts";

const serverTime = "2026-10-02T00:41:00.000Z";
const loadedTime = "2026-10-02T00:30:00.000Z";

const previous: RevisionSource = {
  title: "Website rebuild",
  content: {
    version: 2,
    pages: [
      { id: "overview", name: "Overview", blocks: [{ type: "richText", id: "a", content: {} }] },
      {
        id: "fees",
        name: "Fees",
        blocks: [
          { type: "richText", id: "b", content: {} },
          { type: "pricing", id: "c", pricingData: {}, pricingSettings: {} },
        ],
      },
    ],
  },
  clientName: "Acme",
  clientEmail: "ada@acme.com",
  clientAbn: null,
  internalNotes: "Morning draft",
  expiresAt: null,
  totalValue: 12000,
  updatedAt: loadedTime,
  status: "DRAFT",
};

describe("PATCH conflict (409)", () => {
  it("rejects a content save when the server copy is newer", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: serverTime,
      baseUpdatedAt: loadedTime,
      writesContent: true,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 409);
    assert.equal(decision.body.code, "conflict");
    assert.equal(decision.body.updatedAt, serverTime);
    assert.match(decision.body.error, /another tab or by someone else/);
  });

  it("rejects a draft save the same way as a sent proposal", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: new Date(serverTime),
      baseUpdatedAt: loadedTime,
      writesContent: true,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 409);
  });

  it("allows the save when the editor loaded the current server copy", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: serverTime,
      baseUpdatedAt: serverTime,
      writesContent: true,
    });
    assert.deepEqual(decision, { ok: true, writeRevision: true });
  });

  it("allows save mine anyway, and still asks for a revision first", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: serverTime,
      baseUpdatedAt: loadedTime,
      force: true,
      writesContent: true,
    });
    assert.deepEqual(decision, { ok: true, writeRevision: true });
  });

  it("does not block a status-only update that isn't writing content", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: serverTime,
      writesContent: false,
    });
    assert.deepEqual(decision, { ok: true, writeRevision: false });
  });

  it("treats an unreadable loaded time as a conflict", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: serverTime,
      baseUpdatedAt: "not-a-date",
      writesContent: true,
    });
    assert.equal(decision.ok, false);
  });
});

describe("revision on draft save", () => {
  it("stores a revision before a draft content write", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: loadedTime,
      baseUpdatedAt: loadedTime,
      writesContent: true,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.writeRevision, true);

    const snapshot = buildRevisionSnapshot({ ...previous, status: "DRAFT" });
    assert.equal(snapshot.status, "DRAFT");
    assert.deepEqual(snapshot.content, previous.content);
    assert.equal(snapshot.title, "Website rebuild");
    assert.equal(snapshot.clientEmail, "ada@acme.com");
    assert.equal(snapshot.internalNotes, "Morning draft");
    assert.equal(snapshot.updatedAt, loadedTime);
    assert.equal(nextRevisionVersion(null), 1);
    assert.equal(nextRevisionVersion(2), 3);
  });

  it("keeps writing a revision when a sent proposal is saved", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: loadedTime,
      baseUpdatedAt: loadedTime,
      writesContent: true,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.writeRevision, true);
    const snapshot = buildRevisionSnapshot({ ...previous, status: "SENT" });
    assert.equal(snapshot.status, "SENT");
    assert.equal(snapshot.content, previous.content);
  });

  it("keeps an accepted proposal accepted", () => {
    for (const next of ["DRAFT", "SENT", "VIEWED", "LOST", "EXPIRED"]) {
      const decision = acceptedStatusChange("ACCEPTED", next);
      assert.equal(decision.ok, false);
      if (decision.ok) continue;
      assert.equal(decision.status, 409);
      assert.equal(decision.error, ACCEPTED_STATUS_MESSAGE);
      assert.match(decision.error, /Duplicate it/);
    }
    assert.equal(acceptedStatusChange("ACCEPTED", "ACCEPTED").ok, true);
    assert.equal(acceptedStatusChange("ACCEPTED", undefined).ok, true);
    assert.equal(acceptedStatusChange("SENT", "DRAFT").ok, true);
    assert.equal(acceptedStatusChange("LOST", "DRAFT").ok, true);
    const setAccepted = acceptedStatusChange("SENT", "ACCEPTED");
    assert.equal(setAccepted.ok, false);
    if (!setAccepted.ok) {
      assert.equal(setAccepted.status, 409);
      assert.equal(setAccepted.error, STATUS_SET_ON_ACCEPT_MESSAGE);
    }
  });

  it("returns 400 for a status the save route does not recognise", () => {
    for (const next of ["", "PUBLISHED", "accepted", null, 1]) {
      const decision = acceptedStatusChange("SENT", next);
      assert.equal(decision.ok, false);
      if (decision.ok) continue;
      assert.equal(decision.status, 400);
      assert.equal(decision.error, INVALID_STATUS_MESSAGE);
    }
  });

  it("refuses content, pricing, and expiry edits once a proposal is accepted", () => {
    const existing: AcceptedFieldSnapshot = {
      title: "Website rebuild",
      clientName: "Acme",
      clientEmail: "ada@acme.com",
      clientAbn: null,
      content: { version: 2, pages: [] },
      pricingData: { items: [{ id: "line-1", unitPrice: 100 }] },
      expiresAt: "2026-12-01T00:00:00.000Z",
      internalNotes: null,
      lostReason: null,
    };

    for (const patch of [
      { content: { version: 2, pages: [{ id: "page-1" }] } },
      { pricingData: { items: [{ id: "line-1", unitPrice: 999 }] } },
      { pricingSettings: { currency: "USD" } },
      { expiresAt: "2027-01-15" },
      { title: "Renamed" },
      { clientName: "Other" },
      { clientEmail: "other@acme.com" },
      { clientAbn: "12 345 678 901" },
    ]) {
      const decision = acceptedFieldChange({
        currentStatus: "ACCEPTED",
        existing,
        ...patch,
      });
      assert.equal(decision.ok, false);
      if (decision.ok) continue;
      assert.equal(decision.status, 409);
      assert.equal(decision.error, ACCEPTED_STATUS_MESSAGE);
    }

    const notes = acceptedFieldChange({
      currentStatus: "ACCEPTED",
      existing,
      title: existing.title,
      clientName: existing.clientName,
      clientEmail: existing.clientEmail,
      clientAbn: "",
      content: existing.content,
      expiresAt: "2026-12-01",
      internalNotes: "Call them Tuesday",
      lostReason: "Kept for the file",
    });
    assert.deepEqual(notes, { ok: true, internalOnly: true });

    const open = acceptedFieldChange({
      currentStatus: "SENT",
      existing,
      content: { version: 2, pages: [{ id: "page-1" }] },
      expiresAt: "2027-01-15",
    });
    assert.deepEqual(open, { ok: true, internalOnly: false });
  });

  it("blocks restoring a previous version of an accepted proposal", () => {
    const existing: AcceptedFieldSnapshot = {
      title: "Website rebuild",
      clientName: "Acme",
      clientEmail: "ada@acme.com",
      clientAbn: null,
      content: previous.content,
      pricingData: null,
      expiresAt: null,
      internalNotes: null,
      lostReason: null,
    };
    const decision = acceptedFieldChange({
      currentStatus: "ACCEPTED",
      existing,
      content: previous.content,
      restoring: true,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.status, 409);
  });

  it("treats a content write that matches no row as accepted in the meantime", () => {
    assert.deepEqual(contentWriteWhere("prop_1"), {
      id: "prop_1",
      status: { not: "ACCEPTED" },
    });
    const missed = contentWriteResult(0);
    assert.equal(missed.ok, false);
    if (!missed.ok) {
      assert.equal(missed.status, 409);
      assert.equal(missed.error, ACCEPTED_STATUS_MESSAGE);
    }
    assert.deepEqual(contentWriteResult(1), { ok: true });
  });

  it("does not write a revision for a status change with no content", () => {
    const decision = evaluateProposalPatch({
      serverUpdatedAt: loadedTime,
      writesContent: false,
    });
    assert.deepEqual(decision, { ok: true, writeRevision: false });
  });

  it("summarizes a snapshot by page and block counts", () => {
    const summary = summarizeProposalContent(previous.content);
    assert.equal(summary.pageCount, 2);
    assert.equal(summary.blockCount, 3);
    assert.equal(summary.summary, "2 pages, 3 blocks");
  });
});

describe("local backup", () => {
  const server = {
    updatedAt: "2026-10-02T00:20:00.000Z",
    title: "Website rebuild",
    clientName: "Acme",
    clientEmail: "ada@acme.com",
    clientAbn: "",
    internalNotes: "",
    expiresAt: "",
    content: previous.content,
  };

  const backup: EditorBackup = {
    savedAt: "2026-10-02T00:37:00.000Z",
    title: "Website rebuild",
    clientName: "Acme",
    clientEmail: "ada@acme.com",
    clientAbn: "",
    internalNotes: "Unsaved note",
    expiresAt: "",
    content: previous.content,
  };

  it("offers a newer local copy that differs from the server", () => {
    assert.equal(shouldOfferLocalRestore(backup, server), true);
  });

  it("stays quiet when the local copy matches the server", () => {
    assert.equal(
      shouldOfferLocalRestore({ ...backup, internalNotes: "" }, server),
      false
    );
  });

  it("stays quiet when the server copy is newer", () => {
    assert.equal(
      shouldOfferLocalRestore(backup, { ...server, updatedAt: "2026-10-02T00:45:00.000Z" }),
      false
    );
  });
});

describe("conflict copy", () => {
  it("includes the time of the other save", () => {
    const message = conflictMessage(new Date(2026, 9, 2, 10, 41));
    assert.match(message, /10:41 am/);
    assert.match(message, /Reload to see their version, or save yours over it/);
  });
});
