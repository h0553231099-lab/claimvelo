-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6 — Schedule Gmail sync via pg_cron
--
-- Runs the gmail-sync edge function every 2 minutes to pull new airline
-- emails from the Gmail monitoring mailbox.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_url := current_setting('app.functions_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://supabase.co/functions/v1/gmail-sync';
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

REVOKE EXECUTE ON FUNCTION sync_gmail() FROM anon, authenticated;

-- Schedule every 2 minutes
SELECT cron.schedule(
  'gmail-sync-2min',
  '*/2 * * * *',
  'SELECT sync_gmail()'
);
