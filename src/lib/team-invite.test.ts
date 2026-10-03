import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTeamInvitation } from "./team-invite.ts";

describe("team invitation allow-list", () => {
  it("stores the chosen role and rejects anything outside admin, member, and viewer", () => {
    const appUrl = "https://proposals.example.com";
    for (const role of ["admin", "member", "viewer"] as const) {
      const built = buildTeamInvitation({ emailAddress: "ada@example.com", role }, appUrl);
      assert.ok(!("error" in built));
      if ("error" in built) continue;
      assert.deepEqual(built.publicMetadata, { role });
      assert.equal(built.redirectUrl, "https://proposals.example.com/sign-up");
    }

    for (const role of ["owner", "ADMIN", "", null]) {
      const built = buildTeamInvitation({ emailAddress: "ada@example.com", role }, appUrl);
      assert.deepEqual(built, {
        error: "emailAddress and a valid role (admin, member, viewer) are required",
      });
    }
  });
});
