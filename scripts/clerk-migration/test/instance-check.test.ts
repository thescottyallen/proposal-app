import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeSessionsPath,
  maskEmail,
  usersMissingExternalId,
} from "../lib/clerk-api.ts";

describe("clerk instance checks", () => {
  it("masks emails and refuses prod users who have no externalId", () => {
    assert.equal(maskEmail("ada@example.com"), "a***@example.com");
    assert.equal(maskEmail("not-an-email"), "***");
    assert.deepEqual(
      usersMissingExternalId([
        { id: "user_ok", external_id: "user_dev" },
        { id: "user_new", external_id: null },
        { id: "user_blank", external_id: "" },
      ]),
      ["user_new", "user_blank"]
    );
  });

  it("asks for active sessions one user at a time", () => {
    const path = activeSessionsPath("user prod/A");
    assert.match(path, /\/v1\/sessions\?/);
    assert.match(path, /user_id=user%20prod%2FA/);
    assert.match(path, /status=active/);
    assert.equal(path.includes("client_id="), false);
  });
});
