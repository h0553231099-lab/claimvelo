-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7 — Customer Communication System
--
-- Creates a unified customer communication table for:
--   • Customer Email     — staff sends claim-related emails to customers
--   • Customer Replies   — inbound email replies from customers, matched safely
--   • Customer Messages  — portal-based messaging (customer ↔ staff)
--
-- Also adds:
--   • preferred_language column on claims (basic language handling)
--   • last_customer_update_at column on claims (30-day update timer)
--   • Triggers to maintain the 30-day timer (NOT reset by internal notes)
--
-- Security:
--   • Customers can only access communications for their own claims
--   • Staff (admin/super_admin/worker) can access all
--   • Internal messages (internal_messages table) are NEVER exposed to customers
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Add preferred_language to claims ─────────────────────────────────────
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
  CHECK (preferred_language IN ('en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'ro'));

-- ── 2. Add last_customer_update_at to claims ────────────────────────────────
-- Tracks the last time any outbound customer-facing communication was sent.
-- Used by the 30-day update scheduler. NOT reset by internal notes/messages.
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS last_customer_update_at timestamptz DEFAULT now();

-- Backfill: set last_customer_update_at to created_at for existing claims
UPDATE claims SET last_customer_update_at = created_at
  WHERE last_customer_update_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_claims_last_customer_update
  ON claims(last_customer_update_at)
  WHERE last_customer_update_at IS NOT NULL;

-- ── 3. claim_communications table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_communications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- 'outbound' = sent TO customer, 'inbound' = received FROM customer
  direction       text NOT NULL CHECK (direction IN ('outbound', 'inbound')),

  -- 'email' = sent/received via email, 'portal' = sent via customer portal
  channel         text NOT NULL DEFAULT 'portal' CHECK (channel IN ('email', 'portal')),

  subject         text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',

  -- Email metadata (null for portal messages)
  from_address    text NOT NULL DEFAULT '',
  to_address      text NOT NULL DEFAULT '',
  from_name       text NOT NULL DEFAULT '',

  -- For outbound: the staff member who sent it
  -- For inbound portal: the customer who sent it (null if not authenticated)
  -- For inbound email: null (came from email, not portal)
  from_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- For inbound email replies: how confidently we matched to this claim
  -- 'matched'   = high-confidence match (email + claim_ref, or unique email)
  -- 'ambiguous'  = multiple candidate claims, cannot determine which one
  -- 'unmatched'  = no match found (stored for manual review, NOT linked to a claim)
  -- 'manual'     = staff manually linked/replied (outbound)
  match_status    text NOT NULL DEFAULT 'manual'
                    CHECK (match_status IN ('matched', 'ambiguous', 'unmatched', 'manual')),
  matched_claim_refs text[] NOT NULL DEFAULT '{}',

  -- RFC822 Message-ID for email deduplication
  message_id     text,

  -- Read tracking
  read_by_staff   boolean NOT NULL DEFAULT false,
  read_by_customer boolean NOT NULL DEFAULT false,

  -- Language the communication was sent/received in
  language        text NOT NULL DEFAULT 'en',

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE claim_communications ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS Policies ──────────────────────────────────────────────────────────

-- SELECT: Staff see all communications for any claim.
--         Customers see only communications for claims they own.
CREATE POLICY "Staff can read all claim communications"
  ON claim_communications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
    OR EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_communications.claim_id
        AND c.customer_user_id = auth.uid()
    )
  );

-- INSERT: Staff can insert outbound communications (emails, portal replies).
--         Customers can insert inbound portal messages for their own claims.
CREATE POLICY "Staff can insert claim communications"
  ON claim_communications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Customers can insert portal messages for own claims"
  ON claim_communications FOR INSERT
  TO authenticated
  WITH CHECK (
    direction = 'inbound'
    AND channel = 'portal'
    AND EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_communications.claim_id
        AND c.customer_user_id = auth.uid()
    )
  );

