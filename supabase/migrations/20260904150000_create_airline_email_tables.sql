-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6 — Airline Email Integration (External Mailbox Architecture)
--
-- Google Workspace / Gmail is the SOURCE OF TRUTH for email.
-- ClaimVelo syncs emails via the Gmail API and links them to claims.
--
-- This migration creates:
--   1. airline_emails         — synced inbound/outbound airline emails
--   2. airline_email_attachments — attachments linked safely to claims
--   3. gmail_sync_state        — incremental sync cursor (historyId)
--
-- Design principles:
--   • gmail_message_id is UNIQUE → no duplicate ingestion (idempotent sync)
--   • matching_confidence: HIGH / MEDIUM / LOW / NONE / AMBIGUOUS
--   • email_status: NEW / SEEN / IN_PROGRESS / WAITING / RESOLVED / ESCALATED
--   • claim_status_history gets 'airline_email' events for timeline
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. airline_emails ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS airline_emails (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id    text NOT NULL,            -- Gmail RFC822 Message-ID — idempotency key
  thread_id           text NOT NULL DEFAULT '',
  direction           text NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  from_address        text NOT NULL DEFAULT '',
  from_name           text NOT NULL DEFAULT '',
  to_address          text NOT NULL DEFAULT '',  -- comma-separated recipients
  cc_address          text NOT NULL DEFAULT '',
  subject             text NOT NULL DEFAULT '',
  body_text           text NOT NULL DEFAULT '',
  body_html           text NOT NULL DEFAULT '',
  snippet             text NOT NULL DEFAULT '',  -- short preview
  received_at         timestamptz,               -- Gmail internalDate
  sent_at            timestamptz,               -- for outbound

  -- Claim matching
  claim_id            uuid REFERENCES claims(id) ON DELETE SET NULL,
  matching_confidence text NOT NULL DEFAULT 'NONE',  -- HIGH/MEDIUM/LOW/NONE/AMBIGUOUS
  matched_fields      jsonb NOT NULL DEFAULT '{}',   -- which fields drove the match
  matched_claim_refs  text[] NOT NULL DEFAULT '{}',  -- all candidate claim refs (for AMBIGUOUS)

  -- Workflow
  email_status        text NOT NULL DEFAULT 'NEW',   -- NEW/SEEN/IN_PROGRESS/WAITING/RESOLVED/ESCALATED
  assigned_to         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  next_action         text NOT NULL DEFAULT '',
  due_at              timestamptz,

  -- Attachments
  has_attachments     boolean NOT NULL DEFAULT false,
  attachment_count    integer NOT NULL DEFAULT 0,

  -- Sync metadata
  sync_batch_id       text NOT NULL DEFAULT '',
  raw_headers         jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one row per Gmail message, per direction
CREATE UNIQUE INDEX IF NOT EXISTS uq_airline_emails_gmail_msg_id
  ON airline_emails (gmail_message_id);

ALTER TABLE airline_emails ENABLE ROW LEVEL SECURITY;

-- Staff can read all airline emails
CREATE POLICY "Staff can read airline emails"
  ON airline_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can update (status, assignment, matching)
CREATE POLICY "Staff can update airline emails"
  ON airline_emails FOR UPDATE
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

-- Staff can insert (manual entry / edge function with auth)
CREATE POLICY "Staff can insert airline emails"
  ON airline_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can delete
CREATE POLICY "Staff can delete airline emails"
  ON airline_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_airline_emails_claim_id
  ON airline_emails (claim_id);
CREATE INDEX IF NOT EXISTS idx_airline_emails_status
  ON airline_emails (email_status);
CREATE INDEX IF NOT EXISTS idx_airline_emails_confidence
  ON airline_emails (matching_confidence);
CREATE INDEX IF NOT EXISTS idx_airline_emails_received_at
  ON airline_emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_airline_emails_assigned_to
  ON airline_emails (assigned_to);

-- ── 2. airline_email_attachments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS airline_email_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id            uuid NOT NULL REFERENCES airline_emails(id) ON DELETE CASCADE,
  claim_id            uuid REFERENCES claims(id) ON DELETE SET NULL,
  gmail_attachment_id text NOT NULL DEFAULT '',
  file_name            text NOT NULL DEFAULT '',
  content_type         text NOT NULL DEFAULT '',
  file_size            bigint NOT NULL DEFAULT 0,
  storage_path         text NOT NULL DEFAULT '',  -- Supabase Storage path
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE airline_email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read email attachments"
  ON airline_email_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Staff can insert email attachments"
  ON airline_email_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Staff can update email attachments"
  ON airline_email_attachments FOR UPDATE
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

CREATE POLICY "Staff can delete email attachments"
  ON airline_email_attachments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE INDEX IF NOT EXISTS idx_airline_email_attachments_email_id
  ON airline_email_attachments (email_id);
CREATE INDEX IF NOT EXISTS idx_airline_email_attachments_claim_id
  ON airline_email_attachments (claim_id);

-- ── 3. gmail_sync_state ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmail_sync_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_email   text NOT NULL UNIQUE,  -- the Gmail address being synced
  history_id      text,                  -- Gmail historyId cursor
  last_synced_at  timestamptz,
  sync_status     text NOT NULL DEFAULT 'idle',  -- idle / running / error
  last_error      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read gmail sync state"
  ON gmail_sync_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Only service_role can write (edge function manages sync state)

CREATE INDEX IF NOT EXISTS idx_gmail_sync_state_mailbox
  ON gmail_sync_state (mailbox_email);

-- ── 4. updated_at trigger for airline_emails ────────────────────────────────
CREATE OR REPLACE FUNCTION update_airline_email_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS airline_emails_updated_at ON airline_emails;
CREATE TRIGGER airline_emails_updated_at
  BEFORE UPDATE ON airline_emails
  FOR EACH ROW EXECUTE FUNCTION update_airline_email_updated_at();

-- ── 5. Storage bucket for airline email attachments ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('airline-email-attachments', 'airline-email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: staff can read/write attachments
CREATE POLICY "Staff can read airline email attachments storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'airline-email-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Staff can upload airline email attachments storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'airline-email-attachments'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

COMMIT;
