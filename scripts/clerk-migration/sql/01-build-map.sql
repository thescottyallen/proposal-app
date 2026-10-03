-- Run from the private working folder:
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -f 01-build-map.sql
-- Reads dev_users.csv (id,email) and prod_users.csv (id,email,external_id,created_at).
CREATE SCHEMA IF NOT EXISTS clerk_migration;
REVOKE ALL ON SCHEMA clerk_migration FROM PUBLIC, anon, authenticated;
DROP TABLE IF EXISTS clerk_migration.id_map, clerk_migration.dev_users, clerk_migration.prod_users;
CREATE TABLE clerk_migration.dev_users  (id text PRIMARY KEY, email text NOT NULL);
CREATE TABLE clerk_migration.prod_users (id text PRIMARY KEY, email text NOT NULL,
                                         external_id text, created_at timestamptz);
\copy clerk_migration.dev_users  FROM 'dev_users.csv'  CSV HEADER
\copy clerk_migration.prod_users FROM 'prod_users.csv' CSV HEADER

CREATE TABLE clerk_migration.id_map (
  old_id text PRIMARY KEY,            -- dev ID, from Clerk externalId
  new_id text NOT NULL UNIQUE,        -- prod ID
  email  text NOT NULL,
  CHECK (old_id <> new_id));
-- PRIMARY KEY and UNIQUE make any duplicate old or new ID fail the whole file
INSERT INTO clerk_migration.id_map
  SELECT external_id, id, lower(email) FROM clerk_migration.prod_users WHERE external_id IS NOT NULL;

DO $$
DECLARE bad text;
BEGIN
  -- Email is only a cross-check on the externalId match
  SELECT string_agg(m.old_id, ', ') INTO bad
    FROM clerk_migration.id_map m LEFT JOIN clerk_migration.dev_users d ON d.id = m.old_id
   WHERE d.id IS NULL OR lower(d.email) <> m.email;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'externalId and email disagree for: %', bad; END IF;
  IF EXISTS (SELECT 1 FROM clerk_migration.id_map a JOIN clerk_migration.id_map b ON a.new_id = b.old_id)
    THEN RAISE EXCEPTION 'an ID appears as both old and new'; END IF;
  SELECT string_agg(email, ', ') INTO bad FROM clerk_migration.dev_users d
   WHERE NOT EXISTS (SELECT 1 FROM clerk_migration.id_map m WHERE m.old_id = d.id);
  IF bad IS NOT NULL THEN RAISE NOTICE 'dev users with no prod account (fine if they own no data): %', bad; END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA clerk_migration FROM PUBLIC, anon, authenticated;
