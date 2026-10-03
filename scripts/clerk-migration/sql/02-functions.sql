-- psql -X -v ON_ERROR_STOP=1 --single-transaction -f 02-functions.sql
-- Creates functions only. Changes no app data.
CREATE SCHEMA IF NOT EXISTS clerk_migration;
REVOKE ALL ON SCHEMA clerk_migration FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA clerk_migration REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA clerk_migration REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS clerk_migration.row_counts (run_at timestamptz DEFAULT now(), direction text,
  tbl text, col text, stage text, src_rows bigint, dst_rows bigint, total_rows bigint, deleted bigint,
  real_settings bigint);
CREATE TABLE IF NOT EXISTS clerk_migration.orphans (run_at timestamptz DEFAULT now(), tbl text, col text,
  row_id text, from_id text, to_id text);
CREATE TABLE IF NOT EXISTS clerk_migration.orphan_settings (LIKE public.business_settings);

-- The eight places a Clerk user ID is stored
CREATE OR REPLACE FUNCTION clerk_migration.cols()
RETURNS TABLE (tbl text, col text, expr text) LANGUAGE sql AS $$
  VALUES ('business_settings','user_id','user_id'), ('clients','created_by','created_by'),
         ('contacts','created_by','created_by'), ('proposals','created_by','created_by'),
         ('proposal_revisions','created_by','created_by'), ('templates','created_by','created_by'),
         ('content_blocks','created_by','created_by'),
         ('proposal_events','editedBy','metadata->>''editedBy''') $$;

-- True when a settings row is still what getOrCreateBusinessSettings() creates
CREATE OR REPLACE FUNCTION clerk_migration.settings_is_default(b public.business_settings)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(b.business_name, '') = '' AND coalesce(b.abn, '') = ''
     AND NOT b.gst_registered AND b.default_currency::text = 'AUD'
     AND b.invoice_prefix = 'INV' AND b.invoice_seq = 0 AND b.rounding_mode::text = 'CENTS'
     AND coalesce(b.default_acceptance_message, '') = ''
     AND coalesce(b.acceptance_email_subject, '') = ''
     AND coalesce(b.acceptance_email_message, '') = '' $$;

