-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7 Fix — Remove status-change timer reset
--
-- The claim_status_history_timer trigger incorrectly reset
-- last_customer_update_at on ANY staff status change, even when no
-- customer-facing email was actually sent. This made the 30-day timer
-- unreliable — internal operational actions (status changes, assignments,
-- priority changes, review actions) must NOT reset the customer
-- communication timer.
--
-- Only actual customer-facing communication (outbound email or portal
-- message recorded in claim_communications) should reset the timer.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the trigger that reset the timer on status changes
DROP TRIGGER IF EXISTS claim_status_history_timer ON claim_status_history;
DROP FUNCTION IF EXISTS update_timer_on_status_change();

COMMIT;
