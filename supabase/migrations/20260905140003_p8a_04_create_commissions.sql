/*
  # Create commissions table with per-claim records + RLS

  ## Purpose
  Track commission per claim (not just running totals on worker_profiles).
  Required fields: agent_id, claim_id, commission_rate, commission_amount,
  commission_status, paid_at, created_at.

  ## RLS
    - Agent: read own commissions only
    - Sales Manager: read commissions for their team only
    - Admin/Super Admin: full read access
    - Anonymous/customer: no access
    - Mutations: service_role only (edge functions); no authenticated INSERT/UPDATE/DELETE

  ## Backfill
  Only for claims where:
    - agent_id IS NOT NULL (valid agent attribution)
    - eligibility_status = 'Eligible'
    - compensation_amount IS NOT NULL AND > 0
  Uses the agent's current commission_rate from worker_profiles.
  Claims that cannot be safely reconstructed are NOT backfilled (see report query).
*/

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  commission_rate numeric NOT NULL,
  commission_amount numeric NOT NULL,
  commission_status text NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_id, agent_id)
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- Indexes for RLS queries
CREATE INDEX IF NOT EXISTS commissions_agent_id_idx ON commissions(agent_id);
CREATE INDEX IF NOT EXISTS commissions_claim_id_idx ON commissions(claim_id);
CREATE INDEX IF NOT EXISTS commissions_status_idx ON commissions(commission_status);

-- ── RLS: SELECT ──────────────────────────────────────────────────────────────
CREATE POLICY "Agents can view own commissions"
  ON commissions FOR SELECT
  TO authenticated
  USING (
    -- Agent sees own commissions
    EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.user_id = auth.uid()
        AND wp.role = 'agent'
        AND wp.id = commissions.agent_id
    )
    -- Sales manager sees team commissions
    OR EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.manager_id = auth.uid()
        AND wp.role = 'agent'
        AND wp.id = commissions.agent_id
    )
    -- Admin/super_admin see all
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Only service_role (edge functions) can mutate commissions.

-- ── Safe backfill ────────────────────────────────────────────────────────────
-- Only for claims with valid agent_id, Eligible status, and non-null compensation.
INSERT INTO commissions (agent_id, claim_id, commission_rate, commission_amount, commission_status)
SELECT
  c.agent_id,
  c.id,
  COALESCE(wp.commission_rate, 10),
  ROUND(COALESCE(c.compensation_amount, 0) * COALESCE(wp.commission_rate, 10) / 100, 2),
  'pending'
FROM claims c
JOIN worker_profiles wp ON wp.id = c.agent_id
WHERE c.agent_id IS NOT NULL
  AND c.eligibility_status = 'Eligible'
  AND c.compensation_amount IS NOT NULL
  AND c.compensation_amount > 0
  AND wp.role = 'agent'
ON CONFLICT (claim_id, agent_id) DO NOTHING;

-- ── Report: claims with agent attribution that could NOT be backfilled ───────
-- To inspect after migration:
--   SELECT c.claim_ref, c.agent, c.agent_id, c.eligibility_status, c.compensation_amount
--   FROM claims c
--   WHERE c.agent_id IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM commissions com WHERE com.claim_id = c.id AND com.agent_id = c.agent_id
--     );
-- Reasons a claim might not be backfilled:
--   - eligibility_status is not 'Eligible' (e.g. 'Pending Check', 'Not Eligible')
--   - compensation_amount is NULL or 0 (pre-dates financial module)
--   - Already has a commission record (ON CONFLICT skip)
