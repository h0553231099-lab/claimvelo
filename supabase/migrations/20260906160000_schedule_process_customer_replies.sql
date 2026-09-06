-- ═══════════════════════════════════════════════════════════════════════════
-- Schedule process-customer-replies via pg_cron
--
-- Runs the process-customer-replies edge function every 3 minutes to pull
-- customer email replies from the Gmail monitoring inbox, match them to
-- claims, and store unmatched/ambiguous replies in the review queue.
--
-- Uses the same app_config.functions_url + app.service_role_key pattern
-- as the existing dispatch_30_day_updates() and sync_gmail() functions.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION dispatch_process_customer_replies()
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
  v_key := current_setting('app.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL OR v_key = '' THEN
    RETURN;
  END IF;

  -- Replace /gmail-sync or trailing path with /process-customer-replies
  v_url := regexp_replace(v_url, '/gmail-sync$', '/process-customer-replies');
  IF v_url !~ '/process-customer-replies$' THEN
    v_url := v_url || '/process-customer-replies';
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

REVOKE EXECUTE ON FUNCTION dispatch_process_customer_replies() FROM anon, authenticated;

-- Schedule every 3 minutes
SELECT cron.schedule(
  'process-customer-replies-3min',
  '*/3 * * * *',
  'SELECT dispatch_process_customer_replies()'
);
