/*
  # P8A Security Fix — Protect sensitive worker_profile columns from direct UPDATE

  ## Problem (found in privilege-escalation audit)
  The worker_profiles UPDATE RLS policy is row-level only — it controls WHICH
  rows a sales_manager can touch (manager_id = auth.uid()) but not WHICH COLUMNS
  they may modify.  PostgreSQL RLS has no column-level UPDATE restriction, so
  a sales_manager who passes the row-level check can SET any column on the row,
  including:

    commission_rate       → bypass the authorized server-side workflow
    total_payout_earned   → inflate / reset commission totals
    total_paid_to_date    → wipe outstanding balance
    api_key               → assign arbitrary API keys
    manager_id            → (WITH CHECK already blocks reassignment, but
                            defence-in-depth is warranted)
    role                  → escalate an agent to admin
    user_id               → identity theft / re-link to another user
    agent_code            → change the referral code

  Live test confirmed ALL of the above were writable by a sales_manager on
  their own agents, and an agent could write commission_rate,
  total_payout_earned, total_paid_to_date, role and agent_code on their own
  profile.

  ## Fix
  A BEFORE UPDATE trigger that:

  1. Allows service-role / server-side operations (auth.uid() IS NULL) — the
     manage-agent-finance edge function uses the service-role key and has no
     JWT user, so auth.uid() returns NULL.
  2. Allows admin / super_admin to modify any column (legitimate management).
  3. Blocks every other role (sales_manager, agent, worker, customer, …) from
     changing the eight sensitive columns listed above.  The trigger raises an
     exception, so PostgREST returns 4xx and the column retains its original
     value.

  This is defence-in-depth: even if a future RLS policy is accidentally
  broadened, the trigger still prevents sensitive-column writes.
*/

BEGIN;

-- ── Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_worker_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_uid  uuid;
BEGIN
  v_uid := auth.uid();

  -- Service-role / server-side operations (no JWT user) are allowed.
  -- The manage-agent-finance edge function uses the service-role key,
  -- which has no sub claim, so auth.uid() returns NULL.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the caller's role (bypasses RLS because SECURITY DEFINER)
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;

  -- Admins and super_admins can modify any column
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- ── All other roles: block sensitive-column changes ──────────────────────
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    RAISE EXCEPTION 'Permission denied: commission_rate can only be changed via the authorized server-side workflow';
  END IF;

  IF NEW.total_payout_earned IS DISTINCT FROM OLD.total_payout_earned THEN
    RAISE EXCEPTION 'Permission denied: total_payout_earned can only be changed via the authorized server-side workflow';
  END IF;

  IF NEW.total_paid_to_date IS DISTINCT FROM OLD.total_paid_to_date THEN
    RAISE EXCEPTION 'Permission denied: total_paid_to_date can only be changed via the authorized server-side workflow';
  END IF;

  IF NEW.api_key IS DISTINCT FROM OLD.api_key THEN
    RAISE EXCEPTION 'Permission denied: api_key can only be set by an administrator';
  END IF;

  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
    RAISE EXCEPTION 'Permission denied: manager_id can only be changed by an administrator';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: role can only be changed by an administrator';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Permission denied: user_id can only be changed by an administrator';
  END IF;

  IF NEW.agent_code IS DISTINCT FROM OLD.agent_code THEN
    RAISE EXCEPTION 'Permission denied: agent_code can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Trigger ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_protect_worker_profile_sensitive_columns
  ON worker_profiles;

CREATE TRIGGER trg_protect_worker_profile_sensitive_columns
  BEFORE UPDATE ON worker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_worker_profile_sensitive_columns();

COMMIT;
