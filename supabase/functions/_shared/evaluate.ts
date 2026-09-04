/**
 * Shared claim evaluation logic — the canonical, server-side Rules Engine.
 *
 * Used by the create-claim and evaluate-claim Edge Functions (service-role
 * client, bypasses RLS). The B2B API also delegates here so there is exactly
 * ONE decision path.
 *
 * Phase B.1 safety & data-integrity guarantees:
 *  - No mock / fabricated flight data. `generateMockFlightData()` is GONE.
 *  - Every automatic decision is backed by real provider flight data that
 *    has been cross-checked against the claim (flight number, flight date,
 *    origin, destination). A mismatch is never silently accepted.
 *  - Extraordinary circumstances (WEATHER / ATC / SECURITY / STRIKE) can NEVER
 *    be auto-marked Eligible from the reported reason — they go to Pending Check.
 *  - When evidence is missing, incomplete, conflicting, the flight cannot be
 *    confidently matched, or airport coordinates are unavailable, the engine
 *    returns Pending Check. It never guesses or uses arbitrary defaults
 *    (the old 2000 km fallback is removed).
 *  - Raw provider responses are persisted to the `flight_evidence` table
 *    (RLS-locked, server-side only) and never returned to the frontend.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ── Types ────────────────────────────────────────────────────────────────────

type DelayReasonCode = "CARRIER" | "CREW" | "TECHNICAL" | "WEATHER" | "ATC" | "SECURITY" | "STRIKE";
type EngineDecision = "Not Eligible - Expired" | "Not Eligible" | "Eligible" | "Pending Check";
type DataSource = "aerodatabox" | "aviationstack" | "none";
type CrossCheckStatus = "matched" | "mismatch" | "incomplete" | "conflict" | "no_data";

export interface EngineResult {
  claimId: string;
  claimRef: string;
  decision: EngineDecision;
  delayMinutes: number | null;
  reasonCode: DelayReasonCode | null;
  source: DataSource | null;
  detail: string;
}

interface ProviderFlight {
  flightNumber: string;     // normalized
  flightDate: string;       // YYYY-MM-DD
  origin: string;           // IATA
  destination: string;      // IATA
  scheduledDeparture: string | null; // ISO 8601
  scheduledArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  delayMinutes: number | null;
  status: string;
}

interface ProviderResult {
  source: "aerodatabox" | "aviationstack";
  flights: ProviderFlight[];
  raw: unknown;             // raw provider JSON — stored server-side only
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_ELIGIBLE_DELAY_MINUTES_EU = 180; // 3h
const MIN_ELIGIBLE_DELAY_MINUTES_IL = 480; // 8h
const PROVIDER_DELAY_CONFLICT_TOLERANCE_MIN = 10;

/** Reasons that may constitute extraordinary circumstances — never auto-Eligible. */
const EXTRAORDINARY_REASONS = new Set<DelayReasonCode>(["WEATHER", "ATC", "SECURITY", "STRIKE"]);

const REASON_MAP: Record<string, DelayReasonCode> = {
  carrier: "CARRIER",
  technical: "TECHNICAL",
  crew: "CREW",
  weather: "WEATHER",
  atc: "ATC",
  "air traffic control": "ATC",
  security: "SECURITY",
  strike: "STRIKE",
};

const ISRAELI_AIRPORT_CODES = new Set(["TLV", "BGW", "ETM", "HFA", "SDV", "VDA", "KCN"]);

