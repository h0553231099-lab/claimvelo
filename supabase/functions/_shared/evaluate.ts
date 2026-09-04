/**
 * Shared claim evaluation logic — the canonical, server-side Rules Engine.
 *
 * Used by create-claim, evaluate-claim, and b2b-api Edge Functions (service-role
 * client, bypasses RLS). Exactly ONE decision path.
 *
 * Phase A/B.1/B.2A/B.2 guarantees:
 *  - No mock / fabricated flight data.
 *  - Every automatic decision backed by real provider data, cross-checked.
 *  - Extraordinary circumstances NEVER auto-Eligible.
 *  - Missing/incomplete/conflicting evidence → Pending Check with structured
 *    reason code.
 *  - Raw provider JSON stored server-side only (flight_evidence / segments),
 *    never returned to the frontend.
 *  - Operating carrier derived from verified provider data, never from
 *    customer-entered airline. Provider disagreement → Pending Check.
 *  - Separate EU261 / UK261 jurisdiction with distinct compensation amounts.
 *  - Brazil routes → always Pending Check (no automatic BRL compensation).
 *  - Customer-entered replacement times never create automatic eligibility
 *    when provider verification is available.
 *  - Admin override requires mandatory reason; actor + timestamp immutable.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ── Types ────────────────────────────────────────────────────────────────────

type DelayReasonCode = "CARRIER" | "CREW" | "TECHNICAL" | "WEATHER" | "ATC" | "SECURITY" | "STRIKE";
type EngineDecision = "Not Eligible - Expired" | "Not Eligible" | "Eligible" | "Pending Check";
type DataSource = "aerodatabox" | "aviationstack" | "none";
type CrossCheckStatus = "matched" | "mismatch" | "incomplete" | "conflict" | "no_data" | "cancelled" | "carrier_conflict";

type Jurisdiction = "EU261" | "UK261" | "ISRAEL" | "BRAZIL_REVIEW" | "NONE";

type ReviewReasonCode =
  | "NO_PROVIDER_DATA"
  | "FLIGHT_MISMATCH"
  | "PROVIDER_CONFLICT"
  | "PROVIDER_CARRIER_CONFLICT"
  | "CANCELLED_MISSING_NOTICE"
  | "CANCELLED_REPLACEMENT_UNVERIFIED"
  | "CANCELLED_PASSENGER_DECLINED"
  | "DENIED_BOARDING_INCOMPLETE"
  | "DENIED_BOARDING_REQUIRES_EVIDENCE"
  | "JURISDICTION_UNKNOWN_CARRIER"
  | "EXTRAORDINARY_CIRCUMSTANCES"
  | "INCOMPLETE_EVIDENCE"
  | "COORDS_UNAVAILABLE"
  | "CONNECTING_MISSING_SEGMENT_DATA"
  | "BRAZIL_MANUAL_REVIEW";

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
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  delayMinutes: number | null;
  status: string;
  operatingCarrier: string | null;   // IATA code from provider
  operatingCarrierName: string | null;
  marketingCarrier: string | null;    // IATA code (codeshare only)
  codeshareStatus: string | null;
}

interface ProviderResult {
  source: "aerodatabox" | "aviationstack";
  flights: ProviderFlight[];
  raw: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_DELAY_CONFLICT_TOLERANCE_MIN = 10;

const EXTRAORDINARY_REASONS = new Set<DelayReasonCode>(["WEATHER", "ATC", "SECURITY", "STRIKE"]);

const REASON_MAP: Record<string, DelayReasonCode> = {
  carrier: "CARRIER", technical: "TECHNICAL", crew: "CREW",
  weather: "WEATHER", atc: "ATC", "air traffic control": "ATC",
  security: "SECURITY", strike: "STRIKE",
};

// ── Airport code sets (separate UK from EU/EEA) ──────────────────────────────

const UK_AIRPORT_CODES = new Set([
  "LHR","LGW","STN","LTN","LCY","SEN","MAN","EDI","BHX","GLA","BRS","NCL","ABZ",
  "LPL","EMA","LBA","CWL","BFS","SOU","EXT","NWI","INV","JER","GCI","IOM",
]);

const EU_EEA_AIRPORT_CODES = new Set([
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

const ISRAELI_AIRPORT_CODES = new Set(["TLV", "BGW", "ETM", "HFA", "SDV", "VDA", "KCN"]);

const BRAZIL_AIRPORT_CODES = new Set([
  "GRU","GIG","BSB","CGH","SDU","CNF","POA","REC","SSA","FOR","CWB","MAO","BEL",
  "GYN","VCP","FLN","NAT","MCZ","VIX","CGB","SLZ","UDI","RAO","ATM","JPA","MCP",
  "PVH","STM","BPS","MGB","THE","MCZ",
]);

// ── Carrier country mappings (IATA code → jurisdiction relevance) ───────────

const UK_CARRIERS = new Set([
  "BA","VS","U2","LS","BE","GR","WQ","T3","JD","EX","MM",
]);

const EU_CARRIERS = new Set([
  // Germany
  "LH","LX","OS","SN","EN","DE","EW","4U","AB",
  // France
  "AF","U2","A5","TO","SS","XL","BJ",
  // Netherlands
  "KL","HV","WA",
  // Spain
  "IB","UX","FR","VY","QS",
  // Ireland
  "EI","WI","FR",
  // Italy
  "AZ","NO","IG","EI","VE","XR","W6",
  // Scandinavia
  "SK","DY","W6","FI","RC","EF",
  // Portugal
  "TP","S4",
  // Greece
  "A3","OA","EG","W6",
  // Poland
  "LO","W6","BT","RJ",
  // Baltics
  "BT","LO","RJ","PS",
  // Czech
  "OK","QS",
  // Hungary
  "MA","W6",
  // Romania
  "RO","W6","0B",
  // Bulgaria
  "FB","W6",
  // Croatia
  "OU",
  // Slovenia
  "JP",
  // Slovakia
  "W6","OK",
  // Malta
  "KM",
  // Cyprus
  "CY","W6",
  // Turkey
  "TK","PC",
  // Iceland
  "FI",
  // Finland
  "AY","W6",
  // Austria
  "OS","W6",
]);

const BRAZIL_CARRIERS = new Set(["JJ","LA","G3","AD","RJ","2Z","O6","W3"]);

// ── Compensation constants ───────────────────────────────────────────────────

// 50% reduction thresholds (minutes) per distance category — Article 7(2)
// These apply to the COMPENSATION AMOUNT, not to eligibility.
const REDUCTION_THRESHOLDS = {
  short: 120,   // ≤1500km: 2-hour threshold (cancellation re-routing only)
  medium: 180,  // 1500-3500km: 3-hour threshold
  long: 240,    // >3500km: 4-hour threshold
};

// Delay compensation ELIGIBILITY threshold (minutes) — Sturgeon ruling
// 3 hours (180 min) at final destination for ALL distance bands under EU261/UK261.
// The distance-band thresholds above only affect the AMOUNT (50% reduction),
// not whether the passenger qualifies for compensation at all.
const MIN_DELAY_COMPENSATION_EU_UK = 180;
const MIN_DELAY_IL = 480;             // Israel: 8h

const KM_SHORT = 1500;
const KM_MEDIUM = 3500;

// Compensation amounts per jurisdiction
const COMPENSATION = {
  EU261: {
    short: { full: 250, reduced: 125 },
    medium: { full: 400, reduced: 200 },
    long: { full: 600, reduced: 300 },
  },
  UK261: {
    short: { full: 220, reduced: 110 },
    medium: { full: 350, reduced: 175 },
    long: { full: 520, reduced: 260 },
  },
  ISRAEL: {
    short: { full: 1470, reduced: 1470 },  // no 50% reduction
    medium: { full: 2390, reduced: 2390 },
    long: { full: 3530, reduced: 3530 },
  },
} as const;

// ── Airport coordinates ─────────────────────────────────────────────────────

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
  DXB:[25.253,55.363],
  GRU:[-23.432,-46.469], GIG:[-22.808,-43.244], BSB:[-15.869,-47.920], CNF:[-19.633,-43.968],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyReason(raw: string): DelayReasonCode {
  const lower = raw.toLowerCase().trim();
  for (const [key, code] of Object.entries(REASON_MAP)) {
    if (lower.includes(key)) return code;
  }
  return "CARRIER";
}

function isIsraeliRoute(dep: string, arr: string): boolean {
  return ISRAELI_AIRPORT_CODES.has(dep.toUpperCase()) || ISRAELI_AIRPORT_CODES.has(arr.toUpperCase());
}

function isUkAirport(code: string): boolean {
  return UK_AIRPORT_CODES.has(code.toUpperCase());
}

function isEuEeaAirport(code: string): boolean {
  return EU_EEA_AIRPORT_CODES.has(code.toUpperCase());
}

function isBrazilianRoute(dep: string, arr: string): boolean {
  return BRAZIL_AIRPORT_CODES.has(dep.toUpperCase()) || BRAZIL_AIRPORT_CODES.has(arr.toUpperCase());
}

function isUkCarrier(iata: string | null): boolean {
  return iata !== null && UK_CARRIERS.has(iata.toUpperCase());
}

function isEuCarrier(iata: string | null): boolean {
  return iata !== null && EU_CARRIERS.has(iata.toUpperCase());
}

function isBrazilianCarrier(iata: string | null): boolean {
  return iata !== null && BRAZIL_CARRIERS.has(iata.toUpperCase());
}

function carrierCountry(iata: string | null): "UK" | "EU" | "BR" | "non_eu" | "unknown" {
  if (!iata) return "unknown";
  const u = iata.toUpperCase();
  if (UK_CARRIERS.has(u)) return "UK";
  if (EU_CARRIERS.has(u)) return "EU";
  if (BRAZIL_CARRIERS.has(u)) return "BR";
  return "non_eu";
}

/**
 * Determine jurisdiction based on departure, arrival, and VERIFIED operating
 * carrier from provider data.  Customer-entered airline is never used here.
 */
