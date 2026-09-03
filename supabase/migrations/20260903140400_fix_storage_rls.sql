/*
  # Fix storage RLS — private documents with server-side signed URLs

  ## Previous policies:
  - "Anyone can upload claim files" — anon+authenticated INSERT, no ownership check
  - "Staff can read claim files" — staff SELECT
  - "Staff can delete claim files" — staff DELETE

  ## New model:
  - No direct INSERT/SELECT/DELETE for anon or authenticated on storage.objects
    for the claim-files bucket.
  - All file access goes through edge functions (create-claim, claim-file-url)
    that use the service_role key to generate short-lived signed URLs.
  - The service_role bypasses RLS, so edge functions can read/write freely.
  - Customers never get direct storage access — only time-limited signed URLs.

  ## claim_files table RLS:
  - Staff can SELECT/INSERT/DELETE (for admin file management)
  - Customers can SELECT files for claims they own (customer_user_id match)
  - No anon access to claim_files
*/

-- ── Storage bucket policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can upload claim files" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read claim files" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete claim files" ON storage.objects;

-- Staff (admin/super_admin/worker) can directly read, upload, and delete
-- files in the claim-files bucket. Customers do NOT get direct access —
-- they receive short-lived signed URLs via the claim-file-url edge function.
CREATE POLICY "Staff can read claim files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'claim-files'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Staff can upload claim files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'claim-files'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

CREATE POLICY "Staff can delete claim files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'claim-files'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- ── claim_files table RLS ────────────────────────────────────────────────────
-- Drop existing policies
DROP POLICY IF EXISTS "Claim submitters can upload files" ON claim_files;
DROP POLICY IF EXISTS "Customers can view files on own claims" ON claim_files;
DROP POLICY IF EXISTS "Staff can view claim files" ON claim_files;
DROP POLICY IF EXISTS "Staff can insert claim files" ON claim_files;
DROP POLICY IF EXISTS "Staff can delete claim files" ON claim_files;

-- Staff can view all claim files
CREATE POLICY "Staff can view claim files"
  ON claim_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can insert claim files (admin upload from dashboard)
CREATE POLICY "Staff can insert claim files"
  ON claim_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- Staff can delete claim files
CREATE POLICY "Staff can delete claim files"
  ON claim_files FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Customers can view files for claims they own (by customer_user_id)
CREATE POLICY "Customers can view own claim files"
  ON claim_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims
      WHERE claims.id = claim_files.claim_id
        AND claims.customer_user_id = auth.uid()
    )
  );
