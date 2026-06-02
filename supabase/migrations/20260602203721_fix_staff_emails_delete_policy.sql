/*
  # Fix staff_emails DELETE policy

  ## Problem
  The existing DELETE policy requires `to_user_id = auth.uid()`, which only matches
  emails addressed to a specific user. Shared-inbox emails (support@, info@) have
  `to_user_id IS NULL`, so the delete silently fails — the row stays in the database
  and reappears on the next page load.

  ## Fix
  Drop the old policy and replace it with one that allows admins/workers to delete:
  - Emails addressed to themselves (to_user_id = auth.uid())
  - Shared-inbox emails (to_user_id IS NULL)
*/

DROP POLICY IF EXISTS "Staff can delete their emails" ON staff_emails;

CREATE POLICY "Staff can delete their emails"
  ON staff_emails
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin','superadmin','worker'])
    )
    AND (to_user_id = auth.uid() OR to_user_id IS NULL)
  );
