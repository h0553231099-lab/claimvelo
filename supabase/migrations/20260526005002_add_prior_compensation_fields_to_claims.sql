/*
  # Add prior compensation fields to claims table

  1. Changes
    - `prior_comp_type` (text, nullable) — what the passenger previously received: 'Food & Hotel Vouchers', 'Cash', or 'Flight Voucher'
    - `prior_signed` (text, nullable) — whether they signed a waiver: 'Yes', 'No', or 'Unsure'
    - `review_required` (boolean) — auto-flagged when Cash/Flight Voucher received but waiver not confirmed signed

  2. Notes
    - All columns are nullable so existing records are unaffected
    - review_required defaults to false
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'prior_comp_type'
  ) THEN
    ALTER TABLE claims ADD COLUMN prior_comp_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'prior_signed'
  ) THEN
    ALTER TABLE claims ADD COLUMN prior_signed text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'review_required'
  ) THEN
    ALTER TABLE claims ADD COLUMN review_required boolean DEFAULT false;
  END IF;
END $$;
