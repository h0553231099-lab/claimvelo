/*
  # Update claimvelo_email and add info@ inbox support

  1. Changes
    - Rename hershel.schneebalg@claimvelo.com → hershel@claimvelo.com
    - Add RLS policy so all authenticated workers/admins can read emails
      sent to info@claimvelo.com (shared domain inbox)
    - Also update any staff_emails records referencing the old address
*/

-- Rename the personal address
UPDATE profiles
SET claimvelo_email = 'hershel@claimvelo.com'
WHERE claimvelo_email = 'hershel.schneebalg@claimvelo.com';

-- Update any existing inbox emails that were sent to the old address
UPDATE staff_emails
SET to_address = 'hershel@claimvelo.com'
WHERE to_address = 'hershel.schneebalg@claimvelo.com';

-- Add RLS policy: all authenticated workers/admins can read info@ emails
CREATE POLICY "Workers and admins can read info@ inbox"
  ON staff_emails
  FOR SELECT
  TO authenticated
  USING (
    to_address = 'info@claimvelo.com'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('worker', 'admin', 'superadmin')
    )
  );
