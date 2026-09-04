-- ═══════════════════════════════════════════════════════════════════════════
-- Update webhook trigger to fire on eligibility_status changes
--
-- After separating eligibility_status from the operational status, the rules
-- engine writes eligibility decisions (Eligible, Pending Check) to
-- eligibility_status instead of status. The original webhook trigger only
-- fired on status changes, so agents stopped receiving webhooks for those
-- decisions. This migration updates the trigger to fire on both columns and
-- includes eligibility_status (old + new) in the payload.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION enqueue_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_code text;
  v_webhook_url text;
  v_old_status text;
  v_new_status text;
  v_old_eligibility text;
  v_new_eligibility text;
  v_claim_ref text;
  v_claim_id uuid;
  v_payload jsonb;
  v_changed boolean := false;
BEGIN
  v_old_status := OLD.status;
  v_new_status := NEW.status;
  v_old_eligibility := OLD.eligibility_status;
  v_new_eligibility := NEW.eligibility_status;

  -- Only fire when status OR eligibility_status actually changed
  IF (v_old_status IS NOT DISTINCT FROM v_new_status)
     AND (v_old_eligibility IS NOT DISTINCT FROM v_new_eligibility) THEN
    RETURN NEW;
  END IF;

  v_changed := (v_old_status IS DISTINCT FROM v_new_status)
            OR (v_old_eligibility IS DISTINCT FROM v_new_eligibility);

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  v_agent_code := NEW.agent;
  v_claim_ref := NEW.claim_ref;
  v_claim_id := NEW.id;

  -- Skip if no agent code
  IF v_agent_code IS NULL OR v_agent_code = '' THEN
    RETURN NEW;
  END IF;

  -- Look up the agent's webhook URL
  SELECT webhook_url INTO v_webhook_url
  FROM worker_profiles
  WHERE agent_code = v_agent_code
  AND role = 'agent'
  AND webhook_url IS NOT NULL
  AND webhook_url <> ''
  LIMIT 1;

  -- If no webhook URL, skip
  IF v_webhook_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload — include both operational and eligibility status
  v_payload := jsonb_build_object(
    'event', 'claim.status_changed',
    'timestamp', now(),
    'data', jsonb_build_object(
      'claim_ref', v_claim_ref,
      'claim_id', v_claim_id,
      'old_status', v_old_status,
      'new_status', v_new_status,
      'old_eligibility_status', v_old_eligibility,
      'new_eligibility_status', v_new_eligibility,
      'flight_number', NEW.flight_number,
      'flight_date', NEW.flight_date,
      'departure', NEW.departure,
      'arrival', NEW.arrival,
      'passenger_name', (NEW.passenger_first_name || ' ' || NEW.passenger_last_name),
      'passenger_email', NEW.email,
      'compensation_amount', NEW.compensation_amount,
      'amount', NEW.amount,
      'agent_code', v_agent_code
    )
  );

  -- Enqueue the delivery
  INSERT INTO webhook_deliveries (agent_code, claim_id, claim_ref, event_type, payload, status)
  VALUES (v_agent_code, v_claim_id, v_claim_ref, 'claim.status_changed', v_payload, 'pending');

  RETURN NEW;
END;
$$;

-- Replace the trigger to fire on both columns
DROP TRIGGER IF EXISTS claims_status_change_webhook ON claims;
CREATE TRIGGER claims_status_change_webhook
  AFTER UPDATE OF status, eligibility_status ON claims
  FOR EACH ROW EXECUTE FUNCTION enqueue_webhook();

REVOKE EXECUTE ON FUNCTION enqueue_webhook() FROM anon, authenticated;

COMMIT;
