/*
  # Add claims.agent_id as proper FK to worker_profiles

  ## Purpose
  Replace the loose text-based attribution (claims.agent) with a proper
  foreign key (claims.agent_id → worker_profiles.id) for referential integrity.
  The text column claims.agent is kept temporarily for backward compatibility.

  ## Backfill
  Populate agent_id from the existing text code:
    claims.agent → worker_profiles.agent_code → worker_profiles.id
  Only where the text code is non-empty, non-'—', and matches an active agent.
  Claims with no valid agent code get agent_id = NULL (no attribution).
*/

-- ── Add the column ───────────────────────────────────────────────────────────
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL;

-- ── Backfill from text code ──────────────────────────────────────────────────
UPDATE claims c
SET agent_id = wp.id
FROM worker_profiles wp
WHERE c.agent = wp.agent_code
  AND c.agent <> '—'
  AND c.agent <> ''
  AND wp.agent_code <> ''
  AND c.agent_id IS NULL;

-- ── Index for RLS queries (agent/sales-manager lookups) ──────────────────────
CREATE INDEX IF NOT EXISTS claims_agent_id_idx
  ON claims(agent_id)
  WHERE agent_id IS NOT NULL;

-- ── Report: claims with a text agent code that could NOT be resolved ─────────
-- These are claims where agent text is set but no matching worker_profile exists.
-- They retain agent_id = NULL and their text agent value is preserved.
-- To inspect after migration:
--   SELECT claim_ref, agent, agent_id FROM claims
--   WHERE agent <> '—' AND agent <> '' AND agent_id IS NULL;
