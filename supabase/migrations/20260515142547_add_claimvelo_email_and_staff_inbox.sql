/*
  # Staff @claimvelo.com Email Addresses & Inbox

  1. Changes to `profiles` table
    - Add `claimvelo_email` column: each staff member's assigned @claimvelo.com address
      (e.g., john.smith@claimvelo.com, auto-derived from full_name)

  2. New Table: `staff_emails`
    - Stores inbound emails received at @claimvelo.com addresses via Resend webhook
    - `id` (uuid, primary key)
    - `to_address` (text) — the @claimvelo.com address the email was sent TO
    - `to_user_id` (uuid, nullable FK to profiles) — resolved staff member
    - `from_address` (text) — sender's email
    - `from_name` (text) — sender's display name
    - `subject` (text)
    - `body_text` (text) — plain text body
    - `body_html` (text) — HTML body
    - `read_by` (uuid[]) — staff user IDs who have read it
    - `raw_payload` (jsonb) — full Resend webhook payload
    - `received_at` (timestamptz)

  3. Security
    - RLS enabled on staff_emails
    - Staff can only read emails addressed to them or where to_user_id is null (broadcast)
    - Service role only can insert (via edge function webhook)
*/

-- Add claimvelo_email column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'claimvelo_email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN claimvelo_email text DEFAULT '';
  END IF;
END $$;

-- Auto-assign claimvelo_email for existing staff who don't have one yet
-- Derives from full_name: "John Smith" -> "john.smith@claimvelo.com"
UPDATE profiles
SET claimvelo_email = (
  lower(
    regexp_replace(
      regexp_replace(trim(full_name), '\s+', '.', 'g'),
      '[^a-z0-9.]', '', 'g'
    )
  ) || '@claimvelo.com'
)
WHERE (claimvelo_email IS NULL OR claimvelo_email = '')
  AND role IN ('admin', 'superadmin', 'worker')
  AND full_name IS NOT NULL
  AND full_name != '';

-- Create staff_emails table
CREATE TABLE IF NOT EXISTS staff_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address text NOT NULL DEFAULT '',
  to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  from_address text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  read_by uuid[] NOT NULL DEFAULT '{}',
  raw_payload jsonb,
  received_at timestamptz DEFAULT now()
);

ALTER TABLE staff_emails ENABLE ROW LEVEL SECURITY;

-- Staff can read emails addressed to them
CREATE POLICY "Staff can read their own emails"
  ON staff_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
    AND (
      to_user_id = auth.uid()
      OR to_user_id IS NULL
    )
  );

-- Staff can update emails (mark as read)
CREATE POLICY "Staff can update email read status"
  ON staff_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
    AND (to_user_id = auth.uid() OR to_user_id IS NULL)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Staff can delete their own emails
CREATE POLICY "Staff can delete their emails"
  ON staff_emails FOR DELETE
  TO authenticated
  USING (
    to_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

CREATE INDEX IF NOT EXISTS staff_emails_to_user_idx ON staff_emails(to_user_id);
CREATE INDEX IF NOT EXISTS staff_emails_to_address_idx ON staff_emails(to_address);
CREATE INDEX IF NOT EXISTS staff_emails_received_at_idx ON staff_emails(received_at DESC);
