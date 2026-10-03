import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  MAX_EMAIL_RECIPIENTS,
  readProposalEmailRequest,
  recipientMetadata,
} from "./email-recipients.ts";
import { mayEmailProposal } from "./roles.ts";

function addresses(count: number, label: string): string[] {
  return Array.from({ length: count }, (_, index) => `${label}${index + 1}@example.com`);
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

describe("proposal email access", () => {
  it("allows the owner or an admin", () => {
    assert.equal(
      mayEmailProposal({ userId: "owner", role: "member", createdBy: "owner" }),
      true,
    );
    assert.equal(
      mayEmailProposal({ userId: "owner", role: "viewer", createdBy: "owner" }),
      true,
    );
    assert.equal(
      mayEmailProposal({ userId: "admin", role: "admin", createdBy: "owner" }),
      true,
    );
    assert.equal(
      mayEmailProposal({ userId: "other", role: "member", createdBy: "owner" }),
      false,
    );
    assert.equal(
      mayEmailProposal({ userId: "other", role: "viewer", createdBy: "owner" }),
      false,
    );
  });

  it("accepts five addresses on To, CC, and BCC and rejects a sixth", () => {
    const ok = readProposalEmailRequest({
      to: addresses(MAX_EMAIL_RECIPIENTS, "to"),
      cc: addresses(MAX_EMAIL_RECIPIENTS, "cc").join(", "),
      bcc: addresses(MAX_EMAIL_RECIPIENTS, "bcc"),
      message: "Plain note",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.to.length, 5);
    assert.equal(ok.cc.length, 5);
    assert.equal(ok.bcc.length, 5);

    for (const field of ["to", "cc", "bcc"] as const) {
      const body = {
        to: "one@example.com",
        [field]: addresses(MAX_EMAIL_RECIPIENTS + 1, field),
      };
      const result = readProposalEmailRequest(body);
      assert.equal(result.ok, false);
      if (result.ok) continue;
      const label = field === "to" ? "To" : field.toUpperCase();
      assert.match(result.error, new RegExp(`${label} is limited to 5 addresses`));
    }
  });

  it("rejects an invalid address and a non-text message", () => {
    const invalid = readProposalEmailRequest({ to: "not-an-email", cc: "also-bad" });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.match(invalid.error, /Invalid To email address/);

    const badCopy = readProposalEmailRequest({
      to: "one@example.com",
      bcc: "nope",
    });
    assert.equal(badCopy.ok, false);
    if (!badCopy.ok) assert.match(badCopy.error, /Invalid BCC email address/);

    const htmlMessage = readProposalEmailRequest({
      to: "one@example.com",
      message: { html: "<p>Hi</p>" },
    });
    assert.equal(htmlMessage.ok, false);
    if (!htmlMessage.ok) assert.equal(htmlMessage.error, "Message must be plain text.");

    const single = readProposalEmailRequest({ to: " one@example.com " });
    assert.equal(single.ok, true);
    if (single.ok) {
      assert.deepEqual(single.to, ["one@example.com"]);
      assert.equal(recipientMetadata(single.to, [], []).to, "one@example.com");
    }
  });

  it("does not keep an admin setup route", () => {
    const src = path.join(process.cwd(), "src");
    const setupRoute = path.join(src, "app", "api", "admin", "setup", "route.ts");
    const needle = ["api", "admin", "setup"].join("/");
    assert.equal(existsSync(setupRoute), false);
    for (const file of walk(src)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes(needle), false, file);
    }
  });
});
