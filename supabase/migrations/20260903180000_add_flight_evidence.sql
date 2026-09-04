/*
  # Phase B.1 — Flight evidence & eligibility-decision audit table

  ## Purpose
  Preserves the flight-data evidence and eligibility decision for every
  evaluated claim so the decision can be reproduced and audited. Raw provider
  responses are stored here SERVER-SIDE ONLY — never exposed to the frontend.

  ## Design choice (clean schema, not 25 flat columns)
  Rather than bolting two dozen columns onto `claims`, the evidence is
  normalized into a dedicated 1:1 table (`flight_evidence`). Scalar fields
  that the engine reasons about (source, fetch time, normalized scheduled /
  actual times, status, cross-check verdict) are real columns for indexing
  and querying; the raw provider payload and the per-field cross-check
  breakdown are JSONB. The eligibility decision itself still lives on
  `claims.status` (RLS-governed, customer-visible); this table holds the
  reproducible proof behind it.

  ## Security
  - RLS enabled with NO policies → only the service role (Edge Functions)
    can read/write. Anonymous AND authenticated clients are denied all
    direct access, so raw provider evidence never reaches any frontend.
  - This does NOT touch any existing claims/RLS/auth/rate-limit control.

  ## Rollback
  DROP TABLE IF EXISTS flight_evidence;  (see end of file for a guarded helper)
*/

CREATE TABLE IF NOT EXISTS flight_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1:1 link to the claim this evidence belongs to
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Where the flight data came from + when it was fetched
  data_source text,                -- 'aerodatabox' | 'aviationstack' | 'none'
  fetch_timestamp timestamptz,     -- when the provider was queried

  -- Flight identity as VERIFIED by the provider (normalized)
  flight_number_verified text,     -- normalized IATA number, e.g. 'BA245'
  flight_date_verified date,       -- departure date from provider
  origin_verified text,             -- IATA origin from provider
  destination_verified text,        -- IATA destination from provider

  -- Normalized scheduled / actual times (ISO 8601, UTC where available)
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,

  -- Derived delay + provider flight status
  delay_minutes integer,
  flight_status text,              -- e.g. 'landed', 'cancelled', 'scheduled'

  -- Cross-check verdict between the claim and the provider data
  cross_check_status text NOT NULL, -- 'matched' | 'mismatch' | 'incomplete' | 'conflict' | 'no_data'
  cross_check_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- e.g. {"flight_number":"match","flight_date":"match","origin":"mismatch","destination":"match","provider_conflict":false}

  -- Raw provider response(s) — SERVER-SIDE ONLY, never sent to the frontend
  provider_evidence jsonb,

  -- The decision this evidence supports + human-readable reason
  decision text NOT NULL,           -- 'Eligible' | 'Not Eligible' | 'Not Eligible - Expired' | 'Pending Check'
  decision_reason text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One evidence row per claim (latest evaluation wins, upserted)
  UNIQUE (claim_id)
);

CREATE INDEX IF NOT EXISTS idx_flight_evidence_claim_id
  ON flight_evidence(claim_id);

CREATE INDEX IF NOT EXISTS idx_flight_evidence_decision
  ON flight_evidence(decision);

-- ── Row Level Security: server-side only ────────────────────────────────────
-- No policies are defined, so anon AND authenticated roles are denied all
-- access. Only the service role (Edge Functions) bypasses RLS. This keeps raw
-- provider evidence off every frontend (customer and staff dashboards alike).
ALTER TABLE flight_evidence ENABLE ROW LEVEL SECURITY;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION flight_evidence_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flight_evidence_updated_at ON flight_evidence;
CREATE TRIGGER flight_evidence_updated_at
  BEFORE UPDATE ON flight_evidence
  FOR EACH ROW EXECUTE FUNCTION flight_evidence_set_updated_at();

-- ── Guarded rollback helper (run manually if needed; not auto-executed) ──────
-- To roll back this migration only:
--   DROP TABLE IF EXISTS flight_evidence CASCADE;
--   DROP FUNCTION IF EXISTS flight_evidence_set_updated_at();
