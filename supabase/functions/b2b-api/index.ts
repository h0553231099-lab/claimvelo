import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedAgent {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: string;
  agent_code: string;
}

type DelayReasonCode = "CARRIER" | "CREW" | "TECHNICAL" | "WEATHER" | "ATC" | "SECURITY";
type EngineDecision = "Not Eligible - Expired" | "Not Eligible" | "Eligible" | "Force Majeure";
type DelaySource = "api" | "payload" | "mock";

interface EngineResult {
  claimId: string;
  claimRef: string;
  decision: EngineDecision;
  delayMinutes: number;
  reasonCode: DelayReasonCode;
  detail: string;
}

// ── Validation Schema ─────────────────────────────────────────────────────────

const phoneRegex = /^\+[1-9]\d{6,14}$/;

const leadSchema = z.object({
  pnr_code: z
    .string()
    .length(6, "pnr_code must be exactly 6 characters")
    .regex(/^[A-Z0-9]{6}$/, "pnr_code must contain only uppercase letters and digits"),

  passenger: z.object({
    first_name: z.string().min(1, "passenger.first_name is required"),
    last_name: z.string().min(1, "passenger.last_name is required"),
    email: z.string().email("passenger.email must be a valid email address"),
    phone: z
      .string()
      .regex(phoneRegex, "passenger.phone must be in international format with + (e.g. +441234567890)"),
  }),

  flight_info: z.object({
    flight_number: z.string().min(1, "flight_info.flight_number is required"),
    departure_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "flight_info.departure_date must be in YYYY-MM-DD format")
      .refine((val) => {
        const d = new Date(val);
        return !isNaN(d.getTime()) && val === d.toISOString().slice(0, 10);
      }, "flight_info.departure_date must be a valid calendar date"),
    origin: z
      .string()
      .length(3, "flight_info.origin must be exactly 3 letters")
      .regex(/^[A-Z]{3}$/, "flight_info.origin must be a 3-letter IATA code (uppercase)"),
    destination: z
      .string()
      .length(3, "flight_info.destination must be exactly 3 letters")
      .regex(/^[A-Z]{3}$/, "flight_info.destination must be a 3-letter IATA code (uppercase)"),
    delay_minutes: z.number().int().min(0).optional(),
    delay_reason: z.string().optional(),
  }),
});

type Lead = z.infer<typeof leadSchema>;

// ── Airport & Route Constants ─────────────────────────────────────────────────

const ISRAELI_AIRPORT_CODES = new Set(["TLV", "BGW", "ETM", "HFA"]);

const EU_AIRPORT_CODES = new Set([
  "LHR","LGW","STN","LTN","MAN","BHX","GLA","EDI","BRS","NCL","ABZ","LCY",
  "CDG","ORY","NCE","LYS","MRS","TLS","BOD","BIA","NTE","MPL",
  "FRA","MUC","DUS","HAM","BER","CGN","STR","HAJ","LEJ","DRS",
  "AMS","RTM","EIN","BRU","CRL","LUX",
  "FCO","MXP","LIN","BGY","VCE","NAP","CIA","FLR","TRN","BLQ",
  "MAD","BCN","VLC","AGP","PMI","SVQ","BIO","OVD",
  "LIS","OPO","FAO",
  "ATH","SKG","HER","RHO","KLV",
  "VIE","SZG","INN",
  "ZRH","GVA","BSL","BRN",
  "CPH","RNN","BLL","AAL",
  "ARN","BMA","GOT","MMX",
  "OSL","BGO","TRD",
  "HEL","TMP","TKU",
  "DUB","ORK","SNN","NOC",
  "KEF",
  "WAW","KRK","GDN","KTW","WRO",
  "PRG","BRQ",
  "BUD","DEB",
  "OTP","CLJ","TSR",
  "SOF","VAR",
  "BEG","TGD",
  "ZAG","SPU","DBV",
  "LJU","MBX",
  "TLL","TYS",
  "RIX","VNO","KUN",
]);

