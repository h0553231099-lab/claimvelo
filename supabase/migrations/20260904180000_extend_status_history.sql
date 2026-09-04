-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 — Extend claim_status_history for full timeline support
--
-- Extends the claim_status_history table to track additional event types
-- beyond operational status and eligibility:
--   - priority changes
--   - assignment / reassignment
--   - document uploads (via claim_files trigger)
--   - admin eligibility overrides
--
-- Also adds an actor_name column so the UI can display who performed each
-- action without joining auth.users (which is not accessible via RLS).
--
-- This migration does NOT change existing RLS policies — the staff SELECT
-- policy on claim_status_history already covers the new rows.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Add actor_name column ─────────────────────────────────────────────────
ALTER TABLE claim_status_history ADD COLUMN IF NOT EXISTS actor_name text;

-- ── 2. Backfill actor_name for existing rows ─────────────────────────────────
UPDATE claim_status_history h
SET actor_name = p.full_name
FROM profiles p
WHERE h.changed_by = p.id
  AND h.actor_name IS NULL;

-- ── 3. Extended trigger function for claims ─────────────────────────────────
-- Replaces the Phase 1 version. Now tracks:
--   status, eligibility_status, priority, assigned_to, override_decision
-- Also populates actor_name from profiles.full_name.
CREATE OR REPLACE FUNCTION record_claim_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_source     text := CASE WHEN v_user_id IS NOT NULL THEN 'staff' ELSE 'system' END;
  v_actor_name text;
  v_old_name   text;
  v_new_name   text;
BEGIN
  -- Resolve actor name from profiles
  IF v_user_id IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
    VALUES (NEW.id, 'status', NULL, NEW.status, v_user_id, 'insert', v_actor_name);

    IF NEW.eligibility_status IS NOT NULL THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'eligibility_status', NULL, NEW.eligibility_status, v_user_id, 'insert', v_actor_name);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Operational status
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'status', OLD.status, NEW.status, v_user_id, v_source, v_actor_name);
    END IF;

    -- Eligibility status
    IF OLD.eligibility_status IS DISTINCT FROM NEW.eligibility_status THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'eligibility_status', OLD.eligibility_status, NEW.eligibility_status, v_user_id, v_source, v_actor_name);
    END IF;

    -- Priority
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'priority', OLD.priority, NEW.priority, v_user_id, v_source, v_actor_name);
    END IF;

    -- Assignment / reassignment (store resolved names for readability)
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_old_name := NULL;
      v_new_name := NULL;
      IF OLD.assigned_to IS NOT NULL THEN
        SELECT full_name INTO v_old_name FROM profiles WHERE id = OLD.assigned_to;
      END IF;
      IF NEW.assigned_to IS NOT NULL THEN
        SELECT full_name INTO v_new_name FROM profiles WHERE id = NEW.assigned_to;
      END IF;
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'assigned_to',
              COALESCE(v_old_name, 'Unassigned'),
              COALESCE(v_new_name, 'Unassigned'),
              v_user_id, v_source, v_actor_name);
    END IF;

    -- Admin override
    IF OLD.override_decision IS DISTINCT FROM NEW.override_decision THEN
      INSERT INTO claim_status_history
        (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
      VALUES (NEW.id, 'override',
              NULLIF(OLD.override_decision, ''),
              NULLIF(NEW.override_decision, ''),
              v_user_id, v_source, v_actor_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Document upload trigger on claim_files ────────────────────────────────
-- Inserts a 'document_upload' event whenever a file is attached to a claim.
CREATE OR REPLACE FUNCTION record_document_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF NEW.uploaded_by IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.uploaded_by;
  END IF;

  INSERT INTO claim_status_history
    (claim_id, field_name, from_status, to_status, changed_by, source, actor_name)
  VALUES (NEW.claim_id, 'document_upload', NULL, NEW.file_name, NEW.uploaded_by, 'staff', v_actor_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_files_status_history_ai ON claim_files;
CREATE TRIGGER claim_files_status_history_ai
  AFTER INSERT ON claim_files
  FOR EACH ROW EXECUTE FUNCTION record_document_upload();

COMMIT;
