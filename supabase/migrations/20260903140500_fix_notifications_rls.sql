/*
  # Fix notifications RLS — restrict anonymous insertion

  ## Previous policy:
  - "Anon can insert notifications" — WITH CHECK(true), anyone can inject
    fake notifications into the system.

  ## New model:
  - Anon INSERT is removed. Direct INSERT is restricted to staff only.
  - Claim submission notifications are inserted by the create-claim edge
    function (which uses service_role, bypassing RLS).
  - A SECURITY DEFINER RPC function allows the edge function and other
    server-side code to insert notifications with type validation.
*/

DROP POLICY IF EXISTS "Anon can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated staff can insert notifications" ON notifications;

-- Staff can insert notifications
CREATE POLICY "Staff can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Keep existing SELECT and UPDATE policies for staff
-- (They already check role IN ('admin', 'worker') — but update to include super_admin)
DROP POLICY IF EXISTS "Authenticated staff can view notifications" ON notifications;
CREATE POLICY "Staff can view notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can update notifications" ON notifications;
CREATE POLICY "Staff can update notifications"
  ON notifications FOR UPDATE
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
