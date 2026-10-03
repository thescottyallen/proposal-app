import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { securityHeaders } from "./security-headers.ts";

describe("response headers", () => {
  it("sets framing, content type, referrer, and permissions headers on every route", () => {
    const byKey = Object.fromEntries(securityHeaders.map((header) => [header.key, header.value]));
    assert.equal(byKey["X-Frame-Options"], "DENY");
    assert.equal(byKey["Content-Security-Policy"], "frame-ancestors 'none'");
    assert.equal(byKey["X-Content-Type-Options"], "nosniff");
    assert.equal(byKey["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.match(byKey["Permissions-Policy"], /camera=\(\)/);
    assert.match(byKey["Permissions-Policy"], /microphone=\(\)/);
    assert.match(byKey["Permissions-Policy"], /geolocation=\(\)/);

    const config = readFileSync("next.config.ts", "utf8");
    assert.match(config, /securityHeaders/);
    assert.match(config, /\/:path\*/);
  });
});
