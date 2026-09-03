/*
  # Fix claims RLS — remove all anonymous and overly-permissive access

  ## Policies DROPPED:
  1. "Anon can read their own claim by ref" — USING(true), anon reads ALL claims
  2. "Authenticated users can read all claims" — USING(true), any user reads ALL claims
  3. "Authenticated users can update claims" — USING(true), any user updates ANY claim
  4. "Staff can update claims" — USING(true) WITH CHECK(true), anon+authenticated
  5. "Users can submit new claims" — replaced with tighter version

  ## Replacement security model:
  - SELECT: authenticated customers see only their own claims (customer_user_id match);
    staff (admin/super_admin/worker) see all. No anon SELECT.
  - INSERT: anon and authenticated can insert with initial statuses only.
    customer_user_id must be NULL (anon) or match auth.uid() (authenticated).
  - UPDATE: only staff roles can update. Rules engine runs via service_role (bypasses RLS).
  - Unauthenticated claim tracking: via RPC function get_claim_by_access_token
    (returns only public-safe fields, no PII).
*/

-- ── DROP all existing permissive policies ────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read their own claim by ref" ON claims;
DROP POLICY IF EXISTS "Authenticated users can read all claims" ON claims;
DROP POLICY IF EXISTS "Authenticated users can update claims" ON claims;
DROP POLICY IF EXISTS "Staff can update claims" ON claims;
DROP POLICY IF EXISTS "Users can submit new claims" ON claims;
DROP POLICY IF EXISTS "Customers can view own claims" ON claims;
DROP POLICY IF EXISTS "Anyone can insert a claim" ON claims;
DROP POLICY IF EXISTS "Anyone can view claims" ON claims;

-- ── New SELECT policy ─────────────────────────────────────────────────────────
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
CREATE POLICY "Anyone can submit a new claim"
  ON claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status IN ('Untouched', 'Pending Check')
    AND (customer_user_id IS NULL OR customer_user_id = auth.uid())
  );

-- ── New UPDATE policy ─────────────────────────────────────────────────────────
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
-- Requires both claim_ref AND access_token to match.
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

-- Only anon can call this (for public claim tracking); authenticated users use RLS
REVOKE EXECUTE ON FUNCTION get_claim_by_access_token(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_claim_by_access_token(text, text) TO anon;
