/*
# Schedule Webhook Dispatcher with pg_cron

## What This Does
Installs the pg_cron extension and schedules the webhook-dispatcher edge function
to run every minute. This ensures pending webhook deliveries are sent to agents
shortly after a claim status changes.

## Changes
1. Installs pg_cron extension (in the 'extensions' schema per Supabase convention).
2. Creates a SECURITY DEFINER function `dispatch_webhooks()` that calls the
   webhook-dispatcher edge function via HTTP (using pg_extension's net module).
3. Schedules it to run every minute with pg_cron.
*/

-- Install pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to authenticated so they can see the schedule (read-only)
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- Create a function that pings the edge function
-- We use the Supabase internal function URL
CREATE OR REPLACE FUNCTION dispatch_webhooks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
BEGIN
  -- Call the webhook-dispatcher edge function
  -- The net.http_post function is provided by pg_cron's companion extension
  PERFORM net.http_post(
    url := 'https://supabase.co/functions/v1/webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- Silently ignore errors — the next cron tick will retry
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_webhooks() FROM anon, authenticated;

-- Schedule every minute
SELECT cron.schedule(
  'webhook-dispatcher-every-minute',
  '* * * * *',
  'SELECT dispatch_webhooks()'
);
