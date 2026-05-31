/*
  # Allow claim submitters to upload files

  ## Problem
  When a passenger submits a claim via ClaimPage, they upload documents (passport, booking
  confirmation, boarding pass). The claim_files table only allowed staff (admin/worker) to
  insert files, so passenger-submitted documents were never saved.

  ## Changes
  1. Adds an INSERT policy on claim_files allowing anon and authenticated users to
     upload files linked to a claim. The claim_id must reference a real claim (enforced
     by the FK constraint). uploaded_by is nullable for anon submitters.
  2. Adds a SELECT policy so that authenticated users can read files that belong to
     claims with a matching email (i.e. the passenger can see their own files in the
     dashboard — future use).

  ## Notes
  - The existing "Staff can insert claim files" policy remains for staff uploads from AdminPage.
  - No destructive changes.
*/

-- Allow passengers (anon or authenticated) to insert files when submitting a claim
CREATE POLICY "Claim submitters can upload files"
  ON claim_files FOR INSERT
  TO anon, authenticated
  WITH CHECK (claim_id IS NOT NULL);

-- Allow authenticated customers to view files on their own claims (matched by email)
CREATE POLICY "Customers can view files on own claims"
  ON claim_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims
      WHERE claims.id = claim_files.claim_id
        AND claims.email = (
          SELECT email FROM profiles WHERE profiles.id = auth.uid()
        )
    )
  );
