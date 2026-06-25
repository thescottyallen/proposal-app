-- Rename proposal status value DECLINED -> LOST (idempotent / safe to re-run)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ProposalStatus' AND e.enumlabel = 'DECLINED'
  ) THEN
    ALTER TYPE "ProposalStatus" RENAME VALUE 'DECLINED' TO 'LOST';
  END IF;
END$$;

-- Optional free-text reason captured when a proposal is marked Lost
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "lost_reason" TEXT;
