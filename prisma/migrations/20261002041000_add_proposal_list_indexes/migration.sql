-- Speeds up the proposals list (created_by + sort), status filters, client
-- lookups, and the per-proposal event count / latest-50 activity query.
-- Safe to run more than once. The app works before these exist; queries are
-- just slower until they do.
-- Apply with: npx prisma migrate deploy

CREATE INDEX IF NOT EXISTS "proposals_created_by_idx" ON "proposals"("created_by");
CREATE INDEX IF NOT EXISTS "proposals_status_idx" ON "proposals"("status");
CREATE INDEX IF NOT EXISTS "proposals_updated_at_idx" ON "proposals"("updated_at");
CREATE INDEX IF NOT EXISTS "proposals_client_id_idx" ON "proposals"("client_id");

CREATE INDEX IF NOT EXISTS "proposal_events_proposal_id_created_at_idx"
  ON "proposal_events"("proposal_id", "created_at");

CREATE INDEX IF NOT EXISTS "proposal_events_proposal_id_event_type_idx"
  ON "proposal_events"("proposal_id", "event_type");