function determineJurisdiction(
  dep: string,
  arr: string,
  operatingCarrierIata: string | null,
): { jurisdiction: Jurisdiction; detail: string } {
  const d = dep.toUpperCase();
  const a = arr.toUpperCase();

  // Brazil — always Pending Check, no automatic compensation
  if (isBrazilianRoute(d, a)) {
    return { jurisdiction: "BRAZIL_REVIEW", detail: "Brazilian route — manual review required (ANAC rules not yet automated)." };
  }

  // Israel
  if (isIsraeliRoute(d, a)) {
    return { jurisdiction: "ISRAEL", detail: "Israeli Aviation Services Law applies." };
  }

  // UK261: departing from UK → applies regardless of carrier
  if (isUkAirport(d)) {
    return { jurisdiction: "UK261", detail: "UK261 applies (departure from UK airport)." };
  }

  // EU261: departing from EU/EEA → applies regardless of carrier
  if (isEuEeaAirport(d)) {
    return { jurisdiction: "EU261", detail: "EU261 applies (departure from EU/EEA airport)." };
  }

  // Non-EU/UK departure → arriving at UK → UK261 only if UK-licensed carrier
  if (isUkAirport(a)) {
    if (isUkCarrier(operatingCarrierIata)) {
      return { jurisdiction: "UK261", detail: "UK261 applies (non-UK departure, UK-licensed operating carrier arriving at UK)." };
    }
    if (carrierCountry(operatingCarrierIata) === "unknown") {
      return { jurisdiction: "NONE", detail: "Cannot determine operating carrier country for UK arrival route." };
    }
    return { jurisdiction: "NONE", detail: "UK261 does not apply (non-UK carrier on non-UK→UK route)." };
  }

  // Non-EU/UK departure → arriving at EU/EEA → EU261 only if EU-licensed carrier
  if (isEuEeaAirport(a)) {
    if (isEuCarrier(operatingCarrierIata)) {
      return { jurisdiction: "EU261", detail: "EU261 applies (non-EU departure, EU-licensed operating carrier arriving at EU)." };
    }
    if (carrierCountry(operatingCarrierIata) === "unknown") {
      return { jurisdiction: "NONE", detail: "Cannot determine operating carrier country for EU arrival route." };
    }
    return { jurisdiction: "NONE", detail: "EU261 does not apply (non-EU carrier on non-EU→EU route)." };
  }

  return { jurisdiction: "NONE", detail: "Route not covered by EU261/UK261/Israeli/Brazilian regulations." };
}

