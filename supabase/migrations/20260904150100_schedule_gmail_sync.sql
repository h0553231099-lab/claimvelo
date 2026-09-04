-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6 — Schedule Gmail sync via pg_cron
--
-- Runs the gmail-sync edge function every 2 minutes to pull new airline
-- emails from the Gmail monitoring mailbox.
--
-- Uses an app_config table to store the function URL and service role key
-- (GUC settings like app.functions_url are not reliably settable via the
-- Management API on Supabase).
-- ═══════════════════════════════════════════════════════════════════════════

-- Config table for cron-triggered edge function calls
CREATE TABLE IF NOT EXISTS app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- The values are inserted manually after migration (or via the Supabase
-- dashboard) because they contain the project URL and service role key:
--   INSERT INTO app_config (key, value) VALUES
--     ('functions_url', 'https://<project-ref>.supabase.co/functions/v1/gmail-sync'),
--     ('service_role_key', '<SUPABASE_SERVICE_ROLE_KEY>');

CREATE OR REPLACE FUNCTION sync_gmail()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url' LIMIT 1;
  SELECT value INTO v_key FROM public.app_config WHERE key = 'service_role_key' LIMIT 1;

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
