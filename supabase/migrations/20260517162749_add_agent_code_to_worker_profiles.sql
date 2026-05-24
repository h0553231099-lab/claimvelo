/*
  # Add agent_code to worker_profiles

  1. Changes
    - `worker_profiles`: adds `agent_code` text column (unique, uppercase short code like "GFF")
  
  2. Security
    - Adds anon SELECT policy so unauthenticated users (claim form) can validate agent codes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_profiles' AND column_name = 'agent_code'
  ) THEN
    ALTER TABLE worker_profiles ADD COLUMN agent_code text NOT NULL DEFAULT '';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_agent_code_idx 
  ON worker_profiles(agent_code) WHERE agent_code <> '';

CREATE POLICY "Anyone can validate agent codes"
  ON worker_profiles FOR SELECT
  TO anon
  USING (true);