function yearsBetween(from: Date, to: Date): number {
  let y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) y--;
  return y;
}

function normalizeFlightNumber(s: string): string { return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }
function normalizeDate(s: string): string { return s ? s.slice(0, 10) : ""; }
function normalizeIata(s: string): string { return s.trim().toUpperCase(); }

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function getDistanceCategory(dep: string, arr: string): "short" | "medium" | "long" | null {
  const coordA = AIRPORT_COORDS[dep.toUpperCase()];
  const coordB = AIRPORT_COORDS[arr.toUpperCase()];
  if (!coordA || !coordB) return null;
  const km = haversineKm(coordA, coordB);
  if (km <= KM_SHORT) return "short";
  if (km <= KM_MEDIUM) return "medium";
  return "long";
}

function getDistanceKm(dep: string, arr: string): number | null {
  const coordA = AIRPORT_COORDS[dep.toUpperCase()];
  const coordB = AIRPORT_COORDS[arr.toUpperCase()];
  if (!coordA || !coordB) return null;
  return haversineKm(coordA, coordB);
}

/**
 * Calculate compensation for a DELAY.
 * Applies 50% reduction per distance category and jurisdiction.
 */
function calcDelayCompensation(
  dep: string, arr: string,
  delayMinutes: number,
  jurisdiction: Jurisdiction,
): { amount: number; currency: string; distanceKm: number } | null {
  const cat = getDistanceCategory(dep, arr);
  if (!cat) return null;
  const distKm = getDistanceKm(dep, arr);
  if (distKm === null) return null;

  const jurKey = jurisdiction === "UK261" ? "UK261" : jurisdiction === "ISRAEL" ? "ISRAEL" : "EU261";
  const comp = COMPENSATION[jurKey][cat];
  const currency = jurisdiction === "UK261" ? "GBP" : jurisdiction === "ISRAEL" ? "ILS" : "EUR";

  // 50% reduction per Article 7(2) thresholds — affects AMOUNT only, not eligibility.
  // Eligibility is uniformly 180min (Sturgeon); this function is only called for
  // delays ≥180min, so the short-haul 120min threshold never triggers here.
  let amount: number;
  if (cat === "short") {
    // Short-haul (≤1500km): full compensation for all delays ≥180min.
    // The 120min Article 7(2) threshold is below the 180min eligibility gate,
    // so the 50% reduction only applies to cancellation re-routing, not delay.
    amount = comp.full;
  } else if (cat === "medium") {
    // Medium (1500-3500km): 50% reduction for 180-239min, full for ≥240min.
    amount = (delayMinutes >= REDUCTION_THRESHOLDS.medium && delayMinutes < REDUCTION_THRESHOLDS.long) ? comp.reduced : comp.full;
  } else {
    // Long (>3500km): 50% reduction for 180-239min, full for ≥240min.
    amount = (delayMinutes >= MIN_DELAY_COMPENSATION_EU_UK && delayMinutes < REDUCTION_THRESHOLDS.long) ? comp.reduced : comp.full;
  }

  // Israel has no 50% reduction
  if (jurisdiction === "ISRAEL") amount = comp.full;

  return { amount, currency, distanceKm: distKm };
}

/**
 * Calculate compensation for a CANCELLATION with replacement flight (re-routing).
 * Uses Article 7(2) re-routing thresholds per distance category.
 */
function calcReRoutingCompensation(
  dep: string, arr: string,
  replacementDelayMinutes: number,
  jurisdiction: Jurisdiction,
): { amount: number; currency: string; distanceKm: number } | null {
  const cat = getDistanceCategory(dep, arr);
  if (!cat) return null;
  const distKm = getDistanceKm(dep, arr);
  if (distKm === null) return null;

  const jurKey = jurisdiction === "UK261" ? "UK261" : jurisdiction === "ISRAEL" ? "ISRAEL" : "EU261";
  const comp = COMPENSATION[jurKey][cat];
  const currency = jurisdiction === "UK261" ? "GBP" : jurisdiction === "ISRAEL" ? "ILS" : "EUR";

  // Article 7(2) re-routing thresholds: within threshold → 50% reduction
  let amount: number;
  if (cat === "short") {
    amount = replacementDelayMinutes <= REDUCTION_THRESHOLDS.short ? comp.reduced : comp.full;
  } else if (cat === "medium") {
    amount = replacementDelayMinutes <= REDUCTION_THRESHOLDS.medium ? comp.reduced : comp.full;
  } else {
    amount = replacementDelayMinutes <= REDUCTION_THRESHOLDS.long ? comp.reduced : comp.full;
  }

  if (jurisdiction === "ISRAEL") amount = comp.full;

  return { amount, currency, distanceKm: distKm };
}

