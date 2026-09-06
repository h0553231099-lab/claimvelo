/*
  # Fix worker_profiles RLS — restore manager_id = auth.uid()

  ## Problem
  Migration 20260903140001 (rename superadmin → super_admin) recreated the
  worker_profiles SELECT and UPDATE policies but DROPPED the
  `manager_id = auth.uid()` condition that was introduced in 20260517172027.

  Consequences:
    - Sales managers could no longer SELECT their own agents' profiles
      (only admins/super_admins/workers and the agent's own user_id).
    - The claims RLS subquery (Phase 8A p8a_03) that joins worker_profiles
      for sales-manager access returned zero rows because the sales manager
      had no visible worker_profiles rows — recursive RLS starvation.
    - The UPDATE policy allowed ANY sales_manager to update ANY agent,
      not just the agents they manage.

  ## Fix
  Recreate the SELECT and UPDATE policies with `manager_id = auth.uid()`
  restored. Keep the broadened role list (admin, super_admin, worker for
  SELECT; admin, super_admin, sales_manager for INSERT) from 20260903140001.
*/

BEGIN;

-- ── SELECT: restore manager_id = auth.uid() ──────────────────────────────────
DROP POLICY IF EXISTS "Staff can view worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Admins can view all worker profiles" ON worker_profiles;

CREATE POLICY "Staff can view worker profiles"
  ON worker_profiles FOR SELECT
  TO authenticated
  USING (
    -- Agent sees their own profile
    user_id = auth.uid()
    -- Sales manager sees agents they manage
    OR manager_id = auth.uid()
    -- Staff (admin, super_admin, worker) see all profiles
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'worker')
    )
  );

-- ── UPDATE: restore manager_id = auth.uid() (own agents only) ───────────────
DROP POLICY IF EXISTS "Staff can update worker profiles" ON worker_profiles;
DROP POLICY IF EXISTS "Admins can update worker profiles" ON worker_profiles;

CREATE POLICY "Staff can update worker profiles"
  ON worker_profiles FOR UPDATE
  TO authenticated
  USING (
    -- Sales manager can update agents they manage
    manager_id = auth.uid()
    -- Admins / super_admins can update any profile
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    -- Sales manager can only update agents they manage
    manager_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

COMMIT;
