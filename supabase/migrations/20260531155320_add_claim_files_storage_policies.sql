/*
  # Storage policies for claim-files bucket

  Allows:
  - Anyone (anon + authenticated) to upload files into the claim-files bucket
    (passengers submitting claims use the anon key)
  - Authenticated staff (admin/superadmin/worker) to read and delete files
*/

-- Allow anyone to upload to claim-files bucket
CREATE POLICY "Anyone can upload claim files"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'claim-files');

-- Allow staff to read claim files
CREATE POLICY "Staff can read claim files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'claim-files'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Allow staff to delete claim files
CREATE POLICY "Staff can delete claim files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'claim-files'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );
