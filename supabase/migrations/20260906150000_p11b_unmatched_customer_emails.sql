-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 11B — Unmatched Customer Email Review Queue
--
-- Customer email replies that cannot be safely matched to a single claim
-- (unmatched or ambiguous) must NEVER be discarded or console-only.
-- They are stored in this table for staff review and manual linking.
--
-- RLS: staff-only (admin/super_admin/worker SELECT; admin/super_admin UPDATE
-- for linking/ignoring). The process-customer-replies edge function inserts
-- via service-role key (bypasses RLS).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS unmatched_customer_emails (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id        text,
  from_address            text NOT NULL,
  from_name               text NOT NULL DEFAULT '',
  to_address              text NOT NULL DEFAULT '',
  subject                 text NOT NULL DEFAULT '',
  body                    text NOT NULL DEFAULT '',
  received_at             timestamptz NOT NULL DEFAULT now(),
  match_status             text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'ambiguous', 'linked', 'ignored')),
  candidate_claim_refs    text[] NOT NULL DEFAULT '{}',
  candidate_claim_ids     uuid[] NOT NULL DEFAULT '{}',
  linked_claim_id         uuid REFERENCES claims(id) ON DELETE SET NULL,
  linked_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  linked_at              timestamptz,
  attachment_count        integer NOT NULL DEFAULT 0,
  attachment_filenames    jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachment_storage_paths text[] NOT NULL DEFAULT '{}',
  reviewed                boolean NOT NULL DEFAULT false,
  reviewed_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_emails_status
  ON unmatched_customer_emails(match_status)
  WHERE match_status IN ('unmatched', 'ambiguous');

CREATE INDEX IF NOT EXISTS idx_unmatched_emails_unreviewed
  ON unmatched_customer_emails(created_at DESC)
  WHERE reviewed = false;

ALTER TABLE unmatched_customer_emails ENABLE ROW LEVEL SECURITY;

-- Staff (admin/super_admin/worker) can read all unmatched emails
CREATE POLICY "Staff can read unmatched emails"
  ON unmatched_customer_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Admin/super_admin can update (for manual linking / ignoring)
CREATE POLICY "Admin can update unmatched emails"
  ON unmatched_customer_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Staff can insert (edge function uses service-role, bypasses RLS;
-- this policy covers any authenticated staff caller)
CREATE POLICY "Staff can insert unmatched emails"
  ON unmatched_customer_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'worker')
    )
  );

COMMIT;
