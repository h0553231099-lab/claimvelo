-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7 — 30-Day Customer Updates
--
-- Creates a SECURITY DEFINER function that finds active claims that have not
-- received a customer-facing update in 30+ days and sends a truthful update
-- email. Designed to be called by the send-30-day-updates edge function via
-- pg_cron.
--
-- Key principles:
--   • Only ACTIVE claims (not Resolved/Escalated) need 30-day updates
--   • Internal notes do NOT reset the timer (last_customer_update_at only
--     changes on outbound customer communications and status changes)
--   • Duplicate prevention: checks last_customer_update_at before sending
--   • Language: uses claim.preferred_language with English fallback
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Function: get_claims_needing_30_day_update ───────────────────────────
-- Returns claims that are active and haven't had a customer update in 30+ days.
-- Called by the send-30-day-updates edge function.
CREATE OR REPLACE FUNCTION get_claims_needing_30_day_update()
RETURNS TABLE(
  claim_id uuid,
  claim_ref text,
  email text,
  passenger_first_name text,
  passenger_last_name text,
  airline text,
  status text,
  preferred_language text,
  last_customer_update_at timestamptz,
  days_overdue integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.claim_ref,
    c.email,
    c.passenger_first_name,
    c.passenger_last_name,
    c.airline,
    c.status,
    c.preferred_language,
    c.last_customer_update_at,
    EXTRACT(DAY FROM now() - c.last_customer_update_at)::int AS days_overdue
  FROM claims c
  WHERE c.status IN ('Untouched', 'In Progress', 'Submitted', 'Waiting')
    AND c.email IS NOT NULL
    AND c.email != ''
    AND c.last_customer_update_at < now() - INTERVAL '30 days'
  ORDER BY c.last_customer_update_at ASC
  LIMIT 50; -- Process in batches to avoid overwhelming the email provider
END;
$$;

REVOKE EXECUTE ON FUNCTION get_claims_needing_30_day_update() FROM anon, authenticated;

-- ── 2. Function: mark_30_day_update_sent ─────────────────────────────────────
-- Called by the edge function after successfully sending a 30-day update email.
-- Updates last_customer_update_at and logs the communication.
CREATE OR REPLACE FUNCTION mark_30_day_update_sent(
  p_claim_id uuid,
  p_subject text,
  p_body text,
  p_language text DEFAULT 'en'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert the communication record (outbound email, system-generated)
  INSERT INTO claim_communications (
    claim_id, direction, channel, subject, body,
    from_address, to_address, from_name,
    match_status, language
  )
  SELECT
    p_claim_id, 'outbound', 'email', p_subject, p_body,
    'support@claimvelo.com', c.email, 'ClaimVelo',
    'manual', p_language
  FROM claims c WHERE c.id = p_claim_id;

  -- The trigger on claim_communications will update last_customer_update_at.
  -- But we also update it explicitly to be safe (idempotent).
  UPDATE claims
  SET last_customer_update_at = now()
  WHERE id = p_claim_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_30_day_update_sent(uuid, text, text, text) FROM anon, authenticated;

-- ── 3. Schedule the 30-day update check via pg_cron ──────────────────────────
-- Runs daily at 09:00 UTC. The edge function checks for claims needing updates
-- and sends emails. The function itself prevents duplicates.
CREATE OR REPLACE FUNCTION dispatch_30_day_updates()
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

-- Schedule daily at 09:00 UTC
SELECT cron.schedule(
  'send-30-day-updates-daily',
  '0 9 * * *',
  'SELECT dispatch_30_day_updates()'
);

COMMIT;