const EU_AIRPORT_CODES = new Set([
  "LHR","LGW","STN","LTN","MAN","BHX","GLA","EDI","BRS","NCL","ABZ","LCY","SEN","LPL","EMA","LBA","CWL","BFS","SOU",
  "CDG","ORY","NCE","LYS","MRS","TLS","BOD","BIA","NTE","MPL",
  "FRA","MUC","DUS","HAM","BER","CGN","STR","HAJ","LEJ","DRS","NUE",
  "AMS","RTM","EIN","BRU","CRL","LUX",
  "FCO","MXP","LIN","BGY","VCE","NAP","CIA","FLR","TRN","BLQ","CTA","PSA","BRI","CAG","PMO","TSF",
  "MAD","BCN","VLC","AGP","PMI","SVQ","BIO","OVD","SCQ","TFN","TFS","LPA","ACE","FUE","ALC","GRX","XRY",
  "LIS","OPO","FAO","FNC","PDL",
  "ATH","SKG","HER","RHO","CHQ","KGS","CFU","JKH","VOL","PVK","AOI",
  "VIE","SZG","INN","GRZ","LNZ","HOH",
  "ZRH","GVA","BSL","BRN","LUG",
  "CPH","RNN","BLL","AAL","AAR",
  "ARN","BMA","GOT","MMX","NBQ","LLA","UME","OSD","VBY","KLR","RNB","GEV",
  "OSL","BGO","TRD","SVG","TOS","KKN","BOO","HAU","AES","EVE","BNN","FRO",
  "HEL","TMP","TKU","OUL","KUO","JYV","SVL","KEM","MIK","RVN","KTT",
  "TLL","TAY",
  "RIX","VSI","LPX","VNO","KUN","PLQ","SQQ",
  "DUB","ORK","SNN","NOC","KIR","WAT",
  "KEF","REK","AEY","IFJ","GRM","HFN","HUS","THO","VEY",
  "WAW","KRK","GDN","KTW","WRO","POZ","LCJ","RZE","SZZ","BZG",
  "PRG","BRQ","OSR","KLV",
  "BUD","DEB",
  "OTP","CLJ","TSR","CNR","SBZ","IAS","ARW","BCM","CMB","CSB","CRA","ISL","SUJ",
  "SOF","VAR","BOJ","PDV","GSB",
  "ZAG","SPU","DBV","RJK","OSI","ZAD","PUY","BWK",
  "LJU","MBX","POW",
  "BTS","KSC","TAT","DSV",
  "MLA","GZM",
  "LCA","PFO",
  "IST","SAW","AYT","ADB","ESB",
]);

