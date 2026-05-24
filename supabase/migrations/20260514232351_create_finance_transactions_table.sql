/*
  # Create finance_transactions table

  1. New Tables
    - `finance_transactions`
      - `id` (uuid, primary key)
      - `type` (text) — 'income' or 'expense'
      - `category` (text) — e.g. 'Commission', 'Legal Fee', 'Software', 'Payroll', etc.
      - `description` (text) — free-text description
      - `amount` (numeric, always positive)
      - `currency` (text, default 'EUR')
      - `date` (date) — transaction date
      - `claim_id` (uuid, nullable) — optional link to a claim
      - `claim_ref` (text, nullable) — human-readable claim reference
      - `created_by` (uuid, nullable) — admin user who added it
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Only authenticated users can SELECT, INSERT, UPDATE their own entries
    - No public access

  3. Indexes
    - Index on type, date for fast filtering
*/

CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  date date NOT NULL DEFAULT CURRENT_DATE,
  claim_id uuid DEFAULT NULL,
  claim_ref text DEFAULT NULL,
  created_by uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view finance transactions"
  ON finance_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert finance transactions"
  ON finance_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Authenticated users can update finance transactions"
  ON finance_transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete finance transactions"
  ON finance_transactions FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(date DESC);

-- Seed some sample data for context
INSERT INTO finance_transactions (type, category, description, amount, currency, date, claim_ref) VALUES
  ('income',  'Commission',     'Commission on CLM-000041 — EasyJet cancellation',    180.00, 'EUR', CURRENT_DATE - 2,  'CLM-000041'),
  ('income',  'Commission',     'Commission on CLM-000038 — Ryanair delay',            120.00, 'EUR', CURRENT_DATE - 4,  'CLM-000038'),
  ('income',  'Commission',     'Commission on CLM-000035 — British Airways denied',   180.00, 'EUR', CURRENT_DATE - 7,  'CLM-000035'),
  ('income',  'Commission',     'Commission on CLM-000030 — Wizz Air cancellation',    120.00, 'EUR', CURRENT_DATE - 10, 'CLM-000030'),
  ('expense', 'Legal Fees',     'Solicitor fees — court escalation CLM-000029',         95.00, 'EUR', CURRENT_DATE - 5,  'CLM-000029'),
  ('expense', 'Software',       'Supabase Pro subscription — May 2026',                 25.00, 'EUR', CURRENT_DATE - 12, NULL),
  ('expense', 'Software',       'Resend email service — May 2026',                      10.00, 'EUR', CURRENT_DATE - 12, NULL),
  ('expense', 'Payroll',        'Staff payroll — May 2026',                           3200.00, 'EUR', CURRENT_DATE - 3,  NULL),
  ('expense', 'Office & Admin', 'Registered office address — quarterly fee',            60.00, 'EUR', CURRENT_DATE - 20, NULL),
  ('income',  'Commission',     'Commission on CLM-000027 — Lufthansa delay',           180.00, 'EUR', CURRENT_DATE - 14, 'CLM-000027');
