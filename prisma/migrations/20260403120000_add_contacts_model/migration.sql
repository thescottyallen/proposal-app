-- CreateTable: contacts
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey for contacts -> clients
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn: contact_id on proposals
ALTER TABLE "proposals" ADD COLUMN "contact_id" TEXT;

-- AddForeignKey for proposals -> contacts
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: create one Contact per existing Client using the old email/phone/name fields.
-- company column used as client name if present; otherwise keep existing name.
-- Sets is_main = true since it is the only contact.
INSERT INTO "contacts" ("id", "client_id", "name", "email", "phone", "is_main", "created_by", "created_at", "updated_at")
SELECT
    'mig_' || "id",
    "id",
    "name",
    COALESCE(NULLIF("email", ''), 'unknown@unknown.com'),
    "phone",
    true,
    "created_by",
    "created_at",
    "updated_at"
FROM "clients"
WHERE "email" IS NOT NULL AND "email" != '';

-- If clients had a company name set, use it as the client (company) name.
UPDATE "clients"
SET "name" = "company"
WHERE "company" IS NOT NULL AND "company" != '';

-- Wire up existing proposals to their migrated contact where email matches.
UPDATE "proposals" p
SET "contact_id" = c."id"
FROM "contacts" c
WHERE c."client_id" = p."client_id"
  AND c."email" = p."client_email"
  AND p."client_id" IS NOT NULL;

-- Drop old columns from clients that are now on contacts.
ALTER TABLE "clients" DROP COLUMN IF EXISTS "email";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "company";

-- Add abn column to clients (was previously missing from the clients table).
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "abn" TEXT;
