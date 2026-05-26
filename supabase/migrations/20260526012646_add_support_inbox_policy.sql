/*
  # Add Support Inbox Access Policy

  Allows admin and superadmin users to read emails sent to support@claimvelo.com.
  Previously only emails with to_user_id = auth.uid() or to_user_id IS NULL were visible.
  This adds an explicit policy for the shared support address.

  1. Changes
    - New SELECT policy: admins/superadmins can read emails addressed to support@claimvelo.com
*/

CREATE POLICY "Admins can read support inbox emails"
  ON staff_emails FOR SELECT
  TO authenticated
  USING (
    to_address = 'support@claimvelo.com'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );
