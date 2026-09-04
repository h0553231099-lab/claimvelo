-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 — Extend claim_status_history to track priority, assignment,
-- and review changes
--
-- Replaces the record_claim_status_history() trigger function (from Phase 1)
-- to also record changes to:
--   priority           — low / medium / high / urgent
--   assigned_to        — staff member UUID (or '' for unassigned)
--   review_status      — pending / in_review / completed
--   review_assigned_to — reviewer UUID (or '' for unassigned)
--
-- The existing status and eligibility_status tracking is preserved unchanged.
-- The triggers (claim_status_history_ai, claim_status_history_au) are NOT
-- recreated — they already call this function, so CREATE OR REPLACE is enough.
--
-- No new tables, no RLS changes, no new policies. The claim_status_history
-- table already allows any text in field_name, so the new values work without
-- a schema change.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
    -- ── Existing: operational status ──────────────────────────────────────
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'status', OLD.status, NEW.status, v_user_id, v_source);
    END IF;

    -- ── Existing: eligibility status ─────────────────────────────────────
    IF OLD.eligibility_status IS DISTINCT FROM NEW.eligibility_status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'eligibility_status', OLD.eligibility_status, NEW.eligibility_status, v_user_id, v_source);
    END IF;

    -- ── Phase 3: priority ─────────────────────────────────────────────────
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'priority', OLD.priority, NEW.priority, v_user_id, v_source);
    END IF;

    -- ── Phase 3: staff assignment (COALESCE to '' for NOT NULL to_status) ─
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'assigned_to',
        COALESCE(OLD.assigned_to::text, ''),
        COALESCE(NEW.assigned_to::text, ''),
        v_user_id, v_source);
    END IF;

    -- ── Phase 3: review status ────────────────────────────────────────────
    IF OLD.review_status IS DISTINCT FROM NEW.review_status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'review_status',
        COALESCE(OLD.review_status, ''),
        COALESCE(NEW.review_status, ''),
        v_user_id, v_source);
    END IF;

    -- ── Phase 3: review assignment ────────────────────────────────────────
    IF OLD.review_assigned_to IS DISTINCT FROM NEW.review_assigned_to THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source)
      VALUES (NEW.id, 'review_assigned_to',
        COALESCE(OLD.review_assigned_to::text, ''),
        COALESCE(NEW.review_assigned_to::text, ''),
        v_user_id, v_source);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