const AIRPORT_COORDS: Record<string, [number, number]> = {
  TLV: [32.011, 34.887], BGW: [32.009, 34.879], HFA: [32.809, 35.043], ETM: [29.733, 35.009],
  LHR: [51.470, -0.454], LGW: [51.148, -0.190], STN: [51.886, 0.238], LTN: [51.875, -0.368],
  MAN: [53.354, -2.275], BHX: [52.454, -1.748], GLA: [55.872, -4.433], EDI: [55.950, -3.373],
  BRS: [51.383, -2.713], NCL: [55.038, -1.692], LCY: [51.505, 0.050],
  CDG: [49.004, 2.551], ORY: [48.723, 2.380], NCE: [43.658, 7.219], LYS: [45.726, 5.081],
  MRS: [43.439, 5.221], TLS: [43.629, 1.364],
  FRA: [50.038, 8.562], MUC: [48.354, 11.786], DUS: [51.289, 6.766], HAM: [53.632, 9.988],
  BER: [52.367, 13.504], CGN: [50.866, 7.143], STR: [48.688, 9.222],
  AMS: [52.310, 4.768], RTM: [51.957, 4.437], EIN: [51.459, 5.386],
  BRU: [50.901, 4.484], CRL: [50.459, 4.454], LUX: [49.623, 6.204],
  FCO: [41.800, 12.238], MXP: [45.631, 8.728], LIN: [45.461, 9.274], VCE: [45.505, 12.351],
  NAP: [40.886, 14.291], FLR: [43.811, 11.205], BLQ: [44.535, 11.288],
  MAD: [40.498, -3.567], BCN: [41.297, 2.083], VLC: [39.489, -0.481], AGP: [36.674, -4.499],
  PMI: [39.552, 2.738], SVQ: [37.418, -5.893],
  LIS: [38.781, -9.136], OPO: [41.248, -8.681], FAO: [37.014, -7.966],
  ATH: [37.936, 23.945], SKG: [40.517, 22.970], HER: [35.340, 25.180], RHO: [36.405, 28.086],
  VIE: [48.110, 16.570], SZG: [47.793, 13.004], INN: [47.260, 11.344],
  ZRH: [47.450, 8.562], GVA: [46.238, 6.109], BSL: [47.589, 7.530],
  CPH: [55.618, 12.656], RNN: [57.095, 9.859], BLL: [57.093, 9.848], AAL: [57.093, 9.868],
  ARN: [59.652, 17.917], BMA: [59.354, 17.942], GOT: [57.663, 12.280], MMX: [55.536, 13.376],
  OSL: [60.197, 11.100], BGO: [60.293, 5.218], TRD: [63.458, 10.924],
  HEL: [60.317, 24.964], TMP: [61.414, 23.604], TKU: [60.514, 22.262],
  DUB: [53.421, -6.270], ORK: [51.841, -8.485], SNN: [52.702, -8.925], NOC: [53.910, -8.818],
  KEF: [63.985, -22.605],
  WAW: [52.166, 20.967], KRK: [50.078, 19.785], GDN: [54.381, 18.466], KTW: [50.474, 19.080],
  WRO: [51.103, 16.886],
  PRG: [50.101, 14.260], BRQ: [49.151, 16.691],
  BUD: [47.436, 19.256], DEB: [47.478, 21.637],
  OTP: [44.571, 26.086], CLJ: [46.785, 23.686], TSR: [45.809, 21.338],
  SOF: [42.695, 23.408], VAR: [43.232, 27.825],
  BEG: [44.818, 20.309], TGD: [42.364, 19.252],
  ZAG: [45.743, 16.069], SPU: [43.539, 16.298], DBV: [42.561, 18.268],
  LJU: [46.224, 14.456], MBX: [46.487, 15.687],
  TLL: [59.413, 24.832], TYS: [54.636, 25.286],
  RIX: [56.924, 23.971], VNO: [54.634, 25.286], KUN: [54.964, 24.083],
};

const KM_SHORT = 1500;
const KM_MEDIUM = 3500;
const COMP_SHORT_EUR = 250;
const COMP_MEDIUM_EUR = 400;
const COMP_LONG_EUR = 600;
const COMP_SHORT_ILS = 1300;
const COMP_MEDIUM_ILS = 2100;
const COMP_LONG_ILS = 3100;

