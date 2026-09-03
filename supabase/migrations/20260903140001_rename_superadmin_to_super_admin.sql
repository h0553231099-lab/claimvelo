/*
  # Rename role 'superadmin' → 'super_admin'

  Keeps admin and super_admin as separate roles.
  - admin: staff manager (claims, CRM, workers)
  - super_admin: full system owner (finance, settings, everything)

  ## Changes
  1. Update the profiles role CHECK constraint to include 'super_admin'.
  2. Migrate any existing 'superadmin' rows to 'super_admin'.
  3. Drop and recreate every RLS policy that references 'superadmin'
     to use 'super_admin' instead.
*/

-- Step 1: Update the CHECK constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'super_admin', 'worker', 'customer', 'sales_manager', 'agent', 'seo_worker'));

-- Step 2: Migrate existing data
UPDATE public.profiles SET role = 'super_admin' WHERE role = 'superadmin';

-- Step 3: Recreate RLS policies that referenced 'superadmin'

-- worker_profiles policies
DROP POLICY IF EXISTS "Admins can view all worker profiles" ON worker_profiles;
CREATE POLICY "Admins can view all worker profiles"
  ON worker_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins can insert worker profiles" ON worker_profiles;
CREATE POLICY "Admins can insert worker profiles"
  ON worker_profiles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Admins can update worker profiles" ON worker_profiles;
CREATE POLICY "Admins can update worker profiles"
  ON worker_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Admins can delete worker profiles" ON worker_profiles;
CREATE POLICY "Admins can delete worker profiles"
  ON worker_profiles FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Staff can view worker profiles (includes super_admin)
DROP POLICY IF EXISTS "Staff can view worker profiles" ON worker_profiles;
CREATE POLICY "Staff can view worker profiles"
  ON worker_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Staff can insert worker profiles" ON worker_profiles;
CREATE POLICY "Staff can insert worker profiles"
  ON worker_profiles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'sales_manager'))
  );

DROP POLICY IF EXISTS "Staff can update worker profiles" ON worker_profiles;
CREATE POLICY "Staff can update worker profiles"
  ON worker_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'sales_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'sales_manager'))
  );

-- internal_messages policies
DROP POLICY IF EXISTS "Staff can view internal messages" ON internal_messages;
CREATE POLICY "Staff can view internal messages"
  ON internal_messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can send internal messages" ON internal_messages;
CREATE POLICY "Staff can send internal messages"
  ON internal_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can update internal messages" ON internal_messages;
CREATE POLICY "Staff can update internal messages"
  ON internal_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can delete internal messages" ON internal_messages;
CREATE POLICY "Staff can delete internal messages"
  ON internal_messages FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

-- staff_emails policies
DROP POLICY IF EXISTS "Staff can view staff emails" ON staff_emails;
CREATE POLICY "Staff can view staff emails"
  ON staff_emails FOR SELECT TO authenticated
  USING (
    to_user_id = auth.uid()
    OR to_user_id IS NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can insert staff emails" ON staff_emails;
CREATE POLICY "Staff can insert staff emails"
  ON staff_emails FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can update staff emails" ON staff_emails;
CREATE POLICY "Staff can update staff emails"
  ON staff_emails FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can delete staff emails" ON staff_emails;
CREATE POLICY "Staff can delete staff emails"
  ON staff_emails FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- claim_files staff policies
DROP POLICY IF EXISTS "Staff can view claim files" ON claim_files;
CREATE POLICY "Staff can view claim files"
  ON claim_files FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can insert claim files" ON claim_files;
CREATE POLICY "Staff can insert claim files"
  ON claim_files FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'worker'))
  );

DROP POLICY IF EXISTS "Staff can delete claim files" ON claim_files;
CREATE POLICY "Staff can delete claim files"
  ON claim_files FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );
