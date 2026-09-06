/*
  # Fix Claims RLS — add agent and sales_manager access

  ## Problem
  The existing claims SELECT policy only allowed:
    customer_user_id = auth.uid() OR role IN ('admin', 'super_admin', 'worker')
  Agents and sales_managers were excluded — their dashboards returned zero rows.

  ## Fix
  New SELECT policy:
    - Customer: own claims only (customer_user_id = auth.uid())
    - Agent: claims permanently attributed to them (claims.agent_id = their worker_profiles.id)
    - Sales Manager: claims from agents assigned to them (worker_profiles.manager_id = auth.uid())
    - Staff (admin, super_admin, worker): all claims
    - Anonymous: no direct claims access (unchanged)

  INSERT/UPDATE policies remain unchanged (staff only; public claims go through
  the create-claim edge function with the service role).
*/

BEGIN;

-- ── Drop existing SELECT policy ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Customers can view own claims" ON claims;

-- ── New SELECT policy ─────────────────────────────────────────────────────────
CREATE POLICY "Users can view authorized claims"
  ON claims FOR SELECT
  TO authenticated
  USING (
    -- Customer sees own claims
    customer_user_id = auth.uid()
    -- Staff (admin, super_admin, worker) see all claims
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
    -- Agent sees claims permanently attributed to them
    OR EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.user_id = auth.uid()
        AND wp.role = 'agent'
        AND wp.id = claims.agent_id
    )
    -- Sales manager sees claims from their agents
    OR EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.manager_id = auth.uid()
        AND wp.role = 'agent'
        AND wp.id = claims.agent_id
    )
  );

COMMIT;
