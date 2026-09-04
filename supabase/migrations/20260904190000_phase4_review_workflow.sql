-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4 — Review workflow, confidence score, review notes
--
-- Adds:
--   1. confidence_score column on flight_evidence (0-100 integer)
--   2. Review decision fields on claims (decision, reason, decided_by, decided_at)
--   3. review_notes table for staff review notes per claim
--   4. RLS policies for review_notes (staff read/insert)
--   5. Trigger to log review decisions in claim_status_history
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Confidence score on flight_evidence ───────────────────────────────────
ALTER TABLE flight_evidence ADD COLUMN IF NOT EXISTS confidence_score integer
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

-- ── 2. Review decision fields on claims ─────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_decision text
  CHECK (review_decision IS NULL OR review_decision IN ('approved', 'rejected', 'escalated'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_decision_reason text;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_decided_by uuid REFERENCES auth.users(id);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_decided_at timestamptz;

-- ── 3. review_notes table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  note        text NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_notes_claim_id ON review_notes(claim_id);
CREATE INDEX IF NOT EXISTS idx_review_notes_created_at ON review_notes(created_at);

-- ── 4. RLS for review_notes ──────────────────────────────────────────────────
ALTER TABLE review_notes ENABLE ROW LEVEL SECURITY;

-- Staff (admin/super_admin/worker) can read all review notes
CREATE POLICY "Staff can read review_notes"
  ON review_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can insert review notes
CREATE POLICY "Staff can insert review_notes"
  ON review_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── 5. Trigger: log review decisions in claim_status_history ──────────────────
CREATE OR REPLACE FUNCTION log_review_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF OLD.review_decision IS DISTINCT FROM NEW.review_decision AND NEW.review_decision IS NOT NULL THEN
    IF NEW.review_decided_by IS NOT NULL THEN
      SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.review_decided_by;
    END IF;

    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, changed_by, source, actor_name, reason)
    VALUES (
      NEW.id,
      'override',
      NULLIF(OLD.review_decision, ''),
      NEW.review_decision,
      NEW.review_decided_by,
      'staff',
      v_actor_name,
      NULLIF(NEW.review_decision_reason, '')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claims_review_decision_ai ON claims;
CREATE TRIGGER claims_review_decision_ai
  AFTER INSERT OR UPDATE OF review_decision ON claims
  FOR EACH ROW EXECUTE FUNCTION log_review_decision();

COMMIT;