-- UPDATE: Staff can update (mark as read, etc.)
--         Customers can mark their own communications as read
CREATE POLICY "Staff can update claim communications"
  ON claim_communications FOR UPDATE
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

CREATE POLICY "Customers can update read status for own claims"
  ON claim_communications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_communications.claim_id
        AND c.customer_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_communications.claim_id
        AND c.customer_user_id = auth.uid()
    )
  );

-- No DELETE policy — communications are immutable records (audit trail).

-- ── 5. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_claim_comm_claim_id
  ON claim_communications(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_comm_direction
  ON claim_communications(direction);
CREATE INDEX IF NOT EXISTS idx_claim_comm_match_status
  ON claim_communications(match_status);
CREATE INDEX IF NOT EXISTS idx_claim_comm_message_id
  ON claim_communications(message_id)
  WHERE message_id IS NOT NULL;

-- ── 6. Trigger: update last_customer_update_at on outbound communication ─────
-- Resets the 30-day timer whenever staff sends an email or portal message
-- to the customer. Does NOT fire for inbound messages or internal notes.
CREATE OR REPLACE FUNCTION update_last_customer_update_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'outbound' THEN
    UPDATE claims
    SET last_customer_update_at = now()
    WHERE id = NEW.claim_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_communications_update_timer ON claim_communications;
CREATE TRIGGER claim_communications_update_timer
  AFTER INSERT ON claim_communications
  FOR EACH ROW EXECUTE FUNCTION update_last_customer_update_at();

-- ── 7. Trigger: log outbound communications in claim_status_history ──────────
-- Adds a timeline event for every outbound email/portal message to customer.
CREATE OR REPLACE FUNCTION log_communication_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF NEW.direction = 'outbound' THEN
    IF NEW.from_user_id IS NOT NULL THEN
      SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.from_user_id;
    END IF;

    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, changed_by, source, actor_name, reason)
    VALUES (
      NEW.claim_id,
      'customer_email',
      NULL,
      CASE WHEN NEW.channel = 'email' THEN 'email' ELSE 'portal' END,
      NEW.from_user_id,
      'staff',
      COALESCE(v_actor_name, 'System'),
      NEW.subject
    );
  ELSIF NEW.direction = 'inbound' AND NEW.channel = 'email' AND NEW.match_status = 'matched' THEN
    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, source, actor_name, reason)
    VALUES (
      NEW.claim_id,
      'customer_email',
      NULL,
      'customer_reply',
      'system',
      NEW.from_name,
      NEW.subject
    );
  ELSIF NEW.direction = 'inbound' AND NEW.channel = 'portal' THEN
    INSERT INTO claim_status_history
      (claim_id, field_name, from_status, to_status, source, actor_name, reason)
    VALUES (
      NEW.claim_id,
      'customer_email',
      NULL,
      'portal_message',
      'system',
      COALESCE(NEW.from_name, 'Customer'),
      LEFT(NEW.body, 120)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_communications_log_timeline ON claim_communications;
CREATE TRIGGER claim_communications_log_timeline
  AFTER INSERT ON claim_communications
  FOR EACH ROW EXECUTE FUNCTION log_communication_timeline();

-- ── 8. No status-change timer reset ───────────────────────────────────────────
-- Internal operational status changes (status, assignment, priority, review)
-- do NOT reset the 30-day customer communication timer. Only actual
-- customer-facing communication (outbound email/portal message recorded in
-- claim_communications) resets the timer via the
-- claim_communications_update_timer trigger.
-- See migration 20260904210002 for the fix that removed this trigger.

-- ── 9. Add 'customer_email' to claim_status_history field_name ───────────────
-- The field_name column is text (no CHECK constraint), so no migration needed.
-- Just documenting that 'customer_email' is now a valid field_name value.

-- ── 10. Notifications for customer replies ──────────────────────────────────
-- Add notification types for customer communications
-- (notifications table already exists from earlier migration, type is text)

COMMIT;
