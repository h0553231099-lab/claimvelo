/*
  # Phase 9A — Fix finance_transactions RLS + structured transaction types

  ## Problem
  The live DB accumulated DUPLICATE & conflicting RLS policies on
  finance_transactions:
    - DELETE: "Admin can delete" (role='admin' only) AND
              "Admins can delete" (admin OR super_admin)
    - UPDATE: "Admin or owner can update" (created_by=auth.uid() OR admin) AND
              "Admins can update" (admin OR super_admin)
  The "owner" UPDATE policy let ANY authenticated user who happened to be
  `created_by` mutate the row — a latent privilege gap.

  ## Fix
  Drop ALL existing finance_transactions policies and recreate a single clean
  set: SELECT/INSERT/UPDATE/DELETE restricted to admin + super_admin only.
  Service-role (edge functions) bypasses RLS regardless.

  ## New column
  `transaction_type` — structured money-flow category with a CHECK constraint.
  Nullable so existing rows (which only have free-text `category`) are not
  affected. New typed flows will set this; `category` remains for display.
*/

-- ── 1. Drop every existing finance_transactions policy ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can view finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can update finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can delete finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admins can view finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admins can insert finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admins can update finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admins can delete finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admin can delete finance transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Admin or owner can update finance transactions" ON finance_transactions;

-- ── 2. Recreate a single clean policy set (admin + super_admin only) ──────────
CREATE POLICY "finance_select_admin"
  ON finance_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "finance_insert_admin"
  ON finance_transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "finance_update_admin"
  ON finance_transactions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "finance_delete_admin"
  ON finance_transactions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ── 3. Add structured transaction_type column ────────────────────────────────
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS transaction_type text DEFAULT NULL
  CHECK (transaction_type IS NULL OR transaction_type IN (
    'airline_payment',     -- income: airline paid the compensation
    'claimvelo_fee',        -- income: ClaimVelo's success fee retained
    'customer_payout',      -- expense: net amount sent to the customer
    'agent_commission',     -- expense: commission paid to a sales agent
    'legal_expense',        -- expense: lawyer / court / legal fees
    'general'               -- untyped legacy / manual entry
  ));

CREATE INDEX IF NOT EXISTS idx_finance_transactions_txn_type
  ON finance_transactions(transaction_type) WHERE transaction_type IS NOT NULL;

-- Backfill existing rows so they are not untyped
UPDATE finance_transactions
  SET transaction_type = 'general'
  WHERE transaction_type IS NULL;
