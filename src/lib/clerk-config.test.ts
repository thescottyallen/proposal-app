import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyJwt } from "@clerk/backend/jwt";
import {
  assertPreviewConfig,
  assertProductionConfig,
  clerkMiddlewareOptions,
} from "./clerk-config.ts";

function token(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ sub: "user_test", iat: now, exp: now + 60, ...claims })}.sig`;
}

describe("production authorized parties", () => {
  it("refuses to build or start in production without CLERK_AUTHORIZED_PARTIES", () => {
    assert.throws(
      () => assertProductionConfig({ VERCEL_ENV: "production" }),
      /CLERK_AUTHORIZED_PARTIES is required/
    );
    assert.doesNotThrow(() =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        CLERK_AUTHORIZED_PARTIES: "https://proposals.example.com",
      })
    );
    assert.doesNotThrow(() => assertProductionConfig({ VERCEL_ENV: "preview" }));
  });

  it("a dev token gets rejected by prod config", async () => {
    const prod = clerkMiddlewareOptions({
      CLERK_AUTHORIZED_PARTIES: "https://proposals.example.com",
    });
    const message = async (azp: string) => {
      try {
        const result = await verifyJwt(token({ azp }), {
          authorizedParties: prod.authorizedParties,
          key: "unused",
        });
        const errors = (result as { errors?: { message?: string }[] }).errors;
        return errors?.[0]?.message ?? "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    assert.match(await message("http://localhost:3000"), /Authorized party/);
    assert.match(await message("https://happy-horse-1.accounts.dev"), /Authorized party/);
    assert.equal((await message("https://proposals.example.com")).includes("Authorized party"), false);
  });
});

describe("preview deployment", () => {
  it("Preview uses dev keys and a non-prod database", () => {
    const preview = {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_preview",
      CLERK_SECRET_KEY: "sk_test_preview",
      DATABASE_URL: "postgresql://user:secret@db.previewref.supabase.co:5432/postgres",
      PRODUCTION_DB_HOST: "prodref",
    };
    assert.doesNotThrow(() => assertPreviewConfig(preview));
    assert.throws(
      () =>
        assertPreviewConfig({
          ...preview,
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_preview",
          CLERK_SECRET_KEY: "sk_live_preview",
        }),
      /development keys/
    );
    assert.throws(
      () => assertPreviewConfig({ ...preview, DATABASE_URL: "" }),
      /non-production database/
    );
    assert.throws(
      () =>
        assertPreviewConfig({
          ...preview,
          DATABASE_URL: "postgresql://user:secret@db.prodref.supabase.co:5432/postgres",
        }),
      /non-production database/
    );
    assert.throws(
      () =>
        assertPreviewConfig({
          ...preview,
          PRODUCTION_DB_HOST: "db.previewref.supabase.co",
        }),
      /non-production database/
    );
  });
});
