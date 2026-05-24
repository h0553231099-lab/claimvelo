/*
  # Add Workers Management and Claim Files

  1. New Tables
    - `worker_profiles`
      - Stores admin-invited worker accounts linked to auth.users
      - Fields: id (uuid), user_id (uuid, FK auth.users), email, full_name, role (worker/admin), created_by, created_at, status (active/inactive)
    - `claim_files`
      - Files attached to claims by admin/workers
      - Fields: id, claim_id (FK claims), uploaded_by, file_name, file_size, file_type, storage_path, created_at

  2. Security
    - RLS enabled on both tables
    - worker_profiles: admins can read/insert/update; workers can read own row
    - claim_files: admins and workers can read/insert; only uploader can delete
*/

-- Worker profiles table
CREATE TABLE IF NOT EXISTS worker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'worker',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;

-- Admins can view all worker profiles
CREATE POLICY "Admins can view all worker profiles"
  ON worker_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
    OR user_id = auth.uid()
  );

-- Admins can insert worker profiles
CREATE POLICY "Admins can insert worker profiles"
  ON worker_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Admins can update worker profiles
CREATE POLICY "Admins can update worker profiles"
  ON worker_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Admins can delete worker profiles
CREATE POLICY "Admins can delete worker profiles"
  ON worker_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Claim files table
CREATE TABLE IF NOT EXISTS claim_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES claims(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE claim_files ENABLE ROW LEVEL SECURITY;

-- Authenticated admins/workers can view claim files
CREATE POLICY "Staff can view claim files"
  ON claim_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Staff can insert claim files
CREATE POLICY "Staff can insert claim files"
  ON claim_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'worker')
    )
  );

-- Only uploader can delete their own files
CREATE POLICY "Uploader can delete own claim files"
  ON claim_files FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Index for fast lookup by claim
CREATE INDEX IF NOT EXISTS claim_files_claim_id_idx ON claim_files(claim_id);
CREATE INDEX IF NOT EXISTS worker_profiles_user_id_idx ON worker_profiles(user_id);
