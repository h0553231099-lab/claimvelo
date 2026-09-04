-- ═══════════════════════════════════════════════════════════════════════════
-- Security fix — move service_role_key from plaintext app_config to Vault
--
-- The original schedule_gmail_sync migration stored the Supabase
-- service_role_key as a plaintext row in app_config.  That key grants
-- full admin access (bypasses RLS) and must never be readable by any
-- client role.
--
-- This migration:
--   1. Copies the existing plaintext key into Supabase Vault (encrypted)
--      entirely server-side — the value never leaves the database.
--   2. Deletes the plaintext row from app_config.
--   3. Rewrites sync_gmail() to read the key from vault.decrypted_secrets.
--   4. Enables RLS on app_config so no anon / authenticated / service_role
--      *client* query can read it (only the postgres owner / SECURITY
--      DEFINER function, which bypasses RLS, can).
-- The cron schedule is left untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Migrate the secret into Vault (idempotent, value stays in-DB) ──────
DO $$
DECLARE
  v_key    text;
  v_exists uuid;
BEGIN
  SELECT value INTO v_key
    FROM public.app_config
   WHERE key = 'service_role_key'
   LIMIT 1;

  IF v_key IS NOT NULL THEN
    -- Only create the vault entry if it doesn't already exist
    SELECT id INTO v_exists
      FROM vault.secrets
     WHERE name = 'gmail_sync_service_role_key'
     LIMIT 1;

    IF v_exists IS NULL THEN
      PERFORM vault.create_secret(
        v_key,
        'gmail_sync_service_role_key',
        'Service role key used by the sync_gmail() cron to invoke the gmail-sync edge function'
      );
    END IF;

    -- Remove the plaintext copy
    DELETE FROM public.app_config WHERE key = 'service_role_key';
  END IF;
END
$$;

-- ── 2. Rewrite sync_gmail() to read the key from Vault ────────────────────
CREATE OR REPLACE FUNCTION sync_gmail()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, vault
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Non-secret config stays in app_config (just the function URL)
  SELECT value INTO v_url
    FROM public.app_config
   WHERE key = 'functions_url'
   LIMIT 1;

  -- Secret is read from the encrypted Vault store
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'gmail_sync_service_role_key'
   LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
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

REVOKE EXECUTE ON FUNCTION sync_gmail() FROM anon, authenticated;

-- ── 3. Lock down app_config with RLS ─────────────────────────────────────
-- Enabling RLS with no permissive policy means anon, authenticated, and
-- any non-BYPASSRLS role see zero rows.  The postgres owner and the
-- SECURITY DEFINER function (owned by postgres) bypass RLS and can still
-- read the non-secret functions_url row.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Explicit deny for client roles (defense-in-depth — RLS with no policy
-- already blocks these, but this makes the intent unambiguous).
DROP POLICY IF EXISTS app_config_deny_client_access ON public.app_config;
CREATE POLICY app_config_deny_client_access
  ON public.app_config
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
