/*
  # Fix finance RLS — restrict to admin and super_admin only

  Previous policies allowed ANY authenticated user to view, insert,
  update, and delete finance transactions. Now restricted to admin
  and super_admin roles only.
*/

DROP POLICY IF EXISTS "Authenticated users can view finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can update finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can delete finance transactions" ON finance_transactions;

CREATE POLICY "Admins can view finance transactions"
  ON finance_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert finance transactions"
  ON finance_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update finance transactions"
  ON finance_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete finance transactions"
  ON finance_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );
