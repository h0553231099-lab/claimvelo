/*
  # Add sales_manager and agent roles

  1. Changes
    - Add 'manager_id' to worker_profiles so agents belong to a sales manager
    - Update RLS: sales_managers can view/create/update agents they own
    - Agents will use 'agent' role in profiles table (existing role column is text, no constraint)

  2. New columns
    - worker_profiles.manager_id — which sales manager owns this agent
*/

-- Add manager_id to worker_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_profiles' AND column_name = 'manager_id'
  ) THEN
    ALTER TABLE worker_profiles ADD COLUMN manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for fast manager lookups
CREATE INDEX IF NOT EXISTS worker_profiles_manager_id_idx ON worker_profiles(manager_id);

-- Drop old policies that may conflict, then recreate
DROP POLICY IF EXISTS "Admins can view all worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Admins can insert worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Admins can update worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Admins can delete worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Anyone can validate agent codes" ON worker_profiles;
DROP POLICY IF EXISTS "Sales managers can view their agents" ON worker_profiles;
DROP POLICY IF EXISTS "Sales managers can insert agents" ON worker_profiles;
DROP POLICY IF EXISTS "Sales managers can update their agents" ON worker_profiles;

-- SELECT: admins see all, sales_managers see own agents, users see their own profile
CREATE POLICY "Staff can view worker profiles"
  ON worker_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR manager_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- SELECT for anon: allow agent code validation on claim form
CREATE POLICY "Anon can validate agent codes"
  ON worker_profiles FOR SELECT
  TO anon
  USING (true);

-- INSERT: admins and sales_managers can add agents
CREATE POLICY "Staff can insert worker profiles"
  ON worker_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'sales_manager')
    )
  );

-- UPDATE: admins and the managing sales_manager can update
CREATE POLICY "Staff can update worker profiles"
  ON worker_profiles FOR UPDATE
  TO authenticated
  USING (
    manager_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    manager_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- DELETE: admins only
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
