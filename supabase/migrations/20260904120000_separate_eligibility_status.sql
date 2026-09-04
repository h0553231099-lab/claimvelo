-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Separate eligibility status from operational status
--
-- The claims.status column previously held BOTH operational workflow statuses
-- (Untouched, In Progress, Submitted, Waiting, Escalated, Resolved) AND
-- eligibility decision statuses (Pending Check, Eligible, Not Eligible,
-- Not Eligible - Expired, Force Majeure).
--
-- This migration introduces a dedicated eligibility_status column and migrates
-- existing data so that:
--   - status       holds ONLY operational workflow values
--   - eligibility_status holds ONLY eligibility decision values (or NULL)
--
-- The existing audit_log is preserved and untouched. claim_status_history
-- (next migration) supplements it.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Add eligibility_status column ──────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS eligibility_status text;

-- ── 2. Migrate existing data ─────────────────────────────────────────────────
-- Claims whose status is an eligibility value: copy to eligibility_status
-- and set the operational status to a sensible default.
--
--   Pending Check / Eligible → status = 'Untouched' (still needs processing)
--   Not Eligible / Not Eligible - Expired / Force Majeure → status = 'Resolved'
UPDATE claims SET eligibility_status = status, status = 'Untouched'
  WHERE status IN ('Pending Check', 'Eligible');

UPDATE claims SET eligibility_status = status, status = 'Resolved'
  WHERE status IN ('Not Eligible', 'Not Eligible - Expired', 'Force Majeure');

-- ── 3. CHECK constraints ─────────────────────────────────────────────────────
-- status must be one of the six operational lifecycle values.
ALTER TABLE claims ADD CONSTRAINT claims_status_check
  CHECK (status IN ('Untouched', 'In Progress', 'Submitted', 'Waiting', 'Escalated', 'Resolved'));

-- eligibility_status must be NULL or one of the five eligibility decision values.
ALTER TABLE claims ADD CONSTRAINT claims_eligibility_status_check
  CHECK (eligibility_status IS NULL
    OR eligibility_status IN ('Pending Check', 'Eligible', 'Not Eligible', 'Not Eligible - Expired', 'Force Majeure'));

-- ── 4. Update RLS INSERT policy ───────────────────────────────────────────────
-- Only operational statuses are allowed on INSERT. Eligibility is set
-- exclusively by the rules engine (service role, bypasses RLS).
DROP POLICY IF EXISTS "Staff can insert claims" ON claims;
CREATE POLICY "Staff can insert claims"
  ON claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
    AND status = 'Untouched'
  );

-- ── 5. Update get_claim_by_access_token RPC ───────────────────────────────────
-- Return eligibility_status alongside status so the unauthenticated tracking
-- endpoint can show both dimensions. Must DROP first — CREATE OR REPLACE
-- cannot change the return type of an existing function.
DROP FUNCTION IF EXISTS get_claim_by_access_token(text, text);
CREATE FUNCTION get_claim_by_access_token(
  p_claim_ref text,
  p_access_token text
)
RETURNS TABLE(
  claim_ref text,
  status text,
  eligibility_status text,
  airline text,
  flight_number text,
  flight_date date,
  departure text,
  arrival text,
  amount text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.claim_ref,
    c.status,
    c.eligibility_status,
    c.airline,
    c.flight_number,
    c.flight_date,
    c.departure,
    c.arrival,
    c.amount,
    c.created_at,
    c.updated_at
  FROM claims c
  WHERE c.claim_ref = p_claim_ref
    AND c.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_claim_by_access_token(text, text) TO anon;

COMMIT;
