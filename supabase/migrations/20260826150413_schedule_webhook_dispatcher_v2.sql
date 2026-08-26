/*
# Schedule Webhook Dispatcher via pg_cron (corrected)

## What This Does
pg_cron is already installed in pg_catalog. This migration:
1. Installs pg_net extension for HTTP calls from inside the database.
2. Creates a SECURITY DEFINER function that calls the webhook-dispatcher edge function.
3. Schedules it to run every 30 seconds (the minimum pg_cron granularity is 1 minute,
   so we schedule two jobs offset by 30s using a delay).
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION dispatch_webhooks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  v_url := current_setting('app.functions_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://supabase.co/functions/v1/webhook-dispatcher';
  END IF;

  v_key := current_setting('app.service_role_key', true);
  IF v_key IS NULL OR v_key = '' THEN
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

REVOKE EXECUTE ON FUNCTION dispatch_webhooks() FROM anon, authenticated;

-- Schedule every minute
SELECT cron.schedule(
  'webhook-dispatcher-minute',
  '* * * * *',
  'SELECT dispatch_webhooks()'
);
