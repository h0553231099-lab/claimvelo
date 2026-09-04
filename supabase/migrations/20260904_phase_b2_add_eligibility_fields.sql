-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B.2: Full EC261/UK261 eligibility — DB schema changes
-- All columns are nullable/defaulted so existing claims won't break.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Jurisdiction ──────────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS operating_carrier text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS operating_carrier_name text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS operating_carrier_source text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS is_codeshare boolean DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS marketing_carrier text DEFAULT '';

-- ── Cancellation (Article 5) ───────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS cancellation_notice_date date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS cancellation_notice_source text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_offered boolean DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_accepted boolean DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_flight_number text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_scheduled_dep_verified timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_scheduled_arr_verified timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_actual_arr_verified timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_scheduled_dep_customer timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS replacement_scheduled_arr_customer timestamptz;

-- ── Denied boarding (Article 4) ───────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS boarding_type text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS confirmed_reservation boolean;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS checked_in_on_time boolean;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS denial_reason text DEFAULT '';

-- ── Connecting flights ─────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS is_single_booking boolean DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS final_destination_delay_minutes integer;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS original_scheduled_final_arrival timestamptz;

-- ── Manual review ─────────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_reason_code text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_assigned_to uuid REFERENCES profiles(id);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_status text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_completed_at timestamptz;

-- ── Admin override ────────────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS override_decision text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS override_reason text DEFAULT '';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES profiles(id);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS overridden_at timestamptz;

-- ── Claim flight segments table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_flight_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  segment_order integer NOT NULL,
  flight_number text NOT NULL,
  flight_date date NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  marketing_carrier text DEFAULT '',
  operating_carrier text DEFAULT '',
  operating_carrier_name text DEFAULT '',
  codeshare_status text DEFAULT '',
  provider_source text DEFAULT 'none',
  provider_evidence jsonb,
  delay_minutes integer,
  flight_status text DEFAULT '',
  cross_check_status text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(claim_id, segment_order)
);
ALTER TABLE claim_flight_segments ENABLE ROW LEVEL SECURITY;

-- ── Updated audit trigger (captures override fields) ──────────────────────
CREATE OR REPLACE FUNCTION audit_claim_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
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
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'claim.status_changed';
    ELSIF OLD.compensation_amount IS DISTINCT FROM NEW.compensation_amount THEN
      v_action := 'claim.compensation_changed';
    ELSIF OLD.override_decision IS DISTINCT FROM NEW.override_decision THEN
      v_action := 'claim.override';
    ELSE
      RETURN NEW;
    END IF;
    v_old := jsonb_build_object(
      'status', OLD.status, 'compensation_amount', OLD.compensation_amount,
      'amount', OLD.amount, 'override_decision', OLD.override_decision,
      'override_reason', OLD.override_reason, 'overridden_by', OLD.overridden_by,
      'overridden_at', OLD.overridden_at
    );
    v_new := jsonb_build_object(
      'status', NEW.status, 'compensation_amount', NEW.compensation_amount,
      'amount', NEW.amount, 'override_decision', NEW.override_decision,
      'override_reason', NEW.override_reason, 'overridden_by', NEW.overridden_by,
      'overridden_at', NEW.overridden_at
    );
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'claim.created';
    v_old := NULL;
    v_new := jsonb_build_object('status', NEW.status, 'compensation_amount', NEW.compensation_amount);
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO audit_log (user_id, user_email, role, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, v_user_email, v_role, v_action, 'claim', NEW.id::text, v_old, v_new);
  RETURN NEW;
END;
$function$;
