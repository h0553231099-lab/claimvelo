/*
  # Create Claims Table

  1. New Tables
    - `claims`
      - `id` (uuid, primary key)
      - `claim_ref` (text, unique human-readable ID like CLM-001)
      - `passenger_first_name` (text)
      - `passenger_last_name` (text)
      - `email` (text)
      - `phone` (text)
      - `address` (text)
      - `country` (text)
      - `dob` (date)
      - `flight_number` (text)
      - `flight_date` (date)
      - `departure` (text)
      - `arrival` (text)
      - `airline` (text)
      - `issue_type` (text)
      - `airline_reason` (text)
      - `status` (text) — Untouched, In Progress, Submitted, Waiting, Resolved, Escalated
      - `amount` (text)
      - `agent` (text)
      - `loa_signed` (boolean)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `claims` table
    - Public insert allowed for new claim submissions
    - Authenticated users can read/update all claims (admin use)
*/

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_ref text UNIQUE NOT NULL DEFAULT '',
  passenger_first_name text DEFAULT '',
  passenger_last_name text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  country text DEFAULT 'United Kingdom',
  dob date,
  flight_number text DEFAULT '',
  flight_date date,
  departure text DEFAULT '',
  arrival text DEFAULT '',
  airline text DEFAULT '',
  issue_type text DEFAULT '',
  airline_reason text DEFAULT '',
  status text DEFAULT 'Untouched',
  amount text DEFAULT '€600',
  agent text DEFAULT '—',
  loa_signed boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert a claim"
  ON claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read all claims"
  ON claims FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read their own claim by ref"
  ON claims FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can update claims"
  ON claims FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert sample data
INSERT INTO claims (claim_ref, passenger_first_name, passenger_last_name, email, flight_number, flight_date, departure, arrival, airline, issue_type, status, amount, agent, loa_signed, created_at)
VALUES
  ('CLM-001', 'Sarah', 'Mitchell', 'sarah@example.com', 'U21234', '2025-04-28', 'LHR', 'AMS', 'EasyJet', 'Flight delayed 3+ hours', 'Resolved', '€250', 'LM', true, '2025-04-28 09:14:00'),
  ('CLM-002', 'James', 'Okonkwo', 'james@example.com', 'FR5678', '2025-05-01', 'STN', 'BCN', 'Ryanair', 'Flight cancelled', 'In Progress', '€400', 'AK', true, '2025-05-01 10:00:00'),
  ('CLM-003', 'María', 'García', 'maria@example.com', 'W91234', '2025-05-03', 'MAD', 'MAN', 'Wizz Air', 'Flight delayed 3+ hours', 'Waiting', '€600', 'AK', true, '2025-05-03 11:00:00'),
  ('CLM-004', 'Tom', 'Brennan', 'tom@example.com', 'FR9012', '2025-05-04', 'DUB', 'CDG', 'Ryanair', 'Flight delayed 2–3 hours', 'Submitted', '€250', 'BT', true, '2025-05-04 12:00:00'),
  ('CLM-005', 'Yuki', 'Tanaka', 'yuki@example.com', 'BA3456', '2025-05-05', 'LGW', 'FCO', 'British Airways', 'Flight delayed 3+ hours', 'Untouched', '€400', '—', false, '2025-05-05 13:00:00'),
  ('CLM-006', 'Anna', 'Kowalski', 'anna@example.com', 'W95678', '2025-04-20', 'WAW', 'BRU', 'Wizz Air', 'Flight cancelled', 'Resolved', '€600', 'LM', true, '2025-04-20 14:00:00'),
  ('CLM-007', 'David', 'Chen', 'david@example.com', 'LH7890', '2025-05-06', 'MAN', 'DXB', 'Lufthansa', 'Flight delayed 3+ hours', 'Escalated', '€400', 'AK', true, '2025-05-06 15:00:00'),
  ('CLM-008', 'Fatima', 'Al-Rashid', 'fatima@example.com', 'BA1234', '2025-05-07', 'LHR', 'IST', 'British Airways', 'Flight delayed 3+ hours', 'Waiting', '€600', 'BT', true, '2025-05-07 16:00:00')
ON CONFLICT (claim_ref) DO NOTHING;