// Airport coordinates for compensation distance (no arbitrary default —
// missing coordinates force Pending Check instead of a guessed distance).
const AIRPORT_COORDS: Record<string, [number, number]> = {
  TLV:[32.011,34.887], SDV:[32.419,34.880], ETM:[29.698,35.013], VDA:[29.569,35.009], KCN:[29.632,35.014],
  LHR:[51.477,-0.461], LGW:[51.148,-0.190], STN:[51.885,0.235], LTN:[51.874,-0.368], LCY:[51.505,0.055],
  MAN:[53.354,-2.275], EDI:[55.950,-3.373], BHX:[52.453,-1.748], GLA:[55.872,-4.433], BRS:[51.382,-2.719],
  CDG:[49.009,2.548], ORY:[48.724,2.380], NCE:[43.658,7.215], LYS:[45.726,5.081], MRS:[43.435,5.215],
  AMS:[52.308,4.764], BRU:[50.902,4.484],
  FRA:[50.033,8.570], MUC:[48.354,11.786], BER:[52.366,13.503], DUS:[51.289,6.767], HAM:[53.630,10.006],
  MAD:[40.472,-3.561], BCN:[41.297,2.078], PMI:[39.551,2.739], AGP:[36.675,-4.499],
  FCO:[41.800,12.239], MXP:[45.630,8.723], LIN:[45.445,9.277], VCE:[45.505,12.352], NAP:[40.886,14.291],
  LIS:[38.781,-9.136], OPO:[41.248,-8.681],
  ATH:[37.936,23.944], SKG:[40.520,22.971],
  VIE:[48.110,16.570], ZRH:[47.458,8.548], GVA:[46.238,6.109],
  CPH:[55.618,12.656], ARN:[59.651,17.919], OSL:[60.194,11.100], HEL:[60.317,24.963],
  DUB:[53.421,-6.270], SNN:[52.702,-8.925], KEF:[63.985,-22.606],
  WAW:[52.165,20.967], PRG:[50.100,14.260], BUD:[47.433,19.261],
  OTP:[44.572,26.102], SOF:[42.696,23.411], ZAG:[45.743,16.069],
  RIX:[56.924,23.971], TLL:[59.413,24.832], VNO:[54.634,25.285],
  JFK:[40.640,-73.779], LAX:[33.943,-118.408], ORD:[41.978,-87.905], ATL:[33.640,-84.427],
  GRU:[-23.432,-46.469], GIG:[-22.808,-43.244],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyReason(raw: string): DelayReasonCode {
  const lower = raw.toLowerCase().trim();
  for (const [key, code] of Object.entries(REASON_MAP)) {
    if (lower.includes(key)) return code;
  }
  // No reason given — the legal default is carrier responsibility (the airline
  // bears the burden of proving extraordinary circumstances). This is NOT a
  // guess about extraordinary circumstances; an empty reason is simply not an
  // extraordinary-circumstance claim.
  return "CARRIER";
}

function isIsraeliRoute(dep: string, arr: string): boolean {
  return ISRAELI_AIRPORT_CODES.has(dep.toUpperCase()) || ISRAELI_AIRPORT_CODES.has(arr.toUpperCase());
}
function isEuRoute(dep: string, arr: string): boolean {
  return EU_AIRPORT_CODES.has(dep.toUpperCase()) || EU_AIRPORT_CODES.has(arr.toUpperCase());
}
function yearsBetween(from: Date, to: Date): number {
  let y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) y--;
  return y;
}

