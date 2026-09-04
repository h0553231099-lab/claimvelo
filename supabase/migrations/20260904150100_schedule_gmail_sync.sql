-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6 — Schedule Gmail sync via pg_cron
--
-- Runs the gmail-sync edge function every 2 minutes to pull new airline
-- emails from the Gmail monitoring mailbox.
--
-- Uses an app_config table for the non-secret function URL, and Supabase
-- Vault for the service role key (never stored as plaintext config).
-- ═══════════════════════════════════════════════════════════════════════════

-- Config table for cron-triggered edge function calls (non-secret only)
CREATE TABLE IF NOT EXISTS app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- RLS: no client role may read app_config.  Only the postgres owner /
-- SECURITY DEFINER function (which bypasses RLS) can access it.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_config_deny_client_access
  ON public.app_config
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- After migration, set the non-secret function URL manually:
--   INSERT INTO app_config (key, value) VALUES
--     ('functions_url', 'https://<project-ref>.supabase.co/functions/v1/gmail-sync');
--
-- The service role key must be stored in Supabase Vault (encrypted), NOT in
-- app_config:
--   SELECT vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_KEY>',
--     'gmail_sync_service_role_key',
--     'Service role key for the gmail-sync cron'
--   );

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
  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url' LIMIT 1;
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

-- Schedule every 2 minutes
SELECT cron.schedule(
  'gmail-sync-2min',
  '*/2 * * * *',
  'SELECT sync_gmail()'
);
