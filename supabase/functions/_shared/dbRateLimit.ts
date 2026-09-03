/**
 * Database-backed distributed rate limiter for Edge Functions.
 *
 * Uses the `check_rate_limit` Postgres function (created by migration
 * 20260903144000) to atomically increment a counter in a shared table.
 * Works across all isolates/instances — unlike the in-memory limiter
 * in rateLimit.ts, which is per-isolate only.
 *
 * The in-memory limiter should still be called FIRST as a zero-latency
 * first layer; this DB check is the authoritative security boundary.
 *
 * On DB failure the limiter fails OPEN (allows the request) to avoid
 * blocking legitimate traffic during a transient outage.  The in-memory
 * limiter still provides a basic guard in that scenario.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function dbRateLimit(
  key: string,
  maxCount: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  try {
    const { data: count, error } = await getClient().rpc("check_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("dbRateLimit RPC error:", error.message);
      return { allowed: true, retryAfterMs: 0 }; // fail open
    }

    if (count > maxCount) {
      // Time until the current fixed window ends
      const nowSec = Math.floor(Date.now() / 1000);
      const windowEnd = Math.ceil(nowSec / windowSeconds) * windowSeconds;
      const retryAfterMs = Math.max((windowEnd - nowSec) * 1000, 1000);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch (e) {
    console.error("dbRateLimit exception:", e);
    return { allowed: true, retryAfterMs: 0 }; // fail open
  }
}
