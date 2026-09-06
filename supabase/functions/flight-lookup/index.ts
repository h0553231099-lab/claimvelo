import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { rateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { dbRateLimit } from "../_shared/dbRateLimit.ts";
import { getCachedFlight, setCachedFlight } from "../_shared/flightCache.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { fetchAeroDataBox, fetchAviationStack } from "../_shared/evaluate.ts";
import type { ProviderResult } from "../_shared/evaluate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FlightResult {
  flightNum: string;
  airline: string;
  depAirport: string;
  depCode: string;
  arrAirport: string;
  arrCode: string;
  depTime: string;
  arrTime: string;
  actualDepTime: string | null;
  actualArrTime: string | null;
  delayMin: number;
  status: string;
  date: string;
}

/** Convert ProviderResult (from evaluate.ts) to FlightResult[] (for the website UI). */
function providerResultToFlightResults(pr: ProviderResult | null): FlightResult[] {
  if (!pr || !pr.flights || !pr.flights.length) return [];
  return pr.flights.map((f) => ({
    flightNum: f.flightNumber,
    airline: f.operatingCarrierName || airlineFromCode(f.flightNumber),
    depAirport: f.origin,
    depCode: f.origin,
    arrAirport: f.destination,
    arrCode: f.destination,
    depTime: f.scheduledDeparture ? f.scheduledDeparture.slice(11, 16) : "",
    arrTime: f.scheduledArrival ? f.scheduledArrival.slice(11, 16) : "",
    actualDepTime: f.actualDeparture ? f.actualDeparture.slice(11, 16) : null,
    actualArrTime: f.actualArrival ? f.actualArrival.slice(11, 16) : null,
    delayMin: f.delayMinutes || 0,
    status: f.status,
    date: f.flightDate,
  }));
}

function airlineFromCode(code: string): string {
  const map: Record<string, string> = {
    BA: "British Airways", FR: "Ryanair", EZY: "easyJet", LH: "Lufthansa",
    AF: "Air France", KL: "KLM", IB: "Iberia", AZ: "Alitalia",
    SK: "SAS", AY: "Finnair", OS: "Austrian Airlines", LX: "Swiss International",
    TK: "Turkish Airlines", EK: "Emirates", QR: "Qatar Airways",
    EY: "Etihad Airways", SQ: "Singapore Airlines", AA: "American Airlines",
    DL: "Delta Air Lines", UA: "United Airlines", WN: "Southwest Airlines",
    B6: "JetBlue Airways", NK: "Spirit Airlines", F9: "Frontier Airlines",
    AC: "Air Canada", WS: "WestJet", VY: "Vueling", U2: "easyJet",
    W6: "Wizz Air", PC: "Pegasus Airlines", VS: "Virgin Atlantic",
    TP: "TAP Air Portugal", SN: "Brussels Airlines", BT: "airBaltic",
    A3: "Aegean Airlines", FB: "Bulgaria Air", RO: "TAROM",
  };
  const prefix = code.replace(/\d+$/, "").toUpperCase();
  return map[prefix] || map[prefix.slice(0, 2)] || "Unknown Airline";
}

function mapAviationStackFlight(f: Record<string, unknown>, fallbackFlightNumber: string, date: string): FlightResult {
  const dep = f.departure as Record<string, unknown>;
  const arr = f.arrival as Record<string, unknown>;
  const airline = f.airline as Record<string, unknown>;
  const flight = f.flight as Record<string, unknown>;
  const schedDep = dep?.scheduled as string | null;
  const actualDep = (dep?.actual || dep?.estimated) as string | null;
  const schedArr = arr?.scheduled as string | null;
  const actualArr = (arr?.actual || arr?.estimated) as string | null;
  let delayMin = 0;
  if (schedArr && actualArr) {
    delayMin = Math.max(0, Math.round((new Date(actualArr).getTime() - new Date(schedArr).getTime()) / 60000));
  } else if (dep?.delay) {
    delayMin = Number(dep.delay) || 0;
  }
  const flightNum = (flight?.iata as string) || fallbackFlightNumber.toUpperCase();
  return {
    flightNum,
    airline: (airline?.name as string) || airlineFromCode(flightNum),
    depAirport: (dep?.airport as string) || "",
    depCode: (dep?.iata as string) || "",
    arrAirport: (arr?.airport as string) || "",
    arrCode: (arr?.iata as string) || "",
    depTime: schedDep ? schedDep.slice(11, 16) : "",
    arrTime: schedArr ? schedArr.slice(11, 16) : "",
    actualDepTime: actualDep ? actualDep.slice(11, 16) : null,
    actualArrTime: actualArr ? actualArr.slice(11, 16) : null,
    delayMin,
    status: (f.flight_status as string) || "scheduled",
    date: (f.flight_date as string) || date,
  };
}

