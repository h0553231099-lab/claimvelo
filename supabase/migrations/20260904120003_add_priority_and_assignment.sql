-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 — Priority + Assignment
--
-- Adds two columns to claims:
--   priority    — low / medium / high / urgent (default medium)
--   assigned_to — nullable FK to profiles.id (staff member who owns the claim)
--
-- RLS: no new policies needed. The existing UPDATE policy on claims allows
-- staff to set these columns. Workers do not gain any new access — they can
-- already SELECT all claims per the existing policy, and "My Claims" is a
-- frontend filter on assigned_to, not a new RLS grant.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Priority ──────────────────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';

ALTER TABLE claims ADD CONSTRAINT claims_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- ── Assignment ────────────────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS assigned_to uuid
  REFERENCES profiles(id) ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_claims_priority ON claims(priority);
CREATE INDEX IF NOT EXISTS idx_claims_assigned_to
  ON claims(assigned_to) WHERE assigned_to IS NOT NULL;

COMMIT;
