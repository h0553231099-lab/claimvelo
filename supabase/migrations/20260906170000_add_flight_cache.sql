-- Flight cache: shared provider result store to eliminate duplicate API calls
-- for the same flight identity. Additive only — no changes to existing tables.
--
-- Keyed by normalized (flight_number, flight_date, origin, destination).
-- Both the Website Claim Checker (flight-lookup) and the Rules Engine
-- (evaluateClaimInternal) read and write to this single table.

CREATE TABLE IF NOT EXISTS flight_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalized unique flight identity (the cache key)
  flight_number   text    NOT NULL,   -- uppercased, alphanumeric only, e.g. 'AA1234'
  flight_date     date    NOT NULL,
  origin          text    NOT NULL,   -- uppercased IATA, e.g. 'LHR'
  destination     text    NOT NULL,    -- uppercased IATA, e.g. 'CDG'

  -- Normalized provider results (same shape as ProviderResult from evaluate.ts)
  aerodatabox_result jsonb,            -- full ProviderResult or null
  aviationstack_result jsonb,          -- full ProviderResult or null

  -- Verification status from cross-check
  verification_status text NOT NULL DEFAULT 'no_data',
    -- 'matched' | 'mismatch' | 'incomplete' | 'conflict' | 'no_data' | 'cancelled' | 'carrier_conflict'

  -- TTL
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per unique flight identity
CREATE UNIQUE INDEX IF NOT EXISTS idx_flight_cache_identity
  ON flight_cache (flight_number, flight_date, origin, destination);

-- Enable RLS (service-role bypasses; anon key cannot read raw provider data)
ALTER TABLE flight_cache ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION flight_cache_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flight_cache_updated_at ON flight_cache;
CREATE TRIGGER flight_cache_updated_at
  BEFORE UPDATE ON flight_cache
  FOR EACH ROW
  EXECUTE FUNCTION flight_cache_set_updated_at();