function currencySymbol(currency: string): string {
  return currency === "ILS" ? "₪" : currency === "GBP" ? "£" : "€";
}

// ── Provider fetching ───────────────────────────────────────────────────────

async function fetchAeroDataBox(fn: string, date: string, apiKey: string | undefined): Promise<ProviderResult | null> {
  if (!apiKey || !fn || !date) return null;
  try {
    const iata = normalizeFlightNumber(fn);
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
      const airline = f.airline as Record<string, unknown> | undefined;
      const depAirport = dep?.airport as Record<string, unknown> | undefined;
      const arrAirport = arr?.airport as Record<string, unknown> | undefined;
      const depSched = dep?.scheduledTime as Record<string, unknown> | undefined;
      const arrSched = arr?.scheduledTime as Record<string, unknown> | undefined;
      const schedDep = (depSched?.utc || depSched?.local) as string | null;
      const schedArr = (arrSched?.utc || arrSched?.local) as string | null;
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
        flightNumber: normalizeFlightNumber((f.number as string) || fn),
        flightDate: normalizeDate(date),
        origin: normalizeIata((depAirport?.iata as string) || ""),
        destination: normalizeIata((arrAirport?.iata as string) || ""),
        scheduledDeparture: schedDep, scheduledArrival: schedArr,
        actualDeparture: actualDep, actualArrival: actualArr,
        delayMinutes, status: (f.status as string) || "scheduled",
        operatingCarrier: (airline?.iata as string) || null,
        operatingCarrierName: (airline?.name as string) || null,
        marketingCarrier: null, // AeroDataBox doesn't expose marketing carrier separately
        codeshareStatus: (f.codeshareStatus as string) || null,
      };
    });
    return { source: "aerodatabox", flights, raw: data };
  } catch { return null; }
}

async function fetchAviationStack(fn: string, date: string, apiKey: string | undefined): Promise<ProviderResult | null> {
  if (!apiKey || !fn || !date) return null;
  try {
    const iata = normalizeFlightNumber(fn);
    const params = new URLSearchParams({ access_key: apiKey, flight_iata: iata, flight_date: date });
    const res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
    const raw = await res.json();
    if (raw.error || !raw.data?.length) return null;
    const flights: ProviderFlight[] = raw.data.map((f: Record<string, unknown>) => {
      const dep = f.departure as Record<string, unknown> | undefined;
      const arr = f.arrival as Record<string, unknown> | undefined;
      const flight = f.flight as Record<string, unknown> | undefined;
      const airline = f.airline as Record<string, unknown> | undefined;
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
      // AviationStack: airline = OPERATING carrier; flight.codeshared = MARKETING carrier
      const codeshared = flight?.codeshared as Record<string, unknown> | undefined;
      // For codeshare flights, use the marketing flight number (what the customer
      // searched for) so the cross-check can match it against the claim.
      const marketingFlightIata = (codeshared?.flight_iata as string) || null;
      return {
        flightNumber: normalizeFlightNumber(marketingFlightIata || (flight?.iata as string) || fn),
        flightDate: normalizeDate((f.flight_date as string) || date),
        origin: normalizeIata((dep?.iata as string) || ""),
        destination: normalizeIata((arr?.iata as string) || ""),
        scheduledDeparture: schedDep, scheduledArrival: schedArr,
        actualDeparture: actualDep, actualArrival: actualArr,
        delayMinutes, status: (f.flight_status as string) || "scheduled",
        operatingCarrier: (airline?.iata as string) || null,
        operatingCarrierName: (airline?.name as string) || null,
        marketingCarrier: (codeshared?.airline_iata as string) || null,
        codeshareStatus: codeshared ? "IsCodeshared" : "IsOperator",
      };
    });
    return { source: "aviationstack", flights, raw };
  } catch { return null; }
}

// ── Cross-check ──────────────────────────────────────────────────────────────

interface CrossCheckResult {
  status: CrossCheckStatus;
  matched: ProviderFlight | null;
  details: Record<string, unknown>;
  operatingCarrierConflict: boolean;
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
    return { status: "no_data", matched: null, details: { reason: "No flight data returned by any provider" }, operatingCarrierConflict: false };
  }

  const allFlights = providers.flatMap((p) => p.flights);
  // Find ALL matches across providers (same flight number, date, origin, destination)
  const allMatches = allFlights.filter((f) =>
    normalizeFlightNumber(f.flightNumber) === cFn &&
    normalizeDate(f.flightDate) === cDate &&
    normalizeIata(f.origin) === cOrigin &&
    normalizeIata(f.destination) === cDest,
  );
  // Prefer cancelled status (for cancellation detection), then actual arrival data,
  // then first match. This handles providers disagreeing on flight status.
  const isCancelledStatus = (s: string) => s && ["cancelled", "canceled"].includes(s.toLowerCase());
  const matched = allMatches.find((f) => isCancelledStatus(f.status))
    || allMatches.find((f) => f.actualArrival)
    || allMatches[0] || null;

  if (!matched) {
    const ref = allFlights[0];
    const mismatches: string[] = [];
    if (ref && normalizeFlightNumber(ref.flightNumber) !== cFn) mismatches.push("flight number");
    if (ref && normalizeDate(ref.flightDate) !== cDate) mismatches.push("flight date");
    if (ref && normalizeIata(ref.origin) !== cOrigin) mismatches.push("origin");
    if (ref && normalizeIata(ref.destination) !== cDest) mismatches.push("destination");
    return { status: "mismatch", matched: null, details: { reason: `Mismatch on: ${mismatches.join(", ") || "no candidates"}` }, operatingCarrierConflict: false };
  }

  // Provider conflict on delay
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

  // Operating carrier conflict between providers
  let carrierConflict = false;
  if (matchedPerProvider.length >= 2) {
    const carriers = matchedPerProvider
      .map((f) => f.operatingCarrier)
      .filter((c): c is string => c !== null && c !== "");
    const uniqueCarriers = new Set(carriers.map((c) => c.toUpperCase()));
    if (uniqueCarriers.size > 1) carrierConflict = true;
  }

  const status: CrossCheckStatus = carrierConflict ? "carrier_conflict" : providerConflict ? "conflict" : "matched";
  return {
    status, matched,
    details: { flight_number: "match", flight_date: "match", origin: "match", destination: "match", provider_conflict: providerConflict, carrier_conflict: carrierConflict },
    operatingCarrierConflict: carrierConflict,
  };
}

