-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B.2B: RLS policies for admin/staff access to evidence tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── flight_evidence: admin/staff can SELECT ─────────────────────────────────
DROP POLICY IF EXISTS "flight_evidence_admin_read" ON flight_evidence;
CREATE POLICY "flight_evidence_admin_read"
  ON flight_evidence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── claim_flight_segments: admin/staff can SELECT ───────────────────────────
DROP POLICY IF EXISTS "claim_flight_segments_admin_read" ON claim_flight_segments;
CREATE POLICY "claim_flight_segments_admin_read"
  ON claim_flight_segments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── audit_log: admin/staff can SELECT ───────────────────────────────────────
DROP POLICY IF EXISTS "audit_log_admin_read" ON audit_log;
CREATE POLICY "audit_log_admin_read"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── claims: admin/staff can update review fields ────────────────────────────
DROP POLICY IF EXISTS "claims_admin_update_review" ON claims;
CREATE POLICY "claims_admin_update_review"
  ON claims
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'worker')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'worker')
    )
  );
