/*
  # Create testimonials table

  1. New Tables
    - `testimonials`
      - `id` (uuid, primary key)
      - `name` (text) — passenger first name + last initial
      - `initials` (text) — 2-letter avatar initials
      - `route` (text) — e.g. "Ryanair · London → Amsterdam"
      - `text` (text) — the review quote
      - `stars` (integer, 1-5)
      - `amount` (text, optional) — e.g. "€400"
      - `visible` (boolean) — whether to show on homepage
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Public SELECT for visible testimonials only
    - No public insert/update/delete

  3. Seed data
    - 3 initial testimonials matching homepage design
*/

CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  initials text NOT NULL DEFAULT '',
  route text NOT NULL DEFAULT '',
  text text NOT NULL,
  stars integer NOT NULL DEFAULT 5 CHECK (stars BETWEEN 1 AND 5),
  amount text DEFAULT NULL,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read visible testimonials"
  ON testimonials FOR SELECT
  TO anon, authenticated
  USING (visible = true);

-- Seed initial testimonials
INSERT INTO testimonials (name, initials, route, text, stars, amount, visible) VALUES
  ('James R.', 'JR', 'Ryanair · London → Amsterdam', 'Ryanair ignored me for months. FlightClaim got me €400 in 3 weeks. Unbelievable service.', 5, '€400', true),
  ('Ashley M.', 'AM', 'EasyJet cancellation', 'Filed my claim in minutes, got €600 for my cancelled flight. They handled absolutely everything.', 5, '€600', true),
  ('Carlos L.', 'CL', 'Wizz Air 4h delay', 'No win no fee made it completely risk-free. €400 in my account without me lifting a finger.', 5, '€400', true),
  ('Sarah K.', 'SK', 'British Airways · Heathrow → JFK', 'My flight was delayed 5 hours and I had no idea I could claim. Got £520 back in just 4 weeks.', 5, '£520', true),
  ('Mikael T.', 'MT', 'Lufthansa cancellation', 'Submitted at midnight, had a response by morning. €600 compensation paid within 6 weeks.', 5, '€600', true),
  ('Priya N.', 'PN', 'EasyJet · Manchester → Barcelona', 'Didn''t think it would work but they kept me updated throughout. €250 received, no hassle.', 5, '€250', true);