// ── Evidence persistence ──────────────────────────────────────────────────────

async function persistEvidence(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  args: {
    dataSource: DataSource; fetchTimestamp: string; flight: ProviderFlight | null;
    crossCheckStatus: CrossCheckStatus; crossCheckDetails: Record<string, unknown>;
    providerEvidence: Record<string, unknown> | null;
    decision: EngineDecision; decisionReason: string;
    reviewReasonCode?: ReviewReasonCode;
  },
): Promise<void> {
  // Build evidence checklist
  const f = args.flight;
  const checklist = [
    { item: "flight_identity_verified", status: args.crossCheckStatus === "matched" ? "passed" : "missing" },
    { item: "actual_arrival_time", status: f?.actualArrival ? "passed" : "missing" },
    { item: "operating_carrier_identified", status: f?.operatingCarrier ? "passed" : "missing" },
    { item: "airline_reason_provided", status: "passed" },
    { item: "cancellation_notice_date", status: "not_applicable" },
    { item: "replacement_flight_verified", status: "not_applicable" },
    { item: "denied_boarding_evidence", status: "not_applicable" },
    { item: "connecting_segment_data", status: "not_applicable" },
  ];
  const detailsWithChecklist = { ...args.crossCheckDetails, checklist };

  const row = {
    claim_id: claimId,
    data_source: args.dataSource,
    fetch_timestamp: args.fetchTimestamp,
    flight_number_verified: f?.flightNumber ?? null,
    flight_date_verified: f?.flightDate ?? null,
    origin_verified: f?.origin ?? null,
    destination_verified: f?.destination ?? null,
    scheduled_departure: f?.scheduledDeparture ?? null,
    scheduled_arrival: f?.scheduledArrival ?? null,
    actual_departure: f?.actualDeparture ?? null,
    actual_arrival: f?.actualArrival ?? null,
    delay_minutes: f?.delayMinutes ?? null,
    flight_status: f?.status ?? null,
    cross_check_status: args.crossCheckStatus,
    cross_check_details: detailsWithChecklist,
    provider_evidence: args.providerEvidence,
    decision: args.decision,
    decision_reason: args.decisionReason,
  };
  try {
    await supabase.from("flight_evidence").upsert(row, { onConflict: "claim_id" });
  } catch (err) { console.error("flight_evidence persist failed (non-blocking):", err); }

  // Set review_reason_code on claims for Pending Check
  if (args.decision === "Pending Check" && args.reviewReasonCode) {
    try {
      await supabase.from("claims").update({ review_reason_code: args.reviewReasonCode }).eq("id", claimId);
    } catch { /* non-blocking */ }
  }
}

// ── Decision application ──────────────────────────────────────────────────────

async function applyDecision(
  supabase: ReturnType<typeof createClient>,
  claimId: string, claimRef: string,
  status: EngineDecision, detail: string,
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
    type: "status_changed", claim_ref: claimRef, claim_id: claimId,
    message: `Rules Engine → ${status}: ${detail}`,
  });
}

async function applyFinancials(
  supabase: ReturnType<typeof createClient>,
  claimId: string, claimRef: string,
  departure: string, arrival: string,
  delayMinutes: number,
  jurisdiction: Jurisdiction,
  agentCode: string | null,
): Promise<void> {
  const comp = calcDelayCompensation(departure, arrival, delayMinutes, jurisdiction);
  if (!comp) return;
  const sym = currencySymbol(comp.currency);
  await supabase.from("claims").update({
    compensation_amount: comp.amount,
    amount: `${sym}${comp.amount}`,
    jurisdiction,
    updated_at: new Date().toISOString(),
  }).eq("id", claimId);

  if (agentCode && agentCode !== "—") {
    const { data: agent } = await supabase
      .from("worker_profiles")
      .select("id, commission_rate, total_payout_earned")
      .eq("agent_code", agentCode).eq("role", "agent").eq("status", "active").maybeSingle();
    if (agent) {
      const rate = Number(agent.commission_rate) || 10;
      const commission = Math.round((comp.amount * rate) / 100 * 100) / 100;
      const newTotal = Math.round((Number(agent.total_payout_earned || 0) + commission) * 100) / 100;
      await supabase.from("worker_profiles").update({ total_payout_earned: newTotal }).eq("id", agent.id);
      await supabase.from("notifications").insert({
        type: "commission_earned", claim_ref: claimRef, claim_id: claimId,
        message: `Agent ${agentCode} earned ${sym}${commission} commission (${rate}% of ${sym}${comp.amount}).`,
      });
    }
  }
}

// ── Pending Check helper ─────────────────────────────────────────────────────