const STATUTE_LIMIT_TLV_YEARS = 4;
const STATUTE_LIMIT_EU_YEARS = 6;
const MIN_ELIGIBLE_DELAY_MINUTES = 180;

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validationError(errors: { field: string; message: string }[]): Response {
  return new Response(
    JSON.stringify({ success: false, message: "Validation failed", errors }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function formatZodErrors(err: z.ZodError): { field: string; message: string }[] {
  return err.issues.map((issue) => {
    const field = issue.path.map(String).join(".") || "root";
    return { field, message: issue.message };
  });
}

function isIsraeliRoute(dep: string, arr: string): boolean {
  return ISRAELI_AIRPORT_CODES.has(dep.toUpperCase()) || ISRAELI_AIRPORT_CODES.has(arr.toUpperCase());
}

function isEuRoute(dep: string, arr: string): boolean {
  return EU_AIRPORT_CODES.has(dep.toUpperCase()) || EU_AIRPORT_CODES.has(arr.toUpperCase());
}

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) years--;
  return years;
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

function estimateDistance(dep: string, arr: string): number {
  const coordA = AIRPORT_COORDS[dep.toUpperCase()];
  const coordB = AIRPORT_COORDS[arr.toUpperCase()];
  if (coordA && coordB) return haversineKm(coordA, coordB);
  return 2000;
}

function calculateCompensation(dep: string, arr: string): { amount: number; currency: "EUR" | "ILS"; distanceKm: number } {
  const distanceKm = estimateDistance(dep, arr);
  const isILS = isIsraeliRoute(dep, arr);
  const currency: "EUR" | "ILS" = isILS ? "ILS" : "EUR";
  let amount: number;
  if (distanceKm < KM_SHORT) amount = isILS ? COMP_SHORT_ILS : COMP_SHORT_EUR;
  else if (distanceKm <= KM_MEDIUM) amount = isILS ? COMP_MEDIUM_ILS : COMP_MEDIUM_EUR;
  else amount = isILS ? COMP_LONG_ILS : COMP_LONG_EUR;
  return { amount, currency, distanceKm };
}

const REASON_MAP: Record<string, DelayReasonCode> = {
  "carrier": "CARRIER", "technical": "TECHNICAL", "crew": "CREW",
  "weather": "WEATHER", "atc": "ATC", "air traffic control": "ATC", "security": "SECURITY",
};

function classifyReason(raw: string): DelayReasonCode {
  const lower = raw.toLowerCase().trim();
  for (const [key, code] of Object.entries(REASON_MAP)) {
    if (lower.includes(key)) return code;
  }
  return "CARRIER";
}

/** Deterministic mock flight data — same claim always evaluates the same way. */
function generateMockFlightData(flightNumber: string, flightDate: string): { delayMinutes: number; reasonCode: DelayReasonCode } {
  let hash = 0;
  const seed = `${flightNumber}|${flightDate}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);
  const delayMinutes = absHash % 481;
  const roll = absHash % 100;
  let reasonCode: DelayReasonCode;
  if (roll < 35) reasonCode = "CARRIER";
  else if (roll < 55) reasonCode = "TECHNICAL";
  else if (roll < 70) reasonCode = "CREW";
  else if (roll < 85) reasonCode = "WEATHER";
  else if (roll < 95) reasonCode = "ATC";
  else reasonCode = "SECURITY";
  return { delayMinutes, reasonCode };
}

interface NeighboringFlight {
  airline: string;
  flightNumber: string;
  destination: string;
  delayMinutes: number;
  onTime: boolean;
}

const NEIGHBORING_AIRLINES = [
  "British Airways", "Lufthansa", "Air France", "KLM",
  "Ryanair", "easyJet", "Iberia", "TAP Air Portugal",
  "Aegean Airlines", "SAS", "Finnair", "Swiss International",
];

const NEIGHBORING_DESTINATIONS = [
  "LHR", "CDG", "FRA", "AMS", "MAD", "FCO", "DUB", "CPH",
  "VIE", "ZRH", "ATH", "LIS",
];

function checkNeighboringFlights(
  airport: string,
  flightDate: string,
  reasonCode: DelayReasonCode,
): { flights: NeighboringFlight[]; anyOnTime: boolean } {
  const flights: NeighboringFlight[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = `${airport}|${flightDate}|${reasonCode}|${i}`;
    let hash = 0;
    for (let j = 0; j < seed.length; j++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(j)) | 0;
    }
    const absHash = Math.abs(hash);
    const airlineIdx = absHash % NEIGHBORING_AIRLINES.length;
    const destIdx = (absHash >> 4) % NEIGHBORING_DESTINATIONS.length;
    const flightNum = `${NEIGHBORING_AIRLINES[airlineIdx].slice(0, 2).toUpperCase()}${100 + (absHash % 900)}`;
    const delayMin = absHash % 240;
    const onTime = delayMin < 30;
    flights.push({
      airline: NEIGHBORING_AIRLINES[airlineIdx],
      flightNumber: flightNum,
      destination: NEIGHBORING_DESTINATIONS[destIdx],
      delayMinutes: delayMin,
      onTime,
    });
  }
  const anyOnTime = flights.some((f) => f.onTime);
  return { flights, anyOnTime };
}

function formatNeighbors(flights: NeighboringFlight[]): string {
  return flights.map((f) =>
    `${f.airline} ${f.flightNumber} → ${f.destination}: ${f.onTime ? "on time" : `${f.delayMinutes}min delay`}`,
  ).join("; ");
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

async function authenticateAgent(req: Request): Promise<{ agent: AuthenticatedAgent } | { response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { response: jsonError(401, "Missing or malformed Authorization header. Expected: Bearer <AGENT_API_KEY>") };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { response: jsonError(401, "Empty bearer token.") };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("worker_profiles")
    .select("id, user_id, email, full_name, role, agent_code")
    .eq("api_key", token)
    .maybeSingle();

  if (error || !data) {
    return { response: jsonError(401, "Invalid or unrecognized API key.") };
  }

  return { agent: data as AuthenticatedAgent };
}

// ── Rules Engine (server-side) ────────────────────────────────────────────────

async function evaluateClaim(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  claimRef: string,
  flightNumber: string,
  flightDate: string,
  departure: string,
  arrival: string,
  agentCode: string,
  payloadDelayMinutes: number | undefined,
  payloadDelayReason: string | undefined,
): Promise<EngineResult> {
  const now = new Date();
  const dep = departure.toUpperCase();
  const arr = arrival.toUpperCase();

  // --- Stage 1: Statute of Limitations ---
  if (flightDate) {
    const depDate = new Date(flightDate);
    const ageYears = yearsBetween(depDate, now);

    if (isIsraeliRoute(dep, arr) && ageYears > STATUTE_LIMIT_TLV_YEARS) {
      const detail = `Israeli route older than ${STATUTE_LIMIT_TLV_YEARS} years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: 0, reasonCode: "CARRIER", detail };
    }

    if (isEuRoute(dep, arr) && ageYears > STATUTE_LIMIT_EU_YEARS) {
      const detail = `EU route older than ${STATUTE_LIMIT_EU_YEARS} years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: 0, reasonCode: "CARRIER", detail };
    }
  }

  // --- Stage 2: Flight Delay Timing ---
  // Prefer payload-provided delay, then deterministic mock
  let delayMinutes: number;
  let reasonCode: DelayReasonCode;
  let source: DelaySource;

  if (payloadDelayMinutes != null && payloadDelayMinutes > 0) {
    delayMinutes = payloadDelayMinutes;
    reasonCode = payloadDelayReason ? classifyReason(payloadDelayReason) : "CARRIER";
    source = "payload";
  } else {
    const mock = generateMockFlightData(flightNumber, flightDate);
    delayMinutes = mock.delayMinutes;
    reasonCode = payloadDelayReason ? classifyReason(payloadDelayReason) : mock.reasonCode;
    source = "mock";
  }

  if (delayMinutes < MIN_ELIGIBLE_DELAY_MINUTES) {
    const detail = `Delay of ${delayMinutes}min is below the 3-hour (180min) threshold. (source: ${source})`;
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes, reasonCode, detail };
  }

  // --- Stage 3: Weather & Force Majeure Analysis ---
  const isCarrierFault = reasonCode === "CARRIER" || reasonCode === "TECHNICAL" || reasonCode === "CREW";

  if (isCarrierFault) {
    const detail = `Delay of ${delayMinutes}min caused by ${reasonCode.toLowerCase()} issue — carrier responsibility. (source: ${source})`;
    await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
    await applyFinancials(supabase, claimId, claimRef, dep, arr, agentCode);
    return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, detail };
  }

  // Weather / ATC / Security → verify with neighboring flights
  const neighborCheck = checkNeighboringFlights(dep, flightDate, reasonCode);
  const neighborSummary = formatNeighbors(neighborCheck.flights);

  if (neighborCheck.anyOnTime) {
    const detail = `Delay of ${delayMinutes}min (${reasonCode}) but neighboring flights from ${dep} departed on time — not force majeure. Neighbors: ${neighborSummary}. (source: ${source})`;
    await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
    await applyFinancials(supabase, claimId, claimRef, dep, arr, agentCode);
    return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, detail };
  }

  const detail = `Delay of ${delayMinutes}min (${reasonCode}) and all 3 neighboring flights from ${dep} also delayed — force majeure confirmed. Neighbors: ${neighborSummary}. (source: ${source})`;
  await applyDecision(supabase, claimId, claimRef, "Force Majeure", detail);
  return { claimId, claimRef, decision: "Force Majeure", delayMinutes, reasonCode, detail };
}

async function applyDecision(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  claimRef: string,
  status: EngineDecision,
  detail: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    notes: detail,
    updated_at: new Date().toISOString(),
  };
  if (status !== "Eligible") {
    update.compensation_amount = 0;
    update.amount = "€0";
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
  agentCode: string,
): Promise<void> {
  const compensation = calculateCompensation(departure, arrival);
  const currencySymbol = compensation.currency === "ILS" ? "₪" : "€";

  await supabase.from("claims").update({
    compensation_amount: compensation.amount,
    amount: `${currencySymbol}${compensation.amount}`,
    updated_at: new Date().toISOString(),
  }).eq("id", claimId);

  if (agentCode) {
    const { data: agent } = await supabase
      .from("worker_profiles")
      .select("id, commission_rate, total_payout_earned")
      .eq("agent_code", agentCode)
      .eq("role", "agent")
      .eq("status", "active")
      .maybeSingle();

    if (agent) {
      const rate = Number(agent.commission_rate) || 10;
      const currentPayout = Number(agent.total_payout_earned) || 0;
      const commissionAmount = Math.round((compensation.amount * rate) / 100 * 100) / 100;
      const newTotal = Math.round((currentPayout + commissionAmount) * 100) / 100;

      await supabase.from("worker_profiles")
        .update({ total_payout_earned: newTotal })
        .eq("id", agent.id);

      await supabase.from("notifications").insert({
        type: "commission_earned",
        claim_ref: claimRef,
        claim_id: claimId,
        message: `Agent ${agentCode} earned ${currencySymbol}${commissionAmount} commission (${rate}% of ${currencySymbol}${compensation.amount}). Total payout: ${currencySymbol}${newTotal}.`,
      });
    }
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/b2b-api/, "").replace(/^\/+/, "/");

  // ── Route: GET /api/v1/docs ──────────────────────────────────────────
  if (path === "/api/v1/docs" && req.method === "GET") {
    return jsonOk({
      name: "ClaimVelo B2B API",
      version: "1.0.0",
      base_url: "https://claimvelo.co/functions/v1/b2b-api",
      endpoints: {
        "POST /api/v1/leads": {
          description: "Submit a new flight delay lead for evaluation.",
          authentication: "Bearer <AGENT_API_KEY> in the Authorization header",
          content_type: "application/json",
          required_fields: {
            pnr_code: "string (6 chars, uppercase alphanumeric)",
            "passenger.first_name": "string",
            "passenger.last_name": "string",
            "passenger.email": "string (valid email)",
            "passenger.phone": "string (international format with +, e.g. +441234567890)",
            "flight_info.flight_number": "string",
            "flight_info.departure_date": "string (YYYY-MM-DD)",
            "flight_info.origin": "string (3-letter IATA code)",
            "flight_info.destination": "string (3-letter IATA code)",
          },
          optional_fields: {
            "flight_info.delay_minutes": "number (integer, minutes of delay)",
            "flight_info.delay_reason": "string (carrier, technical, crew, weather, atc, security)",
          },
          responses: {
            "201": { success: true, message: "string", claim_ref: "string", evaluation_status: "string" },
            "400": { success: false, message: "string", errors: "[{field, message}]" },
            "401": { success: false, message: "string" },
            "500": { success: false, message: "string" },
          },
        },
      },
      examples: {
        curl: `curl -X POST \\
  https://claimvelo.co/functions/v1/b2b-api/api/v1/leads \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -d '{
    "pnr_code": "ABC123",
    "passenger": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone": "+441234567890"
    },
    "flight_info": {
      "flight_number": "BA245",
      "departure_date": "2026-07-15",
      "origin": "LHR",
      "destination": "JFK",
      "delay_minutes": 240,
      "delay_reason": "technical"
    }
  }'`,
        javascript: `const response = await fetch(
  "https://claimvelo.co/functions/v1/b2b-api/api/v1/leads",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_AGENT_API_KEY",
    },
    body: JSON.stringify({
      pnr_code: "ABC123",
      passenger: {
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "+441234567890",
      },
      flight_info: {
        flight_number: "BA245",
        departure_date: "2026-07-15",
        origin: "LHR",
        destination: "JFK",
        delay_minutes: 240,
        delay_reason: "technical",
      },
    }),
  }
);
const data = await response.json();
console.log(data);`,
      },
    });
  }

  // ── Route: POST /api/v1/leads ──────────────────────────────────────────
  if (path === "/api/v1/leads" && req.method === "POST") {
    try {
      // 1. Enforce JSON content type
      const contentType = req.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) {
        return jsonError(400, "Content-Type must be application/json");
      }

      // 2. Authenticate
      const auth = await authenticateAgent(req);
      if ("response" in auth) return auth.response;
      const agent = auth.agent;

      // 3. Parse JSON body
      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        return jsonError(400, "Request body is not valid JSON");
      }

      // 4. Strict validation
      const result = leadSchema.safeParse(rawBody);
      if (!result.success) {
        return validationError(formatZodErrors(result.error));
      }

      const lead: Lead = result.data;

      // 5. Create service-role client for DB writes
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // 6. Generate claim reference
      const claimRef = "CLM-" + Date.now().toString().slice(-6) + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();

      // 7. Insert claim into database
      const { data: claimRow, error: insertError } = await supabase
        .from("claims")
        .insert({
          claim_ref: claimRef,
          passenger_first_name: lead.passenger.first_name,
          passenger_last_name: lead.passenger.last_name,
          email: lead.passenger.email,
          phone: lead.passenger.phone,
          booking_reference: lead.pnr_code,
          flight_number: lead.flight_info.flight_number,
          flight_date: lead.flight_info.departure_date,
          departure: lead.flight_info.origin,
          arrival: lead.flight_info.destination,
          airline_reason: lead.flight_info.delay_reason || "",
          delay_hours: lead.flight_info.delay_minutes
            ? Math.round((lead.flight_info.delay_minutes / 60) * 100) / 100
            : 0,
          issue_type: "Delay",
          agent: agent.agent_code,
          status: "Pending Check",
          loa_signed: false,
          notes: `Lead submitted via B2B API by ${agent.full_name} (${agent.email})`,
        })
        .select("id")
        .single();

      if (insertError || !claimRow) {
        return jsonError(500, "Internal server error");
      }

      const claimId = claimRow.id;

      // 8. Trigger rules engine evaluation
      let engineResult: EngineResult;
      try {
        engineResult = await evaluateClaim(
          supabase,
          claimId,
          claimRef,
          lead.flight_info.flight_number,
          lead.flight_info.departure_date,
          lead.flight_info.origin,
          lead.flight_info.destination,
          agent.agent_code,
          lead.flight_info.delay_minutes,
          lead.flight_info.delay_reason,
        );
      } catch (err) {
        // Claim created but engine failed — return success with partial evaluation
        return jsonOk({
          success: true,
          message: "Lead received and processed successfully (evaluation pending)",
          claim_ref: claimRef,
          evaluation_status: "Pending Check",
        }, 201);
      }

      // 9. Return standardized success response
      return jsonOk({
        success: true,
        message: "Lead received and processed successfully",
        claim_ref: claimRef,
        evaluation_status: engineResult.decision,
      }, 201);

    } catch {
      // Catch-all for any unhandled server error
      return jsonError(500, "Internal server error");
    }
  }

  return jsonError(404, `No route for ${req.method} ${path}`);
});
