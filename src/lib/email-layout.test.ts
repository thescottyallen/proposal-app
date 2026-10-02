import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_WIDTH, emailHeaderLogoHtml } from "./email-layout.ts";

describe("email header logo", () => {
  it("renders about twice as wide as the old 30px-tall logo", () => {
    assert.ok(EMAIL_LOGO_WIDTH >= 120 && EMAIL_LOGO_WIDTH <= 140);
    assert.equal(EMAIL_LOGO_HEIGHT, 68);
    const html = emailHeaderLogoHtml("https://example.com/logo.png");
    assert.match(html, /width="132"/);
    assert.match(html, /height="68"/);
    assert.match(html, /width:132px/);
    assert.match(html, /height:68px/);
    assert.match(html, /max-width:100%/);
    assert.doesNotMatch(html, /width:auto/);
  });
});