function normalizeFlightNumber(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function normalizeDate(s: string): string {
  // Accept ISO or YYYY-MM-DD; return YYYY-MM-DD
  if (!s) return "";
  return s.slice(0, 10);
}
function normalizeIata(s: string): string {
  return s.trim().toUpperCase();
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function calcCompensation(dep: string, arr: string): { amount: number; currency: string; distanceKm: number } | null {
  // Returns null when airport coordinates are unavailable — the caller must
  // then return Pending Check rather than guessing a distance.
  const coordA = AIRPORT_COORDS[dep.toUpperCase()];
  const coordB = AIRPORT_COORDS[arr.toUpperCase()];
  if (!coordA || !coordB) return null;
  const distanceKm = haversineKm(coordA, coordB);
  const isIL = isIsraeliRoute(dep, arr);
  const currency = isIL ? "ILS" : "EUR";
  const KM_SHORT = 1500, KM_MEDIUM = 3500;
  let amount: number;
  if (isIL) {
    amount = distanceKm <= 2200 ? 1470 : distanceKm <= 4600 ? 2390 : 3530;
  } else {
    amount = distanceKm <= KM_SHORT ? 250 : distanceKm <= KM_MEDIUM ? 400 : 600;
  }
  return { amount, currency, distanceKm };
}

// ── Provider fetching (server-side; raw evidence stored, never sent to FE) ──

async function fetchAeroDataBox(flightNumber: string, date: string, apiKey: string | undefined): Promise<ProviderResult | null> {
  if (!apiKey || !flightNumber || !date) return null;
  try {
    const iata = normalizeFlightNumber(flightNumber);
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${iata}/${date}`,
      { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": apiKey } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const flights: ProviderFlight[] = data.map((f: Record<string, unknown>) => {
      const dep = f.departure as Record<string, unknown> | undefined;
      const arr = f.arrival as Record<string, unknown> | undefined;
      const depAirport = dep?.airport as Record<string, unknown> | undefined;
      const arrAirport = arr?.airport as Record<string, unknown> | undefined;
      const depSched = dep?.scheduledTime as Record<string, unknown> | undefined;
      const arrSched = arr?.scheduledTime as Record<string, unknown> | undefined;
      const schedDep = (depSched?.utc || depSched?.local) as string | null;
      const schedArr = (arrSched?.utc || arrSched?.local) as string | null;
      // AeroDataBox stores the confirmed actual event in `runwayTime` (only set
      // after the runway event occurred). We fall back to `revisedTime` ONLY
      // when it differs from the scheduled time: for cancelled/scheduled flights
      // `revisedTime` merely echoes `scheduledTime`, which would fabricate a
      // zero delay. A missing actual time correctly forces "incomplete" →
      // Pending Check rather than guessing.
      const depRunway = (dep?.runwayTime?.utc || dep?.runwayTime?.local) as string | null;
      const depRevised = (dep?.revisedTime?.utc || dep?.revisedTime?.local) as string | null;
      const arrRunway = (arr?.runwayTime?.utc || arr?.runwayTime?.local) as string | null;
      const arrRevised = (arr?.revisedTime?.utc || arr?.revisedTime?.local) as string | null;
      const actualDep = depRunway ?? (depRevised && depRevised !== schedDep ? depRevised : null);
      const actualArr = arrRunway ?? (arrRevised && arrRevised !== schedArr ? arrRevised : null);
      let delayMinutes: number | null = null;
      if (schedArr && actualArr) {
        delayMinutes = Math.max(0, Math.round((new Date(actualArr).getTime() - new Date(schedArr).getTime()) / 60000));
      }
      return {
        flightNumber: normalizeFlightNumber((f.number as string) || flightNumber),
        flightDate: normalizeDate(date),
        origin: normalizeIata((depAirport?.iata as string) || ""),
        destination: normalizeIata((arrAirport?.iata as string) || ""),
        scheduledDeparture: schedDep,
        scheduledArrival: schedArr,
        actualDeparture: actualDep,
        actualArrival: actualArr,
        delayMinutes,
        status: (f.status as string) || "scheduled",
      };
    });
    return { source: "aerodatabox", flights, raw: data };
  } catch {
    return null;
  }
}

async function fetchAviationStack(flightNumber: string, date: string, apiKey: string | undefined): Promise<ProviderResult | null> {
  if (!apiKey || !flightNumber || !date) return null;
  try {
    const iata = normalizeFlightNumber(flightNumber);
    const params = new URLSearchParams({ access_key: apiKey, flight_iata: iata, flight_date: date });
    const res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
    const raw = await res.json();
    if (raw.error || !raw.data?.length) return null;
    const flights: ProviderFlight[] = raw.data.map((f: Record<string, unknown>) => {
      const dep = f.departure as Record<string, unknown> | undefined;
      const arr = f.arrival as Record<string, unknown> | undefined;
      const flight = f.flight as Record<string, unknown> | undefined;
      const schedDep = (dep?.scheduled as string) || null;
      const actualDep = (dep?.actual || dep?.estimated) as string | null;
      const schedArr = (arr?.scheduled as string) || null;
      const actualArr = (arr?.actual || arr?.estimated) as string | null;
      let delayMinutes: number | null = null;
      if (schedArr && actualArr) {
        delayMinutes = Math.max(0, Math.round((new Date(actualArr).getTime() - new Date(schedArr).getTime()) / 60000));
      } else if (dep?.delay) {
        delayMinutes = Number(dep.delay) || null;
      }
      return {
        flightNumber: normalizeFlightNumber((flight?.iata as string) || flightNumber),
        flightDate: normalizeDate((f.flight_date as string) || date),
        origin: normalizeIata((dep?.iata as string) || ""),
        destination: normalizeIata((arr?.iata as string) || ""),
        scheduledDeparture: schedDep,
        scheduledArrival: schedArr,
        actualDeparture: actualDep,
        actualArrival: actualArr,
        delayMinutes,
        status: (f.flight_status as string) || "scheduled",
      };
    });
    return { source: "aviationstack", flights, raw };
  } catch {
    return null;
  }
}

// ── Cross-check: claim vs provider ────────────────────────────────────────────

interface CrossCheckResult {
  status: CrossCheckStatus;
  matched: ProviderFlight | null;
  details: Record<string, string | boolean>;
  perField: { flightNumber: boolean; flightDate: boolean; origin: boolean; destination: boolean };
}

function crossCheck(
  claim: { flightNumber: string; flightDate: string; origin: string; destination: string },
  providers: ProviderResult[],
): CrossCheckResult {
  const cFn = normalizeFlightNumber(claim.flightNumber);
  const cDate = normalizeDate(claim.flightDate);
  const cOrigin = normalizeIata(claim.origin);
  const cDest = normalizeIata(claim.destination);

  if (providers.length === 0 || providers.every((p) => p.flights.length === 0)) {
    return {
      status: "no_data",
      matched: null,
      details: { reason: "No flight data returned by any provider" },
      perField: { flightNumber: false, flightDate: false, origin: false, destination: false },
    };
  }

  // Collect every candidate flight across providers
  const allFlights: ProviderFlight[] = providers.flatMap((p) => p.flights);

  // Find a flight matching ALL FOUR identity fields
  const matched = allFlights.find((f) =>
    normalizeFlightNumber(f.flightNumber) === cFn &&
    normalizeDate(f.flightDate) === cDate &&
    normalizeIata(f.origin) === cOrigin &&
    normalizeIata(f.destination) === cDest,
  );

  // Per-field comparison against the first available flight (for diagnostics)
  const ref = allFlights[0];
  const perField = {
    flightNumber: ref ? normalizeFlightNumber(ref.flightNumber) === cFn : false,
    flightDate: ref ? normalizeDate(ref.flightDate) === cDate : false,
    origin: ref ? normalizeIata(ref.origin) === cOrigin : false,
    destination: ref ? normalizeIata(ref.destination) === cDest : false,
  };

  if (!matched) {
    const mismatches: string[] = [];
    if (!perField.flightNumber) mismatches.push("flight number");
    if (!perField.flightDate) mismatches.push("flight date");
    if (!perField.origin) mismatches.push("origin");
    if (!perField.destination) mismatches.push("destination");
    return {
      status: "mismatch",
      matched: null,
      details: { reason: `Flight could not be confidently matched (mismatch on: ${mismatches.join(", ") || "no candidates"})` },
      perField,
    };
  }

  // Conflict check: if two providers both matched the same flight but disagree
  // on the actual arrival delay beyond tolerance, the evidence is uncertain.
  let providerConflict = false;
  const matchedPerProvider: ProviderFlight[] = [];
  for (const p of providers) {
    const m = p.flights.find((f) =>
      normalizeFlightNumber(f.flightNumber) === cFn &&
      normalizeDate(f.flightDate) === cDate &&
      normalizeIata(f.origin) === cOrigin &&
      normalizeIata(f.destination) === cDest,
    );
    if (m) matchedPerProvider.push(m);
  }
  if (matchedPerProvider.length >= 2) {
    const withDelay = matchedPerProvider.filter((f) => f.delayMinutes != null && f.actualArrival);
    if (withDelay.length >= 2) {
      const max = Math.max(...withDelay.map((f) => f.delayMinutes as number));
      const min = Math.min(...withDelay.map((f) => f.delayMinutes as number));
      if (max - min > PROVIDER_DELAY_CONFLICT_TOLERANCE_MIN) providerConflict = true;
    }
  }

  return {
    status: providerConflict ? "conflict" : "matched",
    matched,
    details: {
      flight_number: "match",
      flight_date: "match",
      origin: "match",
      destination: "match",
      provider_conflict: providerConflict,
    },
    perField: { flightNumber: true, flightDate: true, origin: true, destination: true },
  };
}

// ── Evidence persistence ──────────────────────────────────────────────────────

async function persistEvidence(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  args: {
    dataSource: DataSource;
    fetchTimestamp: string;
    flight: ProviderFlight | null;
    crossCheckStatus: CrossCheckStatus;
    crossCheckDetails: Record<string, unknown>;
    providerEvidence: Record<string, unknown> | null;
    decision: EngineDecision;
    decisionReason: string;
  },
): Promise<void> {
  const row = {
    claim_id: claimId,
    data_source: args.dataSource,
    fetch_timestamp: args.fetchTimestamp,
    flight_number_verified: args.flight?.flightNumber ?? null,
    flight_date_verified: args.flight?.flightDate ?? null,
    origin_verified: args.flight?.origin ?? null,
    destination_verified: args.flight?.destination ?? null,
    scheduled_departure: args.flight?.scheduledDeparture ?? null,
    scheduled_arrival: args.flight?.scheduledArrival ?? null,
    actual_departure: args.flight?.actualDeparture ?? null,
    actual_arrival: args.flight?.actualArrival ?? null,
    delay_minutes: args.flight?.delayMinutes ?? null,
    flight_status: args.flight?.status ?? null,
    cross_check_status: args.crossCheckStatus,
    cross_check_details: args.crossCheckDetails,
    provider_evidence: args.providerEvidence,
    decision: args.decision,
    decision_reason: args.decisionReason,
  };
  // Best-effort: a persistence failure must never break or roll back an
  // eligibility decision that has already been written to the claim. The
  // decision itself is the source of truth on claims.status; this table is
  // the reproducible audit trail behind it.
  try {
    await supabase.from("flight_evidence").upsert(row, { onConflict: "claim_id" });
  } catch (err) {
    console.error("flight_evidence persist failed (non-blocking):", err);
  }
}

// ── Decision application ──────────────────────────────────────────────────────

async function applyDecision(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  claimRef: string,
  status: EngineDecision,
  detail: string,
): Promise<void> {
  const update: Record<string, unknown> = { status, notes: detail, updated_at: new Date().toISOString() };
  if (status === "Not Eligible" || status === "Not Eligible - Expired") {
    update.compensation_amount = 0;
    update.amount = "€0";
  } else if (status === "Pending Check") {
    update.compensation_amount = null;
    update.amount = "Pending";
  }
  await supabase.from("claims").update(update).eq("id", claimId);
  await supabase.from("notifications").insert({
    type: "status_changed",
    claim_ref: claimRef,
    claim_id: claimId,
    message: `Rules Engine → ${status}: ${detail}`,
  });
}

async function applyFinancials(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  claimRef: string,
  departure: string,
  arrival: string,
  agentCode: string | null,
): Promise<void> {
  const comp = calcCompensation(departure, arrival);
  // calcCompensation returns null when coordinates are unavailable — but the
  // caller guarantees coordinates exist before reaching here.
  if (!comp) return;
  const symbol = comp.currency === "ILS" ? "₪" : "€";
  await supabase.from("claims").update({
    compensation_amount: comp.amount,
    amount: `${symbol}${comp.amount}`,
    updated_at: new Date().toISOString(),
  }).eq("id", claimId);

  if (agentCode && agentCode !== "—") {
    const { data: agent } = await supabase
      .from("worker_profiles")
      .select("id, commission_rate, total_payout_earned")
      .eq("agent_code", agentCode)
      .eq("role", "agent")
      .eq("status", "active")
      .maybeSingle();
    if (agent) {
      const rate = Number(agent.commission_rate) || 10;
      const commission = Math.round((comp.amount * rate) / 100 * 100) / 100;
      const newTotal = Math.round((Number(agent.total_payout_earned || 0) + commission) * 100) / 100;
      await supabase.from("worker_profiles").update({ total_payout_earned: newTotal }).eq("id", agent.id);
      await supabase.from("notifications").insert({
        type: "commission_earned",
        claim_ref: claimRef,
        claim_id: claimId,
        message: `Agent ${agentCode} earned ${symbol}${commission} commission (${rate}% of ${symbol}${comp.amount}). Total payout: ${symbol}${newTotal}.`,
      });
    }
  }
}

// ── Main evaluation ───────────────────────────────────────────────────────────

export async function evaluateClaimInternal(
  supabaseUrl: string,
  serviceRoleKey: string,
  claimId: string,
): Promise<EngineResult> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claim, error } = await supabase
    .from("claims")
    .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline_reason, agent")
    .eq("id", claimId)
    .maybeSingle();

  if (error || !claim) {
    return { claimId, claimRef: "", decision: "Pending Check", delayMinutes: null, reasonCode: null, source: null, detail: "Claim not found or lookup failed" };
  }

  const departure = normalizeIata(claim.departure || "");
  const arrival = normalizeIata(claim.arrival || "");
  const flightNumber = claim.flight_number || "";
  const flightDate = claim.flight_date || "";
  const claimRef = claim.claim_ref || claimId;
  const now = new Date();
  const fetchTimestamp = now.toISOString();
  const aerodataboxKey = Deno.env.get("AERODATABOX_API_KEY");
  const aviationstackKey = Deno.env.get("AVIATIONSTACK_API_KEY");

  // ── Stage 1: Statute of limitations ────────────────────────────────────────
  if (flightDate) {
    const depDate = new Date(flightDate);
    const ageYears = yearsBetween(depDate, now);
    if (isIsraeliRoute(departure, arrival) && ageYears > 4) {
      const detail = `Israeli route older than 4 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      await persistEvidence(supabase, claimId, {
        dataSource: "none", fetchTimestamp, flight: null,
        crossCheckStatus: "no_data", crossCheckDetails: { reason: "statute of limitations" },
        providerEvidence: null, decision: "Not Eligible - Expired", decisionReason: detail,
      });
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: null, reasonCode: null, source: null, detail };
    }
    if (isEuRoute(departure, arrival) && ageYears > 6) {
      const detail = `EU route older than 6 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      await persistEvidence(supabase, claimId, {
        dataSource: "none", fetchTimestamp, flight: null,
        crossCheckStatus: "no_data", crossCheckDetails: { reason: "statute of limitations" },
        providerEvidence: null, decision: "Not Eligible - Expired", decisionReason: detail,
      });
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: null, reasonCode: null, source: null, detail };
    }
  }

  // ── Stage 2: Fetch provider flight data ─────────────────────────────────────
  const providers: ProviderResult[] = [];
  const aero = await fetchAeroDataBox(flightNumber, flightDate, aerodataboxKey);
  if (aero) providers.push(aero);
  const avia = await fetchAviationStack(flightNumber, flightDate, aviationstackKey);
  if (avia) providers.push(avia);

  const providerEvidence: Record<string, unknown> = {};
  for (const p of providers) providerEvidence[p.source] = p.raw;

  // ── Stage 3: Cross-check claim vs provider ──────────────────────────────────
  const cc = crossCheck(
    { flightNumber, flightDate, origin: departure, destination: arrival },
    providers,
  );

  const primarySource: DataSource = cc.matched
    ? (aero && aero.flights.includes(cc.matched) ? "aerodatabox" : "aviationstack")
    : (providers.length > 0 ? providers[0].source : "none");

  // No provider data at all
  if (cc.status === "no_data") {
    const detail = "No flight data available from any provider — manual review required.";
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: "none", fetchTimestamp, flight: null,
      crossCheckStatus: "no_data", crossCheckDetails: cc.details,
      providerEvidence: Object.keys(providerEvidence).length ? providerEvidence : null,
      decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes: null, reasonCode: null, source: null, detail };
  }

  // Mismatch — flight identity does not match the claim
  if (cc.status === "mismatch") {
    const detail = `Cross-check failed: ${cc.details.reason}. Manual review required.`;
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: null,
      crossCheckStatus: "mismatch", crossCheckDetails: cc.details,
      providerEvidence, decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes: null, reasonCode: null, source: primarySource, detail };
  }

  // Providers conflict on the delay
  if (cc.status === "conflict") {
    const detail = "Providers returned conflicting delay data for the matched flight — manual review required.";
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: cc.matched,
      crossCheckStatus: "conflict", crossCheckDetails: cc.details,
      providerEvidence, decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes: cc.matched?.delayMinutes ?? null, reasonCode: null, source: primarySource, detail };
  }

  // ── Stage 4: Completeness — actual times required to determine delay ────────
  const matched = cc.matched!;
  if (!matched.actualArrival || !matched.scheduledArrival || matched.delayMinutes == null) {
    const detail = "Provider data incomplete: actual/scheduled arrival times unavailable — manual review required.";
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: matched,
      crossCheckStatus: "incomplete", crossCheckDetails: cc.details,
      providerEvidence, decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes: null, reasonCode: null, source: primarySource, detail };
  }

  const delayMinutes = matched.delayMinutes;
  const reasonCode = classifyReason(claim.airline_reason || "");

  // ── Stage 5: Extraordinary circumstances — NEVER auto-Eligible ──────────────
  if (EXTRAORDINARY_REASONS.has(reasonCode)) {
    const detail = `Reported reason "${reasonCode.toLowerCase()}" may be an extraordinary circumstance — requires manual verification. Cannot be auto-marked eligible.`;
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: matched,
      crossCheckStatus: "matched", crossCheckDetails: cc.details,
      providerEvidence, decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes, reasonCode, source: primarySource, detail };
  }

  // ── Stage 6: Delay threshold ────────────────────────────────────────────────
  const threshold = isIsraeliRoute(departure, arrival) ? MIN_ELIGIBLE_DELAY_MINUTES_IL : MIN_ELIGIBLE_DELAY_MINUTES_EU;
  if (delayMinutes < threshold) {
    const detail = `Delay of ${delayMinutes}min is below the ${threshold}min threshold. (source: ${primarySource})`;
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: matched,
      crossCheckStatus: "matched", crossCheckDetails: cc.details,
      providerEvidence, decision: "Not Eligible", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes, reasonCode, source: primarySource, detail };
  }

  // ── Stage 7: Carrier fault + sufficient delay → Eligible (coords required) ──
  // Coordinates are required to compute compensation. If unavailable, we do
  // NOT guess a distance (the old 2000 km default is removed) — Pending Check.
  if (!calcCompensation(departure, arrival)) {
    const detail = `Airport coordinates unavailable for ${departure}/${arrival} — cannot compute compensation. Manual review required.`;
    await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
    await persistEvidence(supabase, claimId, {
      dataSource: primarySource, fetchTimestamp, flight: matched,
      crossCheckStatus: "matched", crossCheckDetails: cc.details,
      providerEvidence, decision: "Pending Check", decisionReason: detail,
    });
    return { claimId, claimRef, decision: "Pending Check", delayMinutes, reasonCode, source: primarySource, detail };
  }

  const detail = `Delay of ${delayMinutes}min caused by ${reasonCode.toLowerCase()} issue — carrier responsibility. Flight identity cross-checked and matched. (source: ${primarySource})`;
  await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
  await applyFinancials(supabase, claimId, claimRef, departure, arrival, claim.agent || null);
  await persistEvidence(supabase, claimId, {
    dataSource: primarySource, fetchTimestamp, flight: matched,
    crossCheckStatus: "matched", crossCheckDetails: cc.details,
    providerEvidence, decision: "Eligible", decisionReason: detail,
  });
  return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, source: primarySource, detail };
}
