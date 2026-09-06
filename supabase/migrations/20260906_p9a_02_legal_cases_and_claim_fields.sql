/*
  # Phase 9A — legal_cases table + claim legal/finance fields + lawyer RLS

  ## legal_cases
  One row per claim that has been escalated to legal. Links to the existing
  claim (claim_id FK, UNIQUE) — does NOT duplicate documents, communications,
  or files; those stay on claim_files / claim_communications / airline_emails
  and are surfaced to the assigned lawyer via RLS.

  ## claim fields
  Minimum structured fields for lawyer assignment, compensation approval,
  airline payment tracking, ClaimVelo fee, and customer payout.
  `compensation_amount` (estimated, set by the rules engine) is kept SEPARATE
  from `approved_compensation_amount` (human-confirmed).

  ## Lawyer RLS (least privilege)
  A lawyer sees ONLY claims (and their files, communications, airline emails,
  info requests, review notes) where claims.lawyer_id = auth.uid().
  No global claims access. No finance access. No audit_log access.
  legal_cases: lawyer sees only rows where lawyer_id = auth.uid().
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. legal_cases table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  lawyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  legal_status text NOT NULL DEFAULT 'intake'
    CHECK (legal_status IN (
      'intake',
      'pre_litigation',
      'letter_before_claim',
      'court_filed',
      'in_discovery',
      'hearing_scheduled',
      'judgment',
      'settled',
      'closed',
      'withdrawn'
    )),
  escalation_reason text DEFAULT '',
  escalated_at timestamptz,
  escalated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  next_deadline_date timestamptz,
  deadlines jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_id)
);

ALTER TABLE legal_cases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_legal_cases_lawyer_id ON legal_cases(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(legal_status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_next_deadline ON legal_cases(next_deadline_date) WHERE next_deadline_date IS NOT NULL;

-- legal_cases RLS
CREATE POLICY "legal_cases_lawyer_read_own"
  ON legal_cases FOR SELECT TO authenticated
  USING (
    lawyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "legal_cases_admin_write"
  ON legal_cases FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "legal_cases_admin_update"
  ON legal_cases FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "legal_cases_admin_delete"
  ON legal_cases FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Claim legal / finance fields
-- ═══════════════════════════════════════════════════════════════════════════

-- Lawyer assignment + escalation
ALTER TABLE claims ADD COLUMN IF NOT EXISTS lawyer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS legal_case_id uuid REFERENCES legal_cases(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS escalation_reason text DEFAULT '';

-- Compensation approval (separate from estimated compensation_amount)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS approved_compensation_amount numeric DEFAULT NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Airline payment tracking
ALTER TABLE claims ADD COLUMN IF NOT EXISTS airline_payment_status text NOT NULL DEFAULT 'none'
  CHECK (airline_payment_status IN ('none', 'pending', 'partial', 'received'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS airline_payment_amount numeric DEFAULT NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS airline_payment_date date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS airline_payment_reference text DEFAULT '';

-- ClaimVelo fee (rate/tier/amount — NOT calculated yet, just the columns)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claimvelo_fee_tier text DEFAULT NULL
  CHECK (claimvelo_fee_tier IS NULL OR claimvelo_fee_tier IN ('standard', 'legal'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claimvelo_fee_rate numeric DEFAULT NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claimvelo_fee_amount numeric DEFAULT NULL;

-- Customer payout tracking
ALTER TABLE claims ADD COLUMN IF NOT EXISTS customer_payout_status text NOT NULL DEFAULT 'none'
  CHECK (customer_payout_status IN ('none', 'pending', 'paid'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS customer_payout_amount numeric DEFAULT NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS customer_payout_date date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS customer_payout_reference text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_claims_lawyer_id ON claims(lawyer_id) WHERE lawyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_legal_case_id ON claims(legal_case_id) WHERE legal_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_airline_payment_status ON claims(airline_payment_status);
CREATE INDEX IF NOT EXISTS idx_claims_customer_payout_status ON claims(customer_payout_status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Lawyer RLS on existing claim-related tables (least privilege)
-- Each policy ORs with existing staff policies; a lawyer only sees rows whose
-- claim has lawyer_id = auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════

-- claims: lawyer sees assigned claims only
CREATE POLICY "claims_lawyer_read_own"
  ON claims FOR SELECT TO authenticated
  USING (lawyer_id = auth.uid());

-- claim_files: lawyer sees files for assigned claims
CREATE POLICY "claim_files_lawyer_read"
  ON claim_files FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = claim_files.claim_id AND lawyer_id = auth.uid())
  );

-- claim_communications: lawyer sees comms for assigned claims
CREATE POLICY "claim_communications_lawyer_read"
  ON claim_communications FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = claim_communications.claim_id AND lawyer_id = auth.uid())
  );

-- airline_emails: lawyer sees airline emails for assigned claims
CREATE POLICY "airline_emails_lawyer_read"
  ON airline_emails FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = airline_emails.claim_id AND lawyer_id = auth.uid())
  );

-- claim_info_requests: lawyer sees info requests for assigned claims
CREATE POLICY "claim_info_requests_lawyer_read"
  ON claim_info_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = claim_info_requests.claim_id AND lawyer_id = auth.uid())
  );

-- review_notes: lawyer sees review notes for assigned claims
CREATE POLICY "review_notes_lawyer_read"
  ON review_notes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = review_notes.claim_id AND lawyer_id = auth.uid())
  );

-- claim_flight_segments: lawyer sees segments for assigned claims
CREATE POLICY "claim_flight_segments_lawyer_read"
  ON claim_flight_segments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = claim_flight_segments.claim_id AND lawyer_id = auth.uid())
  );

-- flight_evidence: lawyer sees evidence for assigned claims
CREATE POLICY "flight_evidence_lawyer_read"
  ON flight_evidence FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = flight_evidence.claim_id AND lawyer_id = auth.uid())
  );

-- claim_status_history: lawyer sees history for assigned claims
CREATE POLICY "claim_status_history_lawyer_read"
  ON claim_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM claims WHERE id = claim_status_history.claim_id AND lawyer_id = auth.uid())
  );
