-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Claim status history table + triggers
--
-- Creates a purpose-built claim_status_history table that records every
-- transition of the operational status AND the eligibility_status fields.
--
-- This SUPPLEMENTS the existing audit_log — it does not replace it.
-- audit_log captures a broad audit trail (status, compensation, overrides,
-- finance, worker profiles). claim_status_history focuses exclusively on
-- status transitions with structured columns for querying and timeline display.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  field_name  text NOT NULL DEFAULT 'status',
    -- 'status' (operational) or 'eligibility_status' (eligibility decision)
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text,
  source      text NOT NULL DEFAULT 'system',
    -- 'staff' (authenticated UI action), 'system' (rules engine / edge fn),
    -- 'insert' (initial record on claim creation)
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE claim_status_history ENABLE ROW LEVEL SECURITY;

-- ── RLS: staff can read; no direct writes (only trigger + service_role) ───────
CREATE POLICY "Staff can read claim status history"
  ON claim_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- No INSERT/UPDATE/DELETE policies → only service_role and SECURITY DEFINER
-- triggers can write.

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_claim_status_history_claim_id
  ON claim_status_history(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_status_history_field
  ON claim_status_history(field_name);

-- ── Trigger function ──────────────────────────────────────────────────────────
-- Fires AFTER INSERT or AFTER UPDATE on claims.
-- On INSERT: records the initial operational status (from NULL → status).
-- On UPDATE: records a row for each status-type field that changed.
CREATE OR REPLACE FUNCTION record_claim_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source  text := CASE WHEN v_user_id IS NOT NULL THEN 'staff' ELSE 'system' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, changed_by, source)
    VALUES (NEW.id, 'status', NULL, NEW.status, v_user_id, 'insert');

    IF NEW.eligibility_status IS NOT NULL THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'eligibility_status', NULL, NEW.eligibility_status, v_user_id, 'insert');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'status', OLD.status, NEW.status, v_user_id, v_source);
    END IF;

    IF OLD.eligibility_status IS DISTINCT FROM NEW.eligibility_status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'eligibility_status', OLD.eligibility_status, NEW.eligibility_status, v_user_id, v_source);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_status_history_ai ON claims;
CREATE TRIGGER claim_status_history_ai
  AFTER INSERT ON claims
  FOR EACH ROW EXECUTE FUNCTION record_claim_status_history();

DROP TRIGGER IF EXISTS claim_status_history_au ON claims;
CREATE TRIGGER claim_status_history_au
  AFTER UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION record_claim_status_history();

COMMIT;
