/*
  # Create audit log table and triggers

  ## Purpose
  Tracks major actions on claims, finance transactions, and worker profiles.
  Never stores sensitive data (passwords, tokens, API keys, passport numbers,
  document contents, full passenger PII).

  ## Schema
  - audit_log table with user_id, action, entity_type, entity_id,
    old_values (jsonb), new_values (jsonb), ip_address, created_at
  - RLS: only admin and super_admin can read

  ## Triggers
  - claims: status changes, compensation_amount changes
  - finance_transactions: insert, update, delete
  - worker_profiles: commission_rate changes, total_payout_earned changes

  ## Column allowlist
  Only non-sensitive columns are captured in old_values/new_values.
  For claims: status, compensation_amount, amount, agent, loa_signed, updated_at
  For finance_transactions: type, category, description, amount, currency, date
  For worker_profiles: commission_rate, total_payout_earned, total_paid_to_date, status
*/

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies — only service_role can write
-- (edge functions and triggers use service_role or SECURITY DEFINER)

-- ── Trigger function for claims ──────────────────────────────────────────────
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
  -- Get actor info
  IF v_user_id IS NOT NULL THEN
    SELECT email, role INTO v_user_email, v_role FROM profiles WHERE id = v_user_id;
  END IF;

  -- Determine action
  IF TG_OP = 'UPDATE' THEN
    -- Only audit if status or compensation_amount changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'claim.status_changed';
    ELSIF OLD.compensation_amount IS DISTINCT FROM NEW.compensation_amount THEN
      v_action := 'claim.compensation_changed';
    ELSE
      -- Other changes not audited (updated_at, notes, etc.)
      RETURN NEW;
    END IF;

    -- Only capture non-sensitive columns
    v_old := jsonb_build_object(
      'status', OLD.status,
      'compensation_amount', OLD.compensation_amount,
      'amount', OLD.amount,
      'agent', OLD.agent,
      'loa_signed', OLD.loa_signed,
      'updated_at', OLD.updated_at
    );
    v_new := jsonb_build_object(
      'status', NEW.status,
      'compensation_amount', NEW.compensation_amount,
      'amount', NEW.amount,
      'agent', NEW.agent,
      'loa_signed', NEW.loa_signed,
      'updated_at', NEW.updated_at
    );
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'claim.created';
    v_old := NULL;
    v_new := jsonb_build_object(
      'status', NEW.status,
      'compensation_amount', NEW.compensation_amount,
      'amount', NEW.amount,
      'agent', NEW.agent,
      'loa_signed', NEW.loa_signed
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'claim', NEW.id::text, v_old, v_new);

  RETURN NEW;
END;
$$;

-- ── Trigger function for finance_transactions ────────────────────────────────
CREATE OR REPLACE FUNCTION audit_finance_change()
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
    v_action := 'finance.insert';
    v_old := NULL;
    v_new := jsonb_build_object(
      'type', NEW.type,
      'category', NEW.category,
      'description', NEW.description,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'date', NEW.date
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'finance.update';
    v_old := jsonb_build_object(
      'type', OLD.type,
      'category', OLD.category,
      'description', OLD.description,
      'amount', OLD.amount,
      'currency', OLD.currency,
      'date', OLD.date
    );
    v_new := jsonb_build_object(
      'type', NEW.type,
      'category', NEW.category,
      'description', NEW.description,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'date', NEW.date
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'finance.delete';
    v_old := jsonb_build_object(
      'type', OLD.type,
      'category', OLD.category,
      'description', OLD.description,
      'amount', OLD.amount,
      'currency', OLD.currency,
      'date', OLD.date
    );
    v_new := NULL;
    INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
    VALUES (v_user_id, v_user_email, v_role, v_action, 'finance_transaction', OLD.id::text, v_old, v_new);
    RETURN OLD;
  END IF;

  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'finance_transaction', NEW.id::text, v_old, v_new);

  RETURN NEW;
END;
$$;

-- ── Trigger function for worker_profiles ─────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_worker_change()
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
    IF OLD.commission_rate IS DISTINCT FROM NEW.commission_rate THEN
      v_action := 'worker.commission_changed';
    ELSIF OLD.total_payout_earned IS DISTINCT FROM NEW.total_payout_earned THEN
      v_action := 'worker.payout_changed';
    ELSIF OLD.total_paid_to_date IS DISTINCT FROM NEW.total_paid_to_date THEN
      v_action := 'worker.paid_changed';
    ELSE
      RETURN NEW;
    END IF;

    v_old := jsonb_build_object(
      'commission_rate', OLD.commission_rate,
      'total_payout_earned', OLD.total_payout_earned,
      'total_paid_to_date', OLD.total_paid_to_date,
      'status', OLD.status
    );
    v_new := jsonb_build_object(
      'commission_rate', NEW.commission_rate,
      'total_payout_earned', NEW.total_payout_earned,
      'total_paid_to_date', NEW.total_paid_to_date,
      'status', NEW.status
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'worker_profile', NEW.id::text, v_old, v_new);

  RETURN NEW;
END;
$$;

-- ── Create triggers ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_claims_insert ON claims;
CREATE TRIGGER audit_claims_insert
  AFTER INSERT ON claims
  FOR EACH ROW EXECUTE FUNCTION audit_claim_change();

DROP TRIGGER IF EXISTS audit_claims_update ON claims;
CREATE TRIGGER audit_claims_update
  AFTER UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION audit_claim_change();

DROP TRIGGER IF EXISTS audit_finance_insert ON finance_transactions;
CREATE TRIGGER audit_finance_insert
  AFTER INSERT ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_finance_change();

DROP TRIGGER IF EXISTS audit_finance_update ON finance_transactions;
CREATE TRIGGER audit_finance_update
  AFTER UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_finance_change();

DROP TRIGGER IF EXISTS audit_finance_delete ON finance_transactions;
CREATE TRIGGER audit_finance_delete
  AFTER DELETE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_finance_change();

DROP TRIGGER IF EXISTS audit_worker_update ON worker_profiles;
CREATE TRIGGER audit_worker_update
  AFTER UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_worker_change();

-- ── Revoke execute on trigger functions from public ──────────────────────────
REVOKE EXECUTE ON FUNCTION audit_claim_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_finance_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION audit_worker_change() FROM anon, authenticated;
