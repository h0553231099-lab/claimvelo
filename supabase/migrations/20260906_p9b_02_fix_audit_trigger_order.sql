/*
  # Phase 9B — Fix audit trigger ordering: escalation before status

  ## Problem
  The `audit_claim_change()` trigger checks `OLD.status IS DISTINCT FROM
  NEW.status` FIRST. When a claim is escalated, the status changes to
  'Escalated' AND the escalation fields change in the same UPDATE. The
  status check wins, so the action is logged as `claim.status_changed`
  instead of `claim.escalated` — the escalation is never audited.

  ## Fix
  Reorder the ELSIF chain so escalation fields are checked BEFORE status.
  This ensures `claim.escalated` is the audited action when escalation
  fields change, even if status also changes in the same UPDATE.
*/

CREATE OR REPLACE FUNCTION audit_claim_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_role text;
  v_action text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT email, role INTO v_user_email, v_role FROM profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Determine the action from which audited field changed.
    -- Escalation is checked BEFORE status so that escalating a claim
    -- (which also sets status='Escalated') logs 'claim.escalated'.
    IF OLD.escalated_at IS DISTINCT FROM NEW.escalated_at
       OR OLD.escalation_reason IS DISTINCT FROM NEW.escalation_reason THEN
      v_action := 'claim.escalated';
    ELSIF OLD.lawyer_id IS DISTINCT FROM NEW.lawyer_id THEN
      v_action := 'claim.lawyer_assigned';
    ELSIF OLD.legal_case_id IS DISTINCT FROM NEW.legal_case_id THEN
      v_action := 'claim.legal_case_linked';
    ELSIF OLD.approved_compensation_amount IS DISTINCT FROM NEW.approved_compensation_amount THEN
      v_action := 'claim.compensation_approved';
    ELSIF OLD.airline_payment_status IS DISTINCT FROM NEW.airline_payment_status
       OR OLD.airline_payment_amount IS DISTINCT FROM NEW.airline_payment_amount THEN
      v_action := 'claim.airline_payment_changed';
    ELSIF OLD.customer_payout_status IS DISTINCT FROM NEW.customer_payout_status
       OR OLD.customer_payout_amount IS DISTINCT FROM NEW.customer_payout_amount THEN
      v_action := 'claim.customer_payout_changed';
    ELSIF OLD.claimvelo_fee_amount IS DISTINCT FROM NEW.claimvelo_fee_amount
       OR OLD.claimvelo_fee_rate IS DISTINCT FROM NEW.claimvelo_fee_rate THEN
      v_action := 'claim.fee_changed';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'claim.status_changed';
    ELSIF OLD.compensation_amount IS DISTINCT FROM NEW.compensation_amount THEN
      v_action := 'claim.compensation_changed';
    ELSE
      RETURN NEW;
    END IF;

    v_old := jsonb_build_object(
      'status', OLD.status,
      'lawyer_id', OLD.lawyer_id,
      'legal_case_id', OLD.legal_case_id,
      'escalated_at', OLD.escalated_at,
      'escalation_reason', OLD.escalation_reason,
      'compensation_amount', OLD.compensation_amount,
      'approved_compensation_amount', OLD.approved_compensation_amount,
      'approved_at', OLD.approved_at,
      'airline_payment_status', OLD.airline_payment_status,
      'airline_payment_amount', OLD.airline_payment_amount,
      'customer_payout_status', OLD.customer_payout_status,
      'customer_payout_amount', OLD.customer_payout_amount,
      'claimvelo_fee_amount', OLD.claimvelo_fee_amount,
      'claimvelo_fee_rate', OLD.claimvelo_fee_rate
    );
    v_new := jsonb_build_object(
      'status', NEW.status,
      'lawyer_id', NEW.lawyer_id,
      'legal_case_id', NEW.legal_case_id,
      'escalated_at', NEW.escalated_at,
      'escalation_reason', NEW.escalation_reason,
      'compensation_amount', NEW.compensation_amount,
      'approved_compensation_amount', NEW.approved_compensation_amount,
      'approved_at', NEW.approved_at,
      'airline_payment_status', NEW.airline_payment_status,
      'airline_payment_amount', NEW.airline_payment_amount,
      'customer_payout_status', NEW.customer_payout_status,
      'customer_payout_amount', NEW.customer_payout_amount,
      'claimvelo_fee_amount', NEW.claimvelo_fee_amount,
      'claimvelo_fee_rate', NEW.claimvelo_fee_rate
    );
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'claim.created';
    v_old := NULL;
    v_new := jsonb_build_object(
      'status', NEW.status,
      'lawyer_id', NEW.lawyer_id,
      'compensation_amount', NEW.compensation_amount,
      'airline_payment_status', NEW.airline_payment_status,
      'customer_payout_status', NEW.customer_payout_status
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'claim', NEW.id::text, v_old, v_new);

  RETURN NEW;
END;
$$;
