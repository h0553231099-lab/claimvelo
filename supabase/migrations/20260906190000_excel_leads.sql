/*
  # Excel Leads MVP — additive ingestion layer

  Creates four NEW tables for the Excel/CSV bulk-import → lead pipeline.
  This migration is purely additive: it does NOT modify claims, legal, finance,
  commissions, or any existing table. No claims are created during import.

  Tables (creation order respects FK dependencies):
    - import_batches       : one row per uploaded file (metadata + summary)
    - leads                : one row per passenger within a booking (never 1:1 with a row)
    - import_raw_rows      : every original parsed Excel row, pre- and post-dedup
    - lead_flight_segments : ordered flight segments attached to a lead

  Security:
    - RLS enabled on all four tables.
    - SELECT: admin / super_admin only (so the Lead Queue + Import screens can read).
    - No INSERT/UPDATE/DELETE policies for authenticated users — only the
      service role (the process-excel-import Edge Function) can mutate, and it
      bypasses RLS.
    - claims is NOT touched; lead.claim_id is a nullable FK reserved for the
      future Lead → Claim conversion step (not built in this MVP).
*/

-- ── import_batches ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL DEFAULT '',
  agent_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL,
  agent_code text NOT NULL DEFAULT '—',
  total_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid,
  created_by_email text NOT NULL DEFAULT '',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at
  ON import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_agent_id
  ON import_batches(agent_id) WHERE agent_id IS NOT NULL;

-- ── leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  booking_reference text NOT NULL DEFAULT '',
  passenger_first_name text NOT NULL DEFAULT '',
  passenger_last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  agent_id uuid REFERENCES worker_profiles(id) ON DELETE SET NULL,
  agent_code text NOT NULL DEFAULT '—',
  status text NOT NULL DEFAULT 'READY'
    CHECK (status IN ('READY', 'WARNING', 'REVIEW', 'FUTURE', 'DUPLICATE')),
  review_reason text NOT NULL DEFAULT '',
  segment_count integer NOT NULL DEFAULT 0,
  first_flight_date date,
  last_flight_date date,
  route text NOT NULL DEFAULT '',
  claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  lead_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- lead_key is the stable identity of a passenger within a booking.
-- A unique index on it prevents re-importing the same file from creating
-- duplicate leads (the Edge Function checks existence before inserting).
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lead_key_unique
  ON leads(lead_key)
  WHERE lead_key <> '';

CREATE INDEX IF NOT EXISTS idx_leads_batch_id ON leads(batch_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_agent_id
  ON leads(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- ── import_raw_rows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_raw_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  pnr text NOT NULL DEFAULT '',
  passenger_name text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  flight_number text NOT NULL DEFAULT '',
  flight_date date,
  origin text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  delay_minutes integer,
  delay_reason text NOT NULL DEFAULT '',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'valid',
  validation_errors text[] NOT NULL DEFAULT '{}',
  dedup_status text NOT NULL DEFAULT 'unique',
  dedup_key text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_raw_rows_batch_id
  ON import_raw_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_raw_rows_lead_id
  ON import_raw_rows(lead_id) WHERE lead_id IS NOT NULL;

-- ── lead_flight_segments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_flight_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  segment_order integer NOT NULL,
  flight_number text NOT NULL DEFAULT '',
  flight_date date NOT NULL,
  origin text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  delay_minutes integer,
  delay_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, segment_order)
);

CREATE INDEX IF NOT EXISTS idx_lead_flight_segments_lead_id
  ON lead_flight_segments(lead_id);

-- ── updated_at trigger for leads ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION leads_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- All four tables: admin / super_admin can SELECT (for the Lead Queue + Import
-- screens). No authenticated INSERT/UPDATE/DELETE — only the service role
-- (process-excel-import Edge Function) mutates, and it bypasses RLS.

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_flight_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_batches_admin_read" ON import_batches;
CREATE POLICY "import_batches_admin_read"
  ON import_batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS "import_raw_rows_admin_read" ON import_raw_rows;
CREATE POLICY "import_raw_rows_admin_read"
  ON import_raw_rows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS "leads_admin_read" ON leads;
CREATE POLICY "leads_admin_read"
  ON leads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS "lead_flight_segments_admin_read" ON lead_flight_segments;
CREATE POLICY "lead_flight_segments_admin_read"
  ON lead_flight_segments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));