// AviationStack free plan: no flight_date filter, no route filter — returns live flights only.
// Paid plan supports flight_date and dep/arr filtering.
// We try with flight_date first (works on paid), then without (works on free for live data).
async function tryAviationStackByFlight(flightNumber: string, date: string, apiKey: string): Promise<{ flights: FlightResult[] | null; rawError?: string }> {
  const iata = flightNumber.replace(/\s/g, "").toUpperCase();

  // Attempt 1: with flight_date (paid plan feature)
  try {
    const params = new URLSearchParams({ access_key: apiKey, flight_iata: iata, flight_date: date });
    const res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
    const raw = await res.json();
    if (!raw.error && raw.data?.length) {
      return { flights: raw.data.map((f: Record<string, unknown>) => mapAviationStackFlight(f, flightNumber, date)) };
    }
    // Attempt 2: without flight_date (free plan — live flights only)
    const params2 = new URLSearchParams({ access_key: apiKey, flight_iata: iata });
    const res2 = await fetch(`http://api.aviationstack.com/v1/flights?${params2}`);
    const raw2 = await res2.json();
    if (!raw2.error && raw2.data?.length) {
      return { flights: raw2.data.map((f: Record<string, unknown>) => mapAviationStackFlight(f, flightNumber, date)) };
    }
    const errMsg = raw2.error?.info || raw.error?.info || "No data returned";
    return { flights: null, rawError: errMsg };
  } catch (e) {
    return { flights: null, rawError: String(e) };
  }
}

async function tryAviationStackByRoute(depCode: string, arrCode: string, date: string, apiKey: string): Promise<{ flights: FlightResult[] | null; rawError?: string }> {
  // Attempt 1: with dep+arr+date (paid plan)
  try {
    const params = new URLSearchParams({
      access_key: apiKey,
      dep_iata: depCode.toUpperCase(),
      arr_iata: arrCode.toUpperCase(),
      flight_date: date,
      limit: "20",
    });
    const res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
    const raw = await res.json();
    if (!raw.error && raw.data?.length) {
      return { flights: raw.data.map((f: Record<string, unknown>) => mapAviationStackFlight(f, "", date)) };
    }
    // Attempt 2: just dep+arr, no date (free plan — live)
    const params2 = new URLSearchParams({
      access_key: apiKey,
      dep_iata: depCode.toUpperCase(),
      arr_iata: arrCode.toUpperCase(),
      limit: "20",
    });
    const res2 = await fetch(`http://api.aviationstack.com/v1/flights?${params2}`);
    const raw2 = await res2.json();
    if (!raw2.error && raw2.data?.length) {
      return { flights: raw2.data.map((f: Record<string, unknown>) => mapAviationStackFlight(f, "", date)) };
    }
    const errMsg = raw2.error?.info || raw.error?.info || "No data returned";
    return { flights: null, rawError: errMsg };
  } catch (e) {
    return { flights: null, rawError: String(e) };
  }
}

