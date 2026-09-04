-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 — Missing Information & Document Requests
--
-- Adds:
--   1. claim_info_requests table for tracking document/info requests
--   2. info_request_id column on claim_files (links uploads to requests)
--   3. RLS policies for staff and customer access
--   4. Trigger: auto-fulfill when a file is uploaded with info_request_id
--   5. Trigger: log info request events in claim_status_history
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. claim_info_requests table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_info_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  request_type    text NOT NULL DEFAULT 'document'
                    CHECK (request_type IN ('document', 'information')),
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'received', 'overdue', 'cancelled')),
  requested_by    uuid REFERENCES auth.users(id),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  due_at          timestamptz,
  fulfilled_at    timestamptz,
  fulfilled_by_file_id uuid,
  reminder_sent_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_info_requests_claim_id ON claim_info_requests(claim_id);
CREATE INDEX IF NOT EXISTS idx_info_requests_status ON claim_info_requests(status);

-- ── 2. Link claim_files to info requests ────────────────────────────────────
ALTER TABLE claim_files ADD COLUMN IF NOT EXISTS info_request_id uuid;

-- ── 3. RLS for claim_info_requests ──────────────────────────────────────────
ALTER TABLE claim_info_requests ENABLE ROW LEVEL SECURITY;

-- Staff (admin/super_admin/worker) can read all info requests
CREATE POLICY "Staff can read info_requests"
  ON claim_info_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
    OR EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_info_requests.claim_id
        AND c.customer_user_id = auth.uid()
    )
  );

-- Staff can insert info requests
CREATE POLICY "Staff can insert info_requests"
  ON claim_info_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can update info requests
CREATE POLICY "Staff can update info_requests"
  ON claim_info_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Customers can update status to 'received' (for fulfillment via upload)
CREATE POLICY "Customer can update own info_requests"
  ON claim_info_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_info_requests.claim_id
        AND c.customer_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_info_requests.claim_id
        AND c.customer_user_id = auth.uid()
    )
  );

-- ── 4. Trigger: auto-fulfill info request when file uploaded ─────────────────
CREATE OR REPLACE FUNCTION fulfill_info_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_actor_name text;
BEGIN
  -- Only act when a file is linked to an info request
  IF NEW.info_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the linked request
  SELECT * INTO v_request
  FROM claim_info_requests
  WHERE id = NEW.info_request_id AND status = 'requested';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Mark the request as fulfilled
  UPDATE claim_info_requests
  SET status = 'received',
      fulfilled_at = now(),
      fulfilled_by_file_id = NEW.id
  WHERE id = NEW.info_request_id;

  -- Log in claim_status_history
  IF NEW.uploaded_by IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.uploaded_by;
  END IF;

  INSERT INTO claim_status_history
    (claim_id, field_name, from_status, to_status, changed_by, source, actor_name, reason)
  VALUES (
    NEW.claim_id,
    'document_upload',
    'requested',
    'received',
    NEW.uploaded_by,
    'system',
    COALESCE(v_actor_name, 'Customer'),
    'Info request fulfilled: ' || v_request.title
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_files_fulfill_request ON claim_files;
CREATE TRIGGER claim_files_fulfill_request
  AFTER INSERT ON claim_files
  FOR EACH ROW EXECUTE FUNCTION fulfill_info_request();

-- ── 5. Trigger: log info request creation in claim_status_history ────────────
CREATE OR REPLACE FUNCTION log_info_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF NEW.requested_by IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.requested_by;
  END IF;

  INSERT INTO claim_status_history
    (claim_id, field_name, from_status, to_status, changed_by, source, actor_name, reason)
  VALUES (
    NEW.claim_id,
    'info_request',
    NULL,
    NEW.title,
    NEW.requested_by,
    'staff',
    v_actor_name,
    NEW.request_type || ': ' || NEW.title
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_info_requests_ai ON claim_info_requests;
CREATE TRIGGER claim_info_requests_ai
  AFTER INSERT ON claim_info_requests
  FOR EACH ROW EXECUTE FUNCTION log_info_request_created();

COMMIT;
