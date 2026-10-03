import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

describe("clerk migration static check", () => {
  it("rejects tracing, connection URLs, secret flags, and curl with an auth header", async () => {
    const checker = pathToFileURL(join(process.cwd(), "scripts/check-clerk-migration-static.mjs")).href;
    const { findStaticViolations } = await import(checker);
    const dir = await mkdtemp(join(tmpdir(), "clerk-static-"));
    try {
      await mkdir(join(dir, "nested"), { recursive: true });
      await writeFile(join(dir, "nested/bad.sh"), "set -x\ncurl -H 'Authorization: Bearer x'\n");
      await writeFile(join(dir, "url.sql"), "postgres://db.example/app\n");
      await writeFile(join(dir, "flag.ts"), "const flag = '--clerk-secret-key';\nconst name = 'DATABASE_URL';\n");
      const violations = await findStaticViolations(dir);
      assert.equal(violations.length, 5);
      assert.match(violations.join("\n"), /set -x/);
      assert.match(violations.join("\n"), /postgres:\/\//);
      assert.match(violations.join("\n"), /curl together with Authorization/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
