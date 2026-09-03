/*
  # Distributed rate-limit table and atomic check function

  ## Purpose
  Provides a database-backed rate limiter that works across all Edge Function
  isolates/instances.  The in-memory limiter (_shared/rateLimit.ts) remains as
  a zero-latency first layer, but this table is the authoritative boundary.

  ## Security
  - RLS enabled with NO public policies → only service_role can read/write
    (service_role bypasses RLS).
  - EXECUTE on check_rate_limit revoked from anon and authenticated → only
    the service role can call the function via RPC.

  ## Cleanup
  The check_rate_limit function deletes entries older than 2× the window
  size on every call, so the table stays bounded without a cron job.
*/

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key         text        NOT NULL,
  window_start timestamptz NOT NULL,
  count       int         NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No SELECT / INSERT / UPDATE / DELETE policies — only service_role can access.

-- ── Atomic rate-limit check function ──────────────────────────────────────────
-- Increments the counter for the current fixed window and returns the new
-- count.  The caller compares the returned count to its own limit threshold.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_window_seconds int
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count        int;
  v_window_start timestamptz;
BEGIN
  -- Start of the current fixed window (UTC epoch truncated to window size)
  v_window_start := to_timestamp(
    floor(extract(epoch from now() AT TIME ZONE 'UTC') / p_window_seconds)
      * p_window_seconds
  );

  -- Clean up entries older than 2× the window (safe, self-bounding)
  DELETE FROM rate_limits
  WHERE window_start < now() - make_interval(secs => p_window_seconds * 2);

  -- Atomic increment via upsert — works across concurrent isolates
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Only the service role can call this function
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, int) FROM anon, authenticated;