async function tryAeroDataBox(flightNumber: string, date: string, apiKey: string): Promise<FlightResult[] | null> {
  try {
    const iata = flightNumber.replace(/\s/g, "").toUpperCase();
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${iata}/${date}`,
      { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    return data.map((f: Record<string, unknown>) => {
      const dep = f.departure as Record<string, unknown>;
      const arr = f.arrival as Record<string, unknown>;
      const airline = f.airline as Record<string, unknown>;
      const depSched = dep?.scheduledTime as Record<string, unknown>;
      const depActual = dep?.actualTime as Record<string, unknown>;
      const arrSched = arr?.scheduledTime as Record<string, unknown>;
      const arrActual = arr?.actualTime as Record<string, unknown>;
      const schedArr = (arrSched?.local || arrSched?.utc) as string | null;
      const actualArr = (arrActual?.local || arrActual?.utc) as string | null;
      const schedDep = (depSched?.local || depSched?.utc) as string | null;
      const actualDep = (depActual?.local || depActual?.utc) as string | null;
      let delayMin = 0;
      if (schedArr && actualArr) {
        delayMin = Math.max(0, Math.round((new Date(actualArr).getTime() - new Date(schedArr).getTime()) / 60000));
      }
      const depAirport = dep?.airport as Record<string, unknown>;
      const arrAirport = arr?.airport as Record<string, unknown>;
      return {
        flightNum: (f.number as string) || iata,
        airline: (airline?.name as string) || airlineFromCode(flightNumber),
        depAirport: (depAirport?.name as string) || "",
        depCode: (depAirport?.iata as string) || "",
        arrAirport: (arrAirport?.name as string) || "",
        arrCode: (arrAirport?.iata as string) || "",
        depTime: schedDep ? schedDep.slice(11, 16) : "",
        arrTime: schedArr ? schedArr.slice(11, 16) : "",
        actualDepTime: actualDep ? actualDep.slice(11, 16) : null,
        actualArrTime: actualArr ? actualArr.slice(11, 16) : null,
        delayMin,
        status: (f.status as string) || "scheduled",
        date,
      };
    });
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // ── Abuse protection: rate limit per client IP ──────────────────────────────
  // Public endpoint (claim form flight lookup) — no login required.
  // Limits abuse of the AviationStack / AeroDataBox API quotas.
  const ip = getClientIp(req);
  const { allowed, retryAfterMs } = rateLimit(`flight-lookup:${ip}`, 20, 60_000);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again shortly." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      },
    );
  }

  // ── Distributed rate limit (DB-backed, authoritative across isolates) ──────
  const { allowed: dbAllowed, retryAfterMs: dbRetryMs } = await dbRateLimit(`flight-lookup:${ip}`, 20, 60);
  if (!dbAllowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again shortly." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(dbRetryMs / 1000)),
        },
      },
    );
  }

  try {
    const { flightNumber, date, depCode, arrCode } = await req.json();

    if (!date) {
      return new Response(
        JSON.stringify({ error: "date is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aviationKey = Deno.env.get("AVIATIONSTACK_API_KEY");
    const aeroKey = Deno.env.get("AERODATABOX_API_KEY");
    let flights: FlightResult[] | null = null;
    let apiNote = "";

    // Service-role client for shared flight cache access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (flightNumber?.trim()) {
      const fn = flightNumber.trim();
      const dc = (depCode || "").trim().toUpperCase();
      const ac = (arrCode || "").trim().toUpperCase();

      // Check shared flight cache first (only when origin+destination are known)
      const cached = await getCachedFlight(supabase, {
        flightNumber: fn, flightDate: date, origin: dc, destination: ac,
      });

      if (cached.hit) {
        // Cache hit — 0 provider calls
        flights = [];
        if (cached.aerodatabox) {
          flights.push(...providerResultToFlightResults(cached.aerodatabox as ProviderResult));
        }
        if (!flights.length && cached.aviationstack) {
          flights.push(...providerResultToFlightResults(cached.aviationstack as ProviderResult));
        }
      } else {
        // Cache miss — call providers (same fallback order as before)
        let aeroResult: ProviderResult | null = null;
        let aviaResult: ProviderResult | null = null;

        if (aeroKey) {
          aeroResult = await fetchAeroDataBox(fn, date, aeroKey);
          if (aeroResult) flights = providerResultToFlightResults(aeroResult);
        }
        if (!flights?.length && aviationKey) {
          aviaResult = await fetchAviationStack(fn, date, aviationKey);
          if (aviaResult) flights = providerResultToFlightResults(aviaResult);
        }

        // Store in shared cache (always — even null results refresh expired entries)
        await setCachedFlight(supabase,
          { flightNumber: fn, flightDate: date, origin: dc, destination: ac },
          aeroResult, aviaResult, "no_data",
        );
      }
    } else if (depCode && arrCode) {
      // Route search — AviationStack only (no cache, different key structure)
      if (aviationKey) {
        const result = await tryAviationStackByRoute(depCode, arrCode, date, aviationKey);
        flights = result.flights;
        if (result.rawError) apiNote = result.rawError;
      }
    }

    if (flightNumber?.trim() && flights?.length) {
      const requestedFlight = flightNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      flights = flights.filter((flight) => {
        const returnedFlight = flight.flightNum.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        return returnedFlight === requestedFlight;
      });
    }

    if (!flights?.length) {
      // Never expose raw API error messages to users
      void apiNote; // logged internally but not shown
      return new Response(
        JSON.stringify({ flights: [], error: "No flight data found for this flight number and date. Please enter your flight details manually below." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ flights }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
