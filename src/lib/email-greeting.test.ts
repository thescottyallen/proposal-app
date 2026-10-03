import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOutreachIntroHtml,
  contactFirstName,
  proposalEmailGreeting,
  recipientNameFromProposal,
} from "./email-greeting.ts";

const CHARBEL_NOTE = `Hi Charbel

As discussed, here's my v1 take on a new project that gives us a bit more time together, gets me "under the hood", and keeps the momentum going.

Keen for any feedback / thoughts. Really excited about the opportunity to help take Tracta to the next level!

Scotty`;

describe("proposal email greeting", () => {
  it("uses the contact first name once when the note has no greeting", () => {
    const html = buildOutreachIntroHtml({
      recipientName: "Charbel Nahhas",
      message: "Keen for any feedback.",
    });

    assert.equal(proposalEmailGreeting({
      recipientName: "Charbel Nahhas",
      message: "Keen for any feedback.",
    }), "Hi Charbel,");
    assert.equal(html.match(/Hi /g)?.length, 1);
    assert.match(html, /Hi Charbel,/);
    assert.doesNotMatch(html, /Hi Tracta/);
  });

  it("does not prepend a company or second greeting when the note already starts with Hi", () => {
    const html = buildOutreachIntroHtml({
      recipientName: "Charbel Nahhas",
      message: CHARBEL_NOTE,
    });

    assert.equal(proposalEmailGreeting({
      recipientName: "Charbel Nahhas",
      message: CHARBEL_NOTE,
    }), null);
    assert.equal(html.match(/Hi /g)?.length, 1);
    assert.match(html, /Hi Charbel/);
    assert.doesNotMatch(html, /Hi Tracta/);
    assert.doesNotMatch(html, /<p[^>]*>Hi Charbel,/);
  });

  it("greets once with Hi, when there is no contact first name and the note does not greet", () => {
    assert.equal(proposalEmailGreeting({ recipientName: null, message: "Following up." }), "Hi,");
    assert.equal(proposalEmailGreeting({ recipientName: "   ", message: "" }), "Hi,");
    const html = buildOutreachIntroHtml({ recipientName: null, message: "Following up." });
    assert.match(html, /<p[^>]*>Hi,<\/p>/);
    assert.equal(html.match(/Hi/g)?.length, 1);
  });

  it("skips the auto greeting when there is no contact but the note already says Hi", () => {
    const html = buildOutreachIntroHtml({
      recipientName: null,
      message: "Hi Charbel\n\nJust checking in.",
    });
    assert.equal(html.match(/Hi /g)?.length, 1);
    assert.doesNotMatch(html, />Hi,</);
  });

  it("does not treat words that merely start with Hi as a greeting", () => {
    assert.equal(
      proposalEmailGreeting({ recipientName: "Charbel", message: "Highlighting the timeline next." }),
      "Hi Charbel,",
    );
  });

  it("treats Hello, Hey, and Dear as an existing greeting", () => {
    for (const message of ["Hello Charbel,", "Hey Charbel", "Dear Charbel,", "  good morning Charbel"]) {
      assert.equal(proposalEmailGreeting({ recipientName: "Charbel Nahhas", message }), null);
    }
  });

  it("takes only the first name", () => {
    assert.equal(contactFirstName("Charbel Nahhas"), "Charbel");
    assert.equal(contactFirstName("  Charbel, "), "Charbel");
  });

  it("escapes message text and keeps line breaks as breaks", () => {
    const html = buildOutreachIntroHtml({
      recipientName: "Ann<script>",
      message: `See <b>there</b> & friends\nnext`,
    });

    assert.match(html, /Hi Ann&lt;script&gt;,/);
    assert.match(html, /See &lt;b&gt;there&lt;\/b&gt; &amp; friends<br\/>next/);
    assert.match(html, /<p style="/);
    assert.doesNotMatch(html, /<b>there<\/b>/);
    assert.doesNotMatch(html, /<script>/);
  });

  it("resolves the To address to the matching contact, not the company", () => {
    const name = recipientNameFromProposal("Charbel@tracta.com", {
      contact: { name: "Charbel Nahhas", email: "charbel@tracta.com" },
      client: {
        contacts: [
          { name: "Tracta", email: "hello@tracta.com" },
          { name: "Charbel Nahhas", email: "charbel@tracta.com" },
        ],
      },
    });
    assert.equal(name, "Charbel Nahhas");
    assert.equal(
      recipientNameFromProposal("someone-else@example.com", {
        contact: { name: "Charbel Nahhas", email: "charbel@tracta.com" },
        client: { contacts: [{ name: "Charbel Nahhas", email: "charbel@tracta.com" }] },
      }),
      null,
    );
  });
});