-- Stops if the schema has drifted from what this code was written against
CREATE OR REPLACE FUNCTION clerk_migration.check_schema()
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE got text;
BEGIN
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO got
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'business_settings';
  IF got IS DISTINCT FROM 'abn,acceptance_email_message,acceptance_email_subject,business_name,created_at,'
     'default_acceptance_message,default_currency,gst_registered,id,invoice_prefix,invoice_seq,'
     'rounding_mode,updated_at,user_id' THEN
    RAISE EXCEPTION 'business_settings columns changed (%): update settings_is_default() first', got;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND
      (table_name, column_name) IN (('clients','created_by'),('contacts','created_by'),('proposals','created_by'),
        ('proposal_revisions','created_by'),('templates','created_by'),('content_blocks','created_by'),
        ('proposal_events','metadata'))) <> 7 THEN
    RAISE EXCEPTION 'an expected user-ID column is missing';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION clerk_migration.remap(direction text, orphans_to text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  c record; pr record; bad text; b_src bigint; b_dst bigint; b_tot bigint;
  a_src bigint; a_dst bigint; a_tot bigint; del bigint; b_real bigint; a_real bigint;
BEGIN
  IF direction NOT IN ('forward','reverse') THEN RAISE EXCEPTION 'direction must be forward or reverse'; END IF;
  IF direction = 'forward' AND orphans_to IS NOT NULL THEN RAISE EXCEPTION 'orphans_to is for reverse only'; END IF;
  PERFORM clerk_migration.check_schema();

  -- Hold off app writes until this transaction ends. Reads still work.
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.business_settings, public.clients, public.contacts, public.proposals,
             public.proposal_revisions, public.templates, public.content_blocks, public.proposal_events
    IN SHARE ROW EXCLUSIVE MODE;

  DROP TABLE IF EXISTS pg_temp.m;
  CREATE TEMP TABLE m ON COMMIT DROP AS
    SELECT CASE direction WHEN 'forward' THEN old_id ELSE new_id END AS src,
           CASE direction WHEN 'forward' THEN new_id ELSE old_id END AS dst
      FROM clerk_migration.id_map;
  IF (SELECT count(*) - count(DISTINCT src) FROM m) > 0 OR (SELECT count(*) - count(DISTINCT dst) FROM m) > 0
     OR EXISTS (SELECT 1 FROM m WHERE src IS NULL OR dst IS NULL)
     OR EXISTS (SELECT 1 FROM m a JOIN m b ON a.dst = b.src)
    THEN RAISE EXCEPTION 'map has duplicate, null or chained IDs'; END IF;

  -- Stored IDs on neither side of the map
  DROP TABLE IF EXISTS pg_temp.unmapped;
  CREATE TEMP TABLE unmapped (tbl text, col text, row_id text, uid text) ON COMMIT DROP;
  FOR c IN SELECT * FROM clerk_migration.cols() LOOP
    EXECUTE format('INSERT INTO unmapped SELECT %L, %L, id, %s FROM public.%I
                     WHERE %s IS NOT NULL AND %s NOT IN (SELECT src FROM m UNION SELECT dst FROM m)',
                   c.tbl, c.col, c.expr, c.tbl, c.expr, c.expr);
  END LOOP;
  IF EXISTS (SELECT 1 FROM unmapped) THEN
    IF orphans_to IS NULL OR NOT EXISTS (SELECT 1 FROM m WHERE dst = orphans_to) THEN
      SELECT string_agg(DISTINCT uid, ', ') INTO bad FROM unmapped;
      RAISE EXCEPTION 'unmapped user IDs in data: %', bad;
    END IF;
    INSERT INTO clerk_migration.orphans (tbl, col, row_id, from_id, to_id)
      SELECT tbl, col, row_id, uid, orphans_to FROM unmapped;
    -- Orphans' settings are kept aside, not merged into Scotty's
    INSERT INTO clerk_migration.orphan_settings
      SELECT * FROM public.business_settings WHERE user_id IN (SELECT uid FROM unmapped);
    DELETE FROM public.business_settings WHERE user_id IN (SELECT uid FROM unmapped);
    INSERT INTO m SELECT DISTINCT uid, orphans_to FROM unmapped WHERE uid NOT IN (SELECT src FROM m);
  END IF;

  SELECT count(*) INTO b_real FROM public.business_settings b WHERE NOT clerk_migration.settings_is_default(b);

  FOR c IN SELECT * FROM clerk_migration.cols() LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE %1$s IN (SELECT src FROM m)),
                           count(*) FILTER (WHERE %1$s IN (SELECT dst FROM m)), count(*) FROM public.%2$I',
                   c.expr, c.tbl) INTO b_src, b_dst, b_tot;
    del := 0;
    IF c.tbl = 'business_settings' THEN
      -- A person can have a row under both IDs (the app auto-creates one on first visit).
      -- Delete whichever is still at its defaults. If both hold real settings, stop.
      FOR pr IN SELECT s.id AS s_id, d.id AS d_id,
                       clerk_migration.settings_is_default(s) AS s_def,
                       clerk_migration.settings_is_default(d) AS d_def
                  FROM m JOIN public.business_settings s ON s.user_id = m.src
                         JOIN public.business_settings d ON d.user_id = m.dst LOOP
        IF pr.d_def THEN
          DELETE FROM public.business_settings WHERE id = pr.d_id;
        ELSIF pr.s_def THEN
          DELETE FROM public.business_settings WHERE id = pr.s_id;
        ELSE
          RAISE EXCEPTION 'business_settings rows % and % both hold real settings: merge by hand', pr.s_id, pr.d_id;
        END IF;
        del := del + 1;
      END LOOP;
    END IF;
    IF c.col = 'editedBy' THEN
      UPDATE public.proposal_events e SET metadata = jsonb_set(e.metadata, '{editedBy}', to_jsonb(m.dst))
        FROM m WHERE e.metadata->>'editedBy' = m.src;
    ELSE
      EXECUTE format('UPDATE public.%1$I t SET %2$I = m.dst FROM m WHERE t.%2$I = m.src', c.tbl, c.col);
    END IF;
    EXECUTE format('SELECT count(*) FILTER (WHERE %1$s IN (SELECT src FROM m)),
                           count(*) FILTER (WHERE %1$s IN (SELECT dst FROM m)), count(*) FROM public.%2$I',
                   c.expr, c.tbl) INTO a_src, a_dst, a_tot;
    a_real := NULL;
    IF c.tbl = 'business_settings' THEN
      SELECT count(*) INTO a_real FROM public.business_settings b WHERE NOT clerk_migration.settings_is_default(b);
    END IF;
    INSERT INTO clerk_migration.row_counts
      (direction, tbl, col, stage, src_rows, dst_rows, total_rows, deleted, real_settings)
      VALUES (direction, c.tbl, c.col, 'before', b_src, b_dst, b_tot, 0, CASE WHEN a_real IS NOT NULL THEN b_real END),
             (direction, c.tbl, c.col, 'after',  a_src, a_dst, a_tot, del, a_real);
    RAISE NOTICE '%.%: before src=% dst=% total=% | deleted=% | after src=% dst=% total=%',
      c.tbl, c.col, b_src, b_dst, b_tot, del, a_src, a_dst, a_tot;
    IF a_src <> 0 OR a_dst <> b_src + b_dst - del OR a_tot <> b_tot - del THEN
      RAISE EXCEPTION 'count mismatch on %.%, nothing changed', c.tbl, c.col;
    END IF;
    IF a_real IS NOT NULL AND a_real <> b_real THEN
      RAISE EXCEPTION 'business_settings: % rows with real settings before, % after, nothing changed', b_real, a_real;
    END IF;
  END LOOP;
END $fn$;

-- Run after each key swap: no source-side IDs may remain
CREATE OR REPLACE FUNCTION clerk_migration.verify(direction text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE c record; n bigint; total bigint := 0;
BEGIN
  IF direction NOT IN ('forward','reverse') THEN RAISE EXCEPTION 'direction must be forward or reverse'; END IF;
  FOR c IN SELECT * FROM clerk_migration.cols() LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s IN (SELECT %s FROM clerk_migration.id_map)',
                   c.tbl, c.expr, CASE direction WHEN 'forward' THEN 'old_id' ELSE 'new_id' END) INTO n;
    RAISE NOTICE '%.%: % rows still on the old side', c.tbl, c.col, n;
    total := total + n;
  END LOOP;
  IF total > 0 THEN RAISE EXCEPTION '% rows still use old IDs: run remap again', total; END IF;
END $fn$;

REVOKE ALL ON ALL TABLES    IN SCHEMA clerk_migration FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA clerk_migration FROM PUBLIC, anon, authenticated;
