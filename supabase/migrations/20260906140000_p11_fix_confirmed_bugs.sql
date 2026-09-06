-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 11 — Fix Confirmed Bugs
--
-- 1. profiles: block non-admin role escalation via BEFORE UPDATE trigger
-- 2. dispatch_30_day_updates(): read service_role_key from Vault (not GUC)
-- 3. notifications: replace permissive SELECT/INSERT/UPDATE with staff-only
-- 4. profiles SELECT: super_admin gets same administrative profile-read as admin
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Helper: is_admin_user() — SECURITY DEFINER, avoids RLS recursion ───
-- The original "Admins can read all profiles" policy used auth.jwt() app_metadata
-- to avoid infinite recursion (querying profiles from within a profiles policy).
-- This helper function achieves the same goal: it reads the caller's role from
-- profiles with SECURITY DEFINER (bypasses RLS), so the policy that calls it
-- does not recurse.
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role IN ('admin', 'super_admin');
END;
$$;

REVOKE EXECUTE ON FUNCTION is_admin_user() FROM anon, authenticated;

-- ── 2. profiles SELECT: super_admin gets same access as admin ──────────────
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- Admin/super_admin can UPDATE any profile (for role management)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── 3. profiles: block non-admin role changes via BEFORE UPDATE trigger ───
-- Same pattern as protect_worker_profile_sensitive_columns on worker_profiles.
-- Allows service-role (auth.uid() IS NULL) and admin/super_admin; blocks
-- every other role from changing the role column.
CREATE OR REPLACE FUNCTION protect_profiles_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_uid  uuid;
BEGIN
  v_uid := auth.uid();

  -- Service-role / server-side operations (no JWT user) are allowed.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the caller's role (bypasses RLS — SECURITY DEFINER)
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;

  -- Admins and super_admins can modify any column
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- All other roles: block role column changes
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: role can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_role ON profiles;
CREATE TRIGGER trg_protect_profiles_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profiles_role_column();

-- ── 4. dispatch_30_day_updates(): read key from Vault, not GUC ────────────
-- The original function used current_setting('app.service_role_key', true)
-- which is not available in the pg_cron context (the GUC is only set by
-- PostgREST). This rewrite reads the key from vault.decrypted_secrets,
-- matching the pattern already used by sync_gmail().
CREATE OR REPLACE FUNCTION dispatch_30_day_updates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, vault
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url' LIMIT 1;

  -- Read the service role key from Vault (same pattern as sync_gmail)
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'gmail_sync_service_role_key'
   LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL OR v_key = '' THEN
    RETURN;
  END IF;

  -- Replace /gmail-sync or trailing path with /send-30-day-updates
  v_url := regexp_replace(v_url, '/gmail-sync$', '/send-30-day-updates');
  IF v_url !~ '/send-30-day-updates$' THEN
    v_url := v_url || '/send-30-day-updates';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_30_day_updates() FROM anon, authenticated;

-- ── 5. notifications: replace permissive policies with staff-only ─────────
-- Live DB had:
--   SELECT  "Authenticated staff can view notifications"  USING (true)          — ANY user reads ALL
--   INSERT  "Authenticated staff can insert notifications" CHECK (type IN ...) — ANY user inserts
--   UPDATE  "Staff can update notifications"  role IN ('admin','worker','sales_manager','agent') — wrong roles
-- Replace all three with a single clean staff-only set (admin, super_admin, worker).
DROP POLICY IF EXISTS "Authenticated staff can view notifications" ON notifications;
DROP POLICY IF EXISTS "Staff can view notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated staff can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Staff can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated staff can update notifications" ON notifications;
DROP POLICY IF EXISTS "Staff can update notifications" ON notifications;

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

COMMIT;
