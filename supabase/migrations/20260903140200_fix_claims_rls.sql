/*
  # Fix claims RLS — remove all anonymous and overly-permissive access

  ## Security model:
  - SELECT: authenticated customers see only their own claims (customer_user_id match);
    staff (admin/super_admin/worker) see all. No anon SELECT.
  - INSERT: NO anon INSERT. Public claims are created exclusively by the
    create-claim Edge Function (service role, bypasses RLS).
    Staff (admin/super_admin/worker) may INSERT directly (temporary — BulkImport).
    Initial statuses only: Untouched / Pending Check.
  - UPDATE: only staff roles can update. Rules engine runs via service_role (bypasses RLS).
  - Unauthenticated claim tracking: via RPC function get_claim_by_access_token
    (returns only public-safe fields, no PII). Requires BOTH claim_ref and
    hashed access_token.
*/

BEGIN;

-- ── DROP all existing permissive policies ────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read their own claim by ref" ON claims;
DROP POLICY IF EXISTS "Authenticated users can read all claims" ON claims;
DROP POLICY IF EXISTS "Authenticated users can update claims" ON claims;
DROP POLICY IF EXISTS "Staff can update claims" ON claims;
DROP POLICY IF EXISTS "Users can submit new claims" ON claims;
DROP POLICY IF EXISTS "Customers can view own claims" ON claims;
DROP POLICY IF EXISTS "Anyone can insert a claim" ON claims;
DROP POLICY IF EXISTS "Anyone can view claims" ON claims;
DROP POLICY IF EXISTS "Anyone can submit a new claim" ON claims;

-- ── New SELECT policy ─────────────────────────────────────────────────────────
-- No anon SELECT. Customers see only their own claims; staff see all.
CREATE POLICY "Customers can view own claims"
  ON claims FOR SELECT
  TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── New INSERT policy ─────────────────────────────────────────────────────────
-- NO anon INSERT. Public claims are created by the create-claim Edge Function
-- (service role). Staff may INSERT directly (temporary — BulkImport).
CREATE POLICY "Staff can insert claims"
  ON claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
    AND status IN ('Untouched', 'Pending Check')
  );

-- ── New UPDATE policy ─────────────────────────────────────────────────────────
-- Only staff roles can update. Rules engine runs via service_role (bypasses RLS).
CREATE POLICY "Staff can update claims"
  ON claims FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── Secure RPC for unauthenticated claim lookup ──────────────────────────────
-- Returns only public-safe fields. No PII (no passenger name, email, phone).
-- Requires both claim_ref AND access_token (hashed) to match.
CREATE OR REPLACE FUNCTION get_claim_by_access_token(
  p_claim_ref text,
  p_access_token text
)
RETURNS TABLE(
  claim_ref text,
  status text,
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
  -- Hash the supplied token with SHA-256 and compare against the stored hash.
  -- The raw token is never stored in the database.
  RETURN QUERY
  SELECT
    c.claim_ref,
    c.status,
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

-- ── RPC permissions: strip all default access, then grant anon only ──────────
REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_claim_by_access_token(text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_claim_by_access_token(text, text) TO anon;

COMMIT;
