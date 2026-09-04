-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Status transition validation (allowed-transition rules)
--
-- Enforces a clear operational claim lifecycle. Staff cannot move a claim
-- arbitrarily between unrelated stages. The allowed transitions are:
--
--   Untouched  → In Progress, Submitted, Resolved
--   In Progress → Submitted, Waiting, Escalated, Resolved
--   Submitted  → Waiting, Escalated, Resolved, In Progress
--   Waiting    → Escalated, Resolved, Submitted, In Progress
--   Escalated  → Resolved, Waiting, In Progress
--   Resolved   → In Progress (reopen only)
--
-- This trigger fires BEFORE UPDATE and only when status actually changes.
-- The rules engine (service role) writes to eligibility_status, NOT status,
-- so it is unaffected. The transition check applies equally to all callers
-- because triggers fire regardless of role.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Pure function: is this transition allowed? ──────────────────────────────
CREATE OR REPLACE FUNCTION is_valid_status_transition(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_from = 'Untouched'   THEN p_to IN ('In Progress', 'Submitted', 'Resolved')
    WHEN p_from = 'In Progress' THEN p_to IN ('Submitted', 'Waiting', 'Escalated', 'Resolved')
    WHEN p_from = 'Submitted'   THEN p_to IN ('Waiting', 'Escalated', 'Resolved', 'In Progress')
    WHEN p_from = 'Waiting'     THEN p_to IN ('Escalated', 'Resolved', 'Submitted', 'In Progress')
    WHEN p_from = 'Escalated'   THEN p_to IN ('Resolved', 'Waiting', 'In Progress')
    WHEN p_from = 'Resolved'    THEN p_to IN ('In Progress')
    ELSE false
  END;
$$;

-- ── BEFORE UPDATE trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_claim_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT is_valid_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid status transition: % → %',
        OLD.status, NEW.status
        USING HINT = 'This transition is not allowed by the claim lifecycle rules.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_status_transition ON claims;
CREATE TRIGGER validate_status_transition
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION validate_claim_status_transition();

COMMIT;
