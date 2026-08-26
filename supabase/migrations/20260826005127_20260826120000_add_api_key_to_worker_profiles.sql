/*
  # B2B Inbound API: Add api_key to worker_profiles

  1. Purpose
    Adds a unique `api_key` column to the `worker_profiles` table so that
    external partners/agents can authenticate against the B2B inbound API
    (`/api/v1/leads`) using a Bearer token. The edge function looks up the
    incoming Bearer token in this column to identify which agent sent the
    request.

  2. New column
    - `worker_profiles.api_key` — text, unique, nullable (existing rows stay
      null until an admin assigns a key). A partial unique index ensures no
      two agents share a key while allowing multiple NULLs.

  3. Security changes
    - No new RLS policies needed. The `api_key` column is only read
      server-side by the edge function using the service-role key, which
      bypasses RLS. The column is NOT exposed to the anon-key frontend.
    - The existing "Anon can validate agent codes" policy already allows
      anon SELECT on worker_profiles. To prevent leaking api_key values to
      the public frontend, we add a column-level privilege revocation:
      the `anon` role is explicitly denied SELECT on the `api_key` column.
*/

-- Add the api_key column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_profiles' AND column_name = 'api_key'
  ) THEN
    ALTER TABLE worker_profiles ADD COLUMN api_key text;
  END IF;
END $$;

-- Unique partial index — enforces uniqueness for non-null keys, allows multiple NULLs
CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_api_key_uniq
  ON worker_profiles (api_key)
  WHERE api_key IS NOT NULL;

-- Deny anon access to the api_key column so it is never leaked via the public API
REVOKE SELECT (api_key) ON worker_profiles FROM anon;
