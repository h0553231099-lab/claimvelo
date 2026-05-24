/*
  # Internal Messaging System

  Adds a real DB-backed internal message/email thread system for admins and workers.

  1. New Tables
    - `internal_messages`
      - id, subject, body, from_user_id, to_user_id (null = broadcast to all staff)
      - claim_id (optional FK to claims for context)
      - parent_id (optional FK for threading/replies)
      - read_by (uuid[]) - array of user IDs who have read this message
      - created_at

  2. Security
    - RLS enabled
    - Only admin/worker roles can read/insert messages
    - Only sender can delete their own messages
*/

CREATE TABLE IF NOT EXISTS internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_name text NOT NULL DEFAULT '',
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES internal_messages(id) ON DELETE CASCADE,
  read_by uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;

-- Staff can view messages sent to them or broadcast (to_user_id IS NULL) or sent by them
CREATE POLICY "Staff can view relevant messages"
  ON internal_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
    AND (
      to_user_id IS NULL
      OR to_user_id = auth.uid()
      OR from_user_id = auth.uid()
    )
  );

-- Staff can send messages
CREATE POLICY "Staff can insert messages"
  ON internal_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Staff can update messages (e.g. mark as read)
CREATE POLICY "Staff can update messages"
  ON internal_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Sender can delete their own messages
CREATE POLICY "Sender can delete own messages"
  ON internal_messages FOR DELETE
  TO authenticated
  USING (from_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS internal_messages_to_user_idx ON internal_messages(to_user_id);
CREATE INDEX IF NOT EXISTS internal_messages_from_user_idx ON internal_messages(from_user_id);
CREATE INDEX IF NOT EXISTS internal_messages_claim_idx ON internal_messages(claim_id);
CREATE INDEX IF NOT EXISTS internal_messages_created_at_idx ON internal_messages(created_at DESC);
