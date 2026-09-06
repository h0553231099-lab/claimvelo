/**
 * Shared flight cache — eliminates duplicate provider API calls for the
 * same flight identity across the Website Claim Checker (flight-lookup)
 * and the Rules Engine (evaluateClaimInternal).
 *
 * Both code paths read from and write to the `flight_cache` table using
 * the service-role client. The cache key is the normalized tuple
 * (flight_number, flight_date, origin, destination).
 *
 * Cache TTL: 24 hours. Historical flights don't change, so a 24h window
 * is safe and keeps the cache fresh for same-day lookups.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export const FLIGHT_CACHE_TTL_HOURS = 24;

export interface CachedFlight {
  id: string;
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  aerodatabox_result: unknown;
  aviationstack_result: unknown;
  verification_status: string;
  fetched_at: string;
  expires_at: string;
}

export interface CacheKey {
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
}

export interface CacheResult {
  hit: boolean;
  aerodatabox: unknown | null;   // ProviderResult or null
  aviationstack: unknown | null;   // ProviderResult or null
  verificationStatus: string;
}

function normalizeKey(key: CacheKey): {
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
} {
  return {
    flight_number: (key.flightNumber || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    flight_date: (key.flightDate || "").slice(0, 10),
    origin: (key.origin || "").trim().toUpperCase(),
    destination: (key.destination || "").trim().toUpperCase(),
  };
}

/**
 * Check flight_cache for a valid (non-expired) entry.
 * Returns hit=true with cached provider results if available.
 */
export async function getCachedFlight(
  supabase: ReturnType<typeof createClient>,
  key: CacheKey,
): Promise<CacheResult> {
  const nk = normalizeKey(key);
  if (!nk.flight_number || !nk.flight_date || !nk.origin || !nk.destination) {
    return { hit: false, aerodatabox: null, aviationstack: null, verificationStatus: "no_data" };
  }
  const { data, error } = await supabase
    .from("flight_cache")
    .select("*")
    .eq("flight_number", nk.flight_number)
    .eq("flight_date", nk.flight_date)
    .eq("origin", nk.origin)
    .eq("destination", nk.destination)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) {
    return { hit: false, aerodatabox: null, aviationstack: null, verificationStatus: "no_data" };
  }
  // Unverified data (both providers null) is NOT treated as a strong cache hit.
  // The entry exists (marking we've tried this flight) but providers should be
  // called again to get fresh data.
  const hasAero = data.aerodatabox_result != null;
  const hasAvia = data.aviationstack_result != null;
  if (!hasAero && !hasAvia) {
    return { hit: false, aerodatabox: null, aviationstack: null, verificationStatus: "no_data" };
  }
  return {
    hit: true,
    aerodatabox: data.aerodatabox_result,
    aviationstack: data.aviationstack_result,
    verificationStatus: data.verification_status || "no_data",
  };
}

/**
 * Store provider results in flight_cache (upsert on identity key).
 * Only call after at least one provider returned data.
 */
export async function setCachedFlight(
  supabase: ReturnType<typeof createClient>,
  key: CacheKey,
  aerodatabox: unknown | null,
  aviationstack: unknown | null,
  verificationStatus: string,
): Promise<void> {
  const nk = normalizeKey(key);
  if (!nk.flight_number || !nk.flight_date || !nk.origin || !nk.destination) return;

  const now = new Date();
  const expires = new Date(now.getTime() + FLIGHT_CACHE_TTL_HOURS * 60 * 60 * 1000);

  try {
    await supabase.from("flight_cache").upsert({
      flight_number: nk.flight_number,
      flight_date: nk.flight_date,
      origin: nk.origin,
      destination: nk.destination,
      aerodatabox_result: aerodatabox,
      aviationstack_result: aviationstack,
      verification_status: verificationStatus,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }, {
      onConflict: "flight_number,flight_date,origin,destination",
    });
  } catch (err) {
    console.error("flight_cache upsert failed (non-blocking):", err);
  }
}