async function pendingCheck(
  supabase: ReturnType<typeof createClient>,
  claimId: string, claimRef: string,
  detail: string, reasonCode: ReviewReasonCode,
  evidenceArgs: Parameters<typeof persistEvidence>[1],
): Promise<EngineResult> {
  await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
  await persistEvidence(supabase, claimId, { ...evidenceArgs, decision: "Pending Check", decisionReason: detail, reviewReasonCode: reasonCode });
  return { claimId, claimRef, decision: "Pending Check", delayMinutes: evidenceArgs.flight?.delayMinutes ?? null, reasonCode: null, source: evidenceArgs.dataSource === "none" ? null : evidenceArgs.dataSource, detail };
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
    .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline_reason, issue_type, agent, cancellation_notice_date, replacement_offered, replacement_accepted, replacement_flight_number, replacement_scheduled_dep_verified, replacement_scheduled_arr_verified, replacement_actual_arr_verified, boarding_type, confirmed_reservation, checked_in_on_time, denial_reason, is_single_booking, original_scheduled_final_arrival")
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
  const issueType = (claim.issue_type || "").toLowerCase();

  // ── Stage 1: Statute of limitations ────────────────────────────────────────
  if (flightDate) {
    const depDate = new Date(flightDate);
    const ageYears = yearsBetween(depDate, now);
    if (isIsraeliRoute(departure, arrival) && ageYears > 4) {
      const detail = `Israeli route older than 4 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      await persistEvidence(supabase, claimId, { dataSource: "none", fetchTimestamp, flight: null, crossCheckStatus: "no_data", crossCheckDetails: { reason: "statute of limitations" }, providerEvidence: null, decision: "Not Eligible - Expired", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: null, reasonCode: null, source: null, detail };
    }
    if ((isUkAirport(departure) || isEuEeaAirport(departure) || isUkAirport(arrival) || isEuEeaAirport(arrival)) && ageYears > 6) {
      const detail = `EU/UK route older than 6 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      await persistEvidence(supabase, claimId, { dataSource: "none", fetchTimestamp, flight: null, crossCheckStatus: "no_data", crossCheckDetails: { reason: "statute of limitations" }, providerEvidence: null, decision: "Not Eligible - Expired", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: null, reasonCode: null, source: null, detail };
    }
  }

  // ── Stage 1b: Brazil — always Pending Check ────────────────────────────────
  if (isBrazilianRoute(departure, arrival)) {
    const detail = "Brazilian route — manual review required (ANAC rules not yet automated).";
    return pendingCheck(supabase, claimId, claimRef, detail, "BRAZIL_MANUAL_REVIEW", {
      dataSource: "none", fetchTimestamp, flight: null,
      crossCheckStatus: "no_data", crossCheckDetails: { reason: "brazil_review" },
      providerEvidence: null,
    });
  }

  // ── Stage 1c: Quick non-covered route check (no EU/UK/IL/BR airport at all) ─
  // If neither departure nor arrival is in EU/UK/Israel/Brazil, the route is
  // not covered by any regulation. No need to fetch providers or check carrier.
  if (!isUkAirport(departure) && !isEuEeaAirport(departure) && !isIsraeliRoute(departure, arrival) &&
      !isUkAirport(arrival) && !isEuEeaAirport(arrival)) {
    const detail = "Route not covered by EU261/UK261/Israeli/Brazilian regulations — no airport in EU/UK/IL/BR.";
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    await persistEvidence(supabase, claimId, { dataSource: "none", fetchTimestamp, flight: null, crossCheckStatus: "no_data", crossCheckDetails: { reason: "no_coverage" }, providerEvidence: null, decision: "Not Eligible", decisionReason: detail });
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: null, detail };
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
  const cc = crossCheck({ flightNumber, flightDate, origin: departure, destination: arrival }, providers);

  const primarySource: DataSource = cc.matched
    ? (aero && aero.flights.includes(cc.matched) ? "aerodatabox" : "aviationstack")
    : (providers.length > 0 ? providers[0].source : "none");

  const evBase = { dataSource: primarySource, fetchTimestamp, providerEvidence };

  if (cc.status === "no_data") {
    return pendingCheck(supabase, claimId, claimRef, "No flight data available from any provider.", "NO_PROVIDER_DATA", { ...evBase, flight: null, crossCheckStatus: "no_data", crossCheckDetails: cc.details });
  }
  if (cc.status === "mismatch") {
    return pendingCheck(supabase, claimId, claimRef, `Cross-check failed: ${cc.details.reason}.`, "FLIGHT_MISMATCH", { ...evBase, flight: null, crossCheckStatus: "mismatch", crossCheckDetails: cc.details });
  }
  if (cc.status === "conflict") {
    return pendingCheck(supabase, claimId, claimRef, "Providers returned conflicting delay data.", "PROVIDER_CONFLICT", { ...evBase, flight: cc.matched, crossCheckStatus: "conflict", crossCheckDetails: cc.details });
  }
  const matched = cc.matched!;

  // ── Stage 3b: Denied boarding hard exclusions (before carrier conflict) ────
  // These don't need jurisdiction — customer answers alone determine Not Eligible.
  if (issueType === "denied boarding") {
    if (claim.boarding_type === "voluntary") {
      const detail = "Voluntary denied boarding — passenger accepted compensation, not eligible under EC261.";
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: primarySource, detail };
    }
    if (claim.confirmed_reservation === false) {
      const detail = "No confirmed reservation — not eligible for denied boarding compensation.";
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: primarySource, detail };
    }
    if (claim.checked_in_on_time === false) {
      const detail = "Did not check in on time — not eligible for denied boarding compensation.";
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: primarySource, detail };
    }
    const dr = (claim.denial_reason || "").toLowerCase();
    if (["health", "safety", "security", "documents"].includes(dr)) {
      const detail = `Denied boarding for ${dr} reasons — reasonable denial, not eligible for compensation.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: primarySource, detail };
    }
    // Missing required fields
    if (!claim.boarding_type || claim.confirmed_reservation === null || claim.checked_in_on_time === null || !claim.denial_reason) {
      return pendingCheck(supabase, claimId, claimRef, "Denied boarding claim — required fields missing.", "DENIED_BOARDING_INCOMPLETE", { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details });
    }
    // Fall through — involuntary + overbooking needs jurisdiction (carrier conflict check below)
  }

  // ── Stage 3c: Carrier conflict (after denied boarding hard exclusions) ──────
  if (cc.status === "carrier_conflict") {
    return pendingCheck(supabase, claimId, claimRef, "Providers disagree on the operating carrier — cannot determine jurisdiction.", "PROVIDER_CARRIER_CONFLICT", { ...evBase, flight: matched, crossCheckStatus: "carrier_conflict", crossCheckDetails: cc.details });
  }

  // ── Stage 3d: Jurisdiction determination (requires verified operating carrier) ─
  const operatingCarrier = matched.operatingCarrier;
  const jur = determineJurisdiction(departure, arrival, operatingCarrier);

  if (jur.jurisdiction === "NONE") {
    if (jur.detail.includes("Cannot determine")) {
      return pendingCheck(supabase, claimId, claimRef, jur.detail, "JURISDICTION_UNKNOWN_CARRIER", { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details });
    }
    const detail = jur.detail;
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes: matched.delayMinutes, reasonCode: null, source: primarySource, detail };
  }

  // Persist jurisdiction + operating carrier on claims
  await supabase.from("claims").update({
    jurisdiction: jur.jurisdiction,
    operating_carrier: operatingCarrier || null,
    operating_carrier_name: matched.operatingCarrierName || null,
    operating_carrier_source: primarySource,
    is_codeshare: matched.marketingCarrier !== null && matched.marketingCarrier !== operatingCarrier,
    marketing_carrier: matched.marketingCarrier || null,
  }).eq("id", claimId);

  // ── Stage 3d: Denied boarding — involuntary (needs jurisdiction) ────────────
  if (issueType === "denied boarding") {
    return pendingCheck(supabase, claimId, claimRef, "Involuntary denied boarding claim — requires manual evidence verification. Provider data cannot confirm overbooking.", "DENIED_BOARDING_REQUIRES_EVIDENCE", { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details });
  }

  // ── Stage 4: Cancellation detection (Article 5) ─────────────────────────────
  if (matched.status && ["cancelled", "canceled"].includes(matched.status.toLowerCase())) {
    // Check notice date first
    if (!claim.cancellation_notice_date) {
      return pendingCheck(supabase, claimId, claimRef, "Flight cancelled — cancellation notice date missing, cannot apply Article 5 rules.", "CANCELLED_MISSING_NOTICE", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: cc.details });
    }

    const noticeDate = new Date(claim.cancellation_notice_date);
    const depDate = new Date(flightDate);
    const daysNotice = Math.round((depDate.getTime() - noticeDate.getTime()) / (1000 * 60 * 60 * 24));

    // Notice ≥14 days → no Article 7 compensation (regardless of replacement)
    if (daysNotice >= 14) {
      const detail = `Cancellation notified ${daysNotice} days before departure (≥14 days) — no Article 7 compensation. Refund/re-routing rights are separate.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice }, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: null, reasonCode: null, source: primarySource, detail };
    }

    // Notice <14 days → continue Article 5 analysis
    // Check replacement flight
    if (!claim.replacement_offered) {
      // No replacement offered — but still need to check extraordinary circumstances
      const reasonCode = classifyReason(claim.airline_reason || "");
      if (EXTRAORDINARY_REASONS.has(reasonCode)) {
        return pendingCheck(supabase, claimId, claimRef, `Cancellation with ${reasonCode.toLowerCase()} — extraordinary circumstance requires manual verification.`, "EXTRAORDINARY_CIRCUMSTANCES", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice } });
      }
      // No replacement, notice <14 days, not extraordinary → Eligible
      const comp = calcDelayCompensation(departure, arrival, 999, jur.jurisdiction); // full compensation (no reduction)
      if (!comp) {
        return pendingCheck(supabase, claimId, claimRef, `Airport coordinates unavailable for ${departure}/${arrival}.`, "COORDS_UNAVAILABLE", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice } });
      }
      const detail = `Cancellation with ${daysNotice} days notice, no replacement offered — eligible for compensation.`;
      await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
      const sym = currencySymbol(comp.currency);
      await supabase.from("claims").update({ compensation_amount: comp.amount, amount: `${sym}${comp.amount}`, updated_at: new Date().toISOString() }).eq("id", claimId);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice }, decision: "Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Eligible", delayMinutes: null, reasonCode, source: primarySource, detail };
    }

    // Replacement offered
    if (!claim.replacement_accepted) {
      return pendingCheck(supabase, claimId, claimRef, "Passenger declined replacement flight — manual review required.", "CANCELLED_PASSENGER_DECLINED", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice } });
    }

    // Replacement accepted — need verified times from provider
    const replVerifiedArr = claim.replacement_actual_arr_verified || claim.replacement_scheduled_arr_verified;
    if (!replVerifiedArr) {
      return pendingCheck(supabase, claimId, claimRef, "Replacement flight times not verified by provider data — customer-entered times alone are insufficient for automatic eligibility.", "CANCELLED_REPLACEMENT_UNVERIFIED", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice } });
    }

    // Compute replacement delay (actual arrival vs original scheduled arrival)
    const originalSchedArr = matched.scheduledArrival;
    if (!originalSchedArr) {
      return pendingCheck(supabase, claimId, claimRef, "Original scheduled arrival time missing — cannot compute replacement delay.", "INCOMPLETE_EVIDENCE", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice } });
    }
    const replDelayMin = Math.max(0, Math.round((new Date(replVerifiedArr).getTime() - new Date(originalSchedArr).getTime()) / 60000));

    // Check extraordinary circumstances
    const reasonCode = classifyReason(claim.airline_reason || "");
    if (EXTRAORDINARY_REASONS.has(reasonCode)) {
      return pendingCheck(supabase, claimId, claimRef, `Cancellation with ${reasonCode.toLowerCase()} — extraordinary circumstance requires manual verification.`, "EXTRAORDINARY_CIRCUMSTANCES", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice, replacement_delay_min: replDelayMin } });
    }

    // Apply Article 5 timing rules
    let adequate = false;
    if (daysNotice >= 7) {
      // 7-13 days: dep ≤2h before, arr ≤4h after → adequate
      const replSchedDep = claim.replacement_scheduled_dep_verified;
      if (replSchedDep && originalSchedArr) {
        const depDelta = Math.round((new Date(replSchedDep).getTime() - new Date(matched.scheduledDeparture || "").getTime()) / 60000);
        adequate = depDelta <= 120 && replDelayMin <= 240;
      }
    } else {
      // <7 days: dep ≤1h before, arr ≤2h after → adequate
      const replSchedDep = claim.replacement_scheduled_dep_verified;
      if (replSchedDep && matched.scheduledDeparture) {
        const depDelta = Math.round((new Date(replSchedDep).getTime() - new Date(matched.scheduledDeparture).getTime()) / 60000);
        adequate = depDelta <= 60 && replDelayMin <= 120;
      }
    }

    if (adequate) {
      const detail = `Cancellation with ${daysNotice} days notice, adequate re-routing (replacement arrives ${replDelayMin}min after original) — not eligible for compensation.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
      await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice, replacement_delay_min: replDelayMin, adequate_rerouting: true }, decision: "Not Eligible", decisionReason: detail });
      return { claimId, claimRef, decision: "Not Eligible", delayMinutes: replDelayMin, reasonCode, source: primarySource, detail };
    }

    // Inadequate re-routing → Eligible with Article 7(2) reduction
    const comp = calcReRoutingCompensation(departure, arrival, replDelayMin, jur.jurisdiction);
    if (!comp) {
      return pendingCheck(supabase, claimId, claimRef, `Airport coordinates unavailable for ${departure}/${arrival}.`, "COORDS_UNAVAILABLE", { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice, replacement_delay_min: replDelayMin } });
    }
    const detail = `Cancellation with ${daysNotice} days notice, inadequate re-routing (replacement arrives ${replDelayMin}min after original) — eligible for compensation.`;
    await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
    const sym = currencySymbol(comp.currency);
    await supabase.from("claims").update({ compensation_amount: comp.amount, amount: `${sym}${comp.amount}`, updated_at: new Date().toISOString() }).eq("id", claimId);
    await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "cancelled", crossCheckDetails: { ...cc.details, days_notice: daysNotice, replacement_delay_min: replDelayMin, adequate_rerouting: false }, decision: "Eligible", decisionReason: detail });
    return { claimId, claimRef, decision: "Eligible", delayMinutes: replDelayMin, reasonCode, source: primarySource, detail };
  }

  // ── Stage 4b: Completeness — actual times required ──────────────────────────
  if (!matched.actualArrival || !matched.scheduledArrival || matched.delayMinutes == null) {
    return pendingCheck(supabase, claimId, claimRef, "Provider data incomplete: actual/scheduled arrival times unavailable.", "INCOMPLETE_EVIDENCE", { ...evBase, flight: matched, crossCheckStatus: "incomplete", crossCheckDetails: cc.details });
  }

  const delayMinutes = matched.delayMinutes;
  const reasonCode = classifyReason(claim.airline_reason || "");

  // ── Stage 5: Extraordinary circumstances — NEVER auto-Eligible ──────────────
  if (EXTRAORDINARY_REASONS.has(reasonCode)) {
    return pendingCheck(supabase, claimId, claimRef, `Reported reason "${reasonCode.toLowerCase()}" may be extraordinary — requires manual verification.`, "EXTRAORDINARY_CIRCUMSTANCES", { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details });
  }

  // ── Stage 6: Delay compensation eligibility — 3-hour threshold (Sturgeon) ───
  // EU261/UK261: 180 minutes (3 hours) for ALL distance bands.
  // The 120/180/240 distance-band thresholds are Article 7(2) AMOUNT reductions,
  // not eligibility gates.  Israel uses a separate 8-hour threshold.
  let threshold: number;
  if (jur.jurisdiction === "ISRAEL") {
    threshold = MIN_DELAY_IL;
  } else {
    threshold = MIN_DELAY_COMPENSATION_EU_UK; // 180 min — uniform for all EU/UK distance bands
  }

  if (delayMinutes < threshold) {
    const detail = `Delay of ${delayMinutes}min is below the 3-hour (${threshold}min) delay compensation threshold. (source: ${primarySource})`;
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Not Eligible", decisionReason: detail });
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes, reasonCode, source: primarySource, detail };
  }

  // ── Stage 7: Carrier fault + sufficient delay → Eligible ────────────────────
  if (!calcDelayCompensation(departure, arrival, delayMinutes, jur.jurisdiction)) {
    return pendingCheck(supabase, claimId, claimRef, `Airport coordinates unavailable for ${departure}/${arrival}.`, "COORDS_UNAVAILABLE", { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details });
  }

  const detail = `Delay of ${delayMinutes}min caused by ${reasonCode.toLowerCase()} issue — carrier responsibility. Jurisdiction: ${jur.jurisdiction}. (source: ${primarySource})`;
  await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
  await applyFinancials(supabase, claimId, claimRef, departure, arrival, delayMinutes, jur.jurisdiction, claim.agent || null);
  await persistEvidence(supabase, claimId, { ...evBase, flight: matched, crossCheckStatus: "matched", crossCheckDetails: cc.details, decision: "Eligible", decisionReason: detail });
  return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, source: primarySource, detail };
}
