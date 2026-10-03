import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  MAX_EMAIL_MESSAGE,
  MAX_EMAIL_RECIPIENTS,
  readProposalEmailRequest,
  recipientMetadata,
} from "./email-recipients.ts";
import {
  acceptanceClientSubject,
  acceptanceOwnerSubject,
  openNotificationHtml,
  proposalFollowUpHtml,
  proposalPreviewHtml,
  proposalSentHtml,
  singleLine,
} from "./email.ts";
import { createEmailRateLimit } from "./email-rate-limit.ts";
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
  it("allows a stored member who owns the proposal, or a stored admin", () => {
    assert.equal(
      mayEmailProposal({ userId: "owner", role: "member", createdBy: "owner" }),
      true,
    );
    assert.equal(
      mayEmailProposal({ userId: "admin", role: "admin", createdBy: "owner" }),
      true,
    );
    assert.equal(
      mayEmailProposal({ userId: "owner", role: "viewer", createdBy: "owner" }),
      false,
    );
    assert.equal(
      mayEmailProposal({ userId: "owner", role: null, createdBy: "owner" }),
      false,
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

    const longMessage = readProposalEmailRequest({
      to: "one@example.com",
      message: "a".repeat(MAX_EMAIL_MESSAGE + 1),
    });
    assert.equal(longMessage.ok, false);

    const single = readProposalEmailRequest({ to: " one@example.com " });
    assert.equal(single.ok, true);
    if (single.ok) {
      assert.deepEqual(single.to, ["one@example.com"]);
      assert.equal(recipientMetadata(single.to, [], []).to, "one@example.com");
    }
  });

  it("keeps titles and sender names as plain text in proposal emails", () => {
    const title = "Site <b>\r\nrebuild";
    const sender = "Ada <script>";
    const intro = "";
    const publicUrl = "https://example.com/p/abc";
    const sent = proposalSentHtml({ proposalTitle: title, senderName: sender, intro, publicUrl });
    const preview = proposalPreviewHtml({ proposalTitle: title, senderName: sender, intro, publicUrl });
    const followUp = proposalFollowUpHtml({ proposalTitle: title, senderName: sender, intro, publicUrl });
    const opened = openNotificationHtml({
      clientName: "Ada & Co",
      proposalTitle: title,
      proposalId: "prop-1",
    });

    for (const html of [sent, preview, followUp]) {
      assert.match(html, /Ada &lt;script&gt;/);
      assert.match(html, /Site &lt;b&gt;[\s\S]*rebuild/);
      assert.doesNotMatch(html, /<script>/);
      assert.doesNotMatch(html, /<b>/);
    }
    assert.match(sent, /<h1[^>]*>Site &lt;b&gt;/);
    assert.match(preview, /Preview: Site &lt;b&gt;/);
    assert.match(followUp, /&lt;b&gt;/);
    assert.match(opened, /Ada &amp; Co/);
    assert.doesNotMatch(opened, /<b>/);
    assert.equal(singleLine(title), "Site <b> rebuild");
    assert.equal(singleLine(title).includes("\n"), false);
    assert.equal(singleLine(title).includes("\r"), false);
    assert.equal(acceptanceClientSubject(title), "You accepted: Site <b> rebuild");
    assert.equal(
      acceptanceClientSubject(title, "Thanks for\r\n{title}"),
      "Thanks for Site <b> rebuild",
    );
    assert.equal(acceptanceOwnerSubject(title), "Accepted: Site <b> rebuild");
    assert.equal(acceptanceClientSubject(title).includes("\n"), false);
    assert.equal(acceptanceOwnerSubject(title).includes("\r"), false);
  });

  it("paces preview the same way as send and follow-up", () => {
    const api = path.join(process.cwd(), "src", "app", "api", "proposals", "[id]");
    for (const route of ["send", "preview", "followup"]) {
      const text = readFileSync(path.join(api, route, "route.ts"), "utf8");
      assert.match(text, /allowProposalEmail\(access\.userId\)/);
    }
  });

  it("limits how often one person can send", () => {
    const allow = createEmailRateLimit(2, 1_000);
    assert.equal(allow("user", 0), true);
    assert.equal(allow("user", 10), true);
    assert.equal(allow("user", 20), false);
    assert.equal(allow("user", 1_001), true);
    assert.equal(allow("other", 20), true);
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
