/*
  # Create notifications table

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `type` (text) — 'new_claim' | 'stale_in_progress' | 'stale_waiting' | 'status_changed'
      - `claim_ref` (text) — the claim reference e.g. CLM-001
      - `claim_id` (uuid, FK to claims)
      - `message` (text) — human-readable description
      - `read` (boolean, default false)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Authenticated users (staff/admin) can read all notifications
    - Authenticated users can update (mark as read)
    - Service role inserts via edge function / trigger
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  claim_ref text NOT NULL DEFAULT '',
  claim_id uuid REFERENCES claims(id) ON DELETE CASCADE,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated staff can update notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated staff can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_claim_id_idx ON notifications(claim_id);
