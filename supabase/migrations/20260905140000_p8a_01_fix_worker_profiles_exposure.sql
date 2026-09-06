/*
  # P0 — Fix worker_profiles anonymous data exposure

  ## Problem
  The anon SELECT policy `USING (true)` on worker_profiles exposed ALL columns
  to unauthenticated users — including api_key, commission_rate, payout totals,
  manager_id, and private worker information.

  ## Fix
  1. Drop the blanket anon SELECT policy.
  2. Create a narrowly scoped SECURITY DEFINER RPC `validate_agent_code(code)`
     that returns ONLY whether a referral code is valid and the code itself.
     No private data (api_key, commission_rate, payout totals, manager_id, etc.)
     is ever exposed to anonymous users.
  3. Grant EXECUTE on the RPC to anon only.
*/

BEGIN;

-- ── Drop the blanket anon SELECT policy ──────────────────────────────────────
DROP POLICY IF EXISTS "Anon can validate agent codes" ON worker_profiles;
DROP POLICY IF EXISTS "Anyone can validate agent codes" ON worker_profiles;

-- ── Safe RPC for public agent-code validation ────────────────────────────────
-- Returns only: valid (bool), agent_code (text). No private data.
CREATE OR REPLACE FUNCTION validate_agent_code(p_code text)
RETURNS TABLE(valid boolean, agent_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT true, wp.agent_code
  FROM worker_profiles wp
  WHERE wp.agent_code = UPPER(btrim(p_code))
    AND wp.agent_code <> ''
    AND wp.status = 'active'
  LIMIT 1;
END;
$$;

-- Grant anon access to the RPC only (not the table)
REVOKE ALL ON FUNCTION public.validate_agent_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agent_code(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_agent_code(text) TO anon;

COMMIT;
