import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planDemote, planRestore, roleOnlyPatch } from "../lib/role-metadata.ts";

describe("role merge", () => {
  it("merges only the role key and removes it when the export had no role", () => {
    const plan = planRestore(
      ["user_admin", "user_plain", "user_new"],
      [
        { id: "user_admin", publicMetadata: { role: "admin", theme: "dark" } },
        { id: "user_plain", publicMetadata: { theme: "dark" } },
      ]
    );

    assert.deepEqual(plan.missingFromExport, ["user_new"]);
    assert.deepEqual(plan.changes, [
      { userId: "user_admin", body: { public_metadata: { role: "admin" } } },
      { userId: "user_plain", body: { public_metadata: { role: null } } },
    ]);
    for (const change of plan.changes) {
      assert.deepEqual(Object.keys(change.body), ["public_metadata"]);
      assert.deepEqual(Object.keys(change.body.public_metadata), ["role"]);
    }
    assert.equal(
      plan.changes.some((change) => change.userId === "user_new"),
      false
    );
  });

  it("demotes other admins to member without replacing the rest of their metadata", () => {
    const changes = planDemote(["user_keep", "user_other"], "user_keep");
    assert.deepEqual(changes, [
      { userId: "user_other", body: roleOnlyPatch("member") },
    ]);
    assert.deepEqual(changes[0].body, { public_metadata: { role: "member" } });
  });
});
