/*
  # Phase 9A — Audit coverage for legal & finance fields

  Extends the existing audit_log triggers to cover:
    - claims: lawyer assignment, escalation, compensation approval,
      airline payment, customer payout, ClaimVelo fee fields
    - commissions: status changes (approve/pay) — previously unaudited
    - legal_cases: insert / update / delete

  All trigger functions are SECURITY DEFINER, search_path = public, and
  EXECUTE is revoked from anon/authenticated (only triggers + service role
  can fire them).
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Extend audit_claim_change to cover the new legal/finance columns
-- ═══════════════════════════════════════════════════════════════════════════
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
    -- Determine the action from which audited field changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'claim.status_changed';
    ELSIF OLD.lawyer_id IS DISTINCT FROM NEW.lawyer_id THEN
      v_action := 'claim.lawyer_assigned';
    ELSIF OLD.legal_case_id IS DISTINCT FROM NEW.legal_case_id THEN
      v_action := 'claim.legal_case_linked';
    ELSIF OLD.escalated_at IS DISTINCT FROM NEW.escalated_at
       OR OLD.escalation_reason IS DISTINCT FROM NEW.escalation_reason THEN
      v_action := 'claim.escalated';
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Commissions audit (status changes were previously unaudited)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION audit_commission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_role text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT email, role INTO v_user_email, v_role FROM profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.commission_status IS DISTINCT FROM NEW.commission_status THEN
      INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
      VALUES (
        v_user_id, v_user_email, v_role, 'commission.status_changed', 'commission', NEW.id::text,
        jsonb_build_object('commission_status', OLD.commission_status, 'paid_at', OLD.paid_at),
        jsonb_build_object('commission_status', NEW.commission_status, 'paid_at', NEW.paid_at, 'agent_id', NEW.agent_id, 'claim_id', NEW.claim_id)
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
    VALUES (
      v_user_id, v_user_email, v_role, 'commission.created', 'commission', NEW.id::text,
      NULL,
      jsonb_build_object('commission_status', NEW.commission_status, 'agent_id', NEW.agent_id, 'claim_id', NEW.claim_id, 'commission_amount', NEW.commission_amount)
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_commissions_update ON commissions;
CREATE TRIGGER audit_commissions_update
  AFTER UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION audit_commission_change();

DROP TRIGGER IF EXISTS audit_commissions_insert ON commissions;
CREATE TRIGGER audit_commissions_insert
  AFTER INSERT ON commissions
  FOR EACH ROW EXECUTE FUNCTION audit_commission_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. legal_cases audit
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION audit_legal_case_change()
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

  IF TG_OP = 'INSERT' THEN
    v_action := 'legal_case.created';
    v_old := NULL;
    v_new := jsonb_build_object(
      'claim_id', NEW.claim_id, 'lawyer_id', NEW.lawyer_id,
      'legal_status', NEW.legal_status, 'escalation_reason', NEW.escalation_reason
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'legal_case.updated';
    v_old := jsonb_build_object(
      'lawyer_id', OLD.lawyer_id, 'legal_status', OLD.legal_status,
      'next_deadline_date', OLD.next_deadline_date, 'notes', LEFT(OLD.notes, 500)
    );
    v_new := jsonb_build_object(
      'lawyer_id', NEW.lawyer_id, 'legal_status', NEW.legal_status,
      'next_deadline_date', NEW.next_deadline_date, 'notes', LEFT(NEW.notes, 500)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'legal_case.deleted';
    v_old := jsonb_build_object(
      'claim_id', OLD.claim_id, 'lawyer_id', OLD.lawyer_id, 'legal_status', OLD.legal_status
    );
    v_new := NULL;
    INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
    VALUES (v_user_id, v_user_email, v_role, v_action, 'legal_case', OLD.id::text, v_old, v_new);
    RETURN OLD;
  END IF;

  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'legal_case', NEW.id::text, v_old, v_new);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_legal_cases_insert ON legal_cases;
CREATE TRIGGER audit_legal_cases_insert
  AFTER INSERT ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION audit_legal_case_change();

DROP TRIGGER IF EXISTS audit_legal_cases_update ON legal_cases;
CREATE TRIGGER audit_legal_cases_update
  AFTER UPDATE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION audit_legal_case_change();

DROP TRIGGER IF EXISTS audit_legal_cases_delete ON legal_cases;
CREATE TRIGGER audit_legal_cases_delete
  AFTER DELETE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION audit_legal_case_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Revoke EXECUTE on new trigger functions from public
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION audit_commission_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_legal_case_change() FROM anon, authenticated;
