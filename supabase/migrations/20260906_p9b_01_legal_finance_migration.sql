/*
  # Phase 9B — Unique typed-txn index + legal_cases updated_at trigger

  ## 1. Unique partial index on finance_transactions
  Prevents duplicate structured financial events per claim. Only the
  "one-per-claim" typed flows are constrained:
    - airline_payment  (one record per claim)
    - claimvelo_fee    (one record per claim)
    - customer_payout  (one record per claim)
  `legal_expense` and `general` are intentionally EXCLUDED — a claim can
  legitimately have multiple legal-expense entries (court filing, lawyer
  consultation, etc.) and `general` is for manual/legacy entries.

  The edge function uses ON CONFLICT upserts against this index so that
  re-submitting the same financial event updates the existing row rather
  than creating a duplicate.

  ## 2. legal_cases updated_at trigger
  Reuses the existing SECURITY DEFINER `update_updated_at()` function
  (search_path = '', fully qualified) already used by the claims table.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Unique partial index: one typed transaction per claim (structured flows)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_txn_unique_per_claim
  ON finance_transactions(claim_id, transaction_type)
  WHERE claim_id IS NOT NULL
    AND transaction_type IN ('airline_payment', 'claimvelo_fee', 'customer_payout');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. legal_cases updated_at trigger (reuses existing update_updated_at())
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS legal_cases_updated_at ON legal_cases;
CREATE TRIGGER legal_cases_updated_at
  BEFORE UPDATE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
