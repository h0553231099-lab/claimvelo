/**
 * Shared claim evaluation logic — used by create-claim and evaluate-claim
 * edge functions. Runs with the service-role client (bypasses RLS).
 *
 * NOTE: generateMockFlightData() is retained in this file but is NO LONGER
 * used for automatic eligibility decisions. When no real evidence is available
 * (neither DB delay_hours nor live API data), the engine returns "Pending Check"
 * for manual review. Phase B will remove the mock function entirely.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type DelayReasonCode = "CARRIER" | "CREW" | "TECHNICAL" | "WEATHER" | "ATC" | "SECURITY";
type EngineDecision = "Not Eligible - Expired" | "Not Eligible" | "Eligible" | "Force Majeure" | "Pending Check";
type DelaySource = "db" | "live_api" | "mock";

export interface EngineResult {
  claimId: string;
  claimRef: string;
  decision: EngineDecision;
  delayMinutes: number;
  reasonCode: DelayReasonCode | null;
  source: DelaySource | null;
  detail: string;
}

const REASON_MAP: Record<string, DelayReasonCode> = {
  carrier: "CARRIER", technical: "TECHNICAL", crew: "CREW",
  weather: "WEATHER", atc: "ATC", "air traffic control": "ATC", security: "SECURITY",
};

function classifyReason(raw: string): DelayReasonCode {
  const lower = raw.toLowerCase().trim();
  for (const [key, code] of Object.entries(REASON_MAP)) {
    if (lower.includes(key)) return code;
  }
  return "CARRIER";
}

function inferReasonFromStatus(status: string): DelayReasonCode {
  const s = status.toLowerCase();
  if (s.includes("weather") || s.includes("storm")) return "WEATHER";
  if (s.includes("atc") || s.includes("air traffic")) return "ATC";
  if (s.includes("security")) return "SECURITY";
  if (s.includes("technical") || s.includes("equipment")) return "TECHNICAL";
  if (s.includes("crew") || s.includes("staff")) return "CREW";
  return "CARRIER";
}

// ── Deterministic mock (to be removed in Phase B) ────────────────────────────
function generateMockFlightData(flightNumber: string, flightDate: string) {
  let hash = 0;
  const seed = `${flightNumber}|${flightDate}`;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
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

const ISRAELI_AIRPORT_CODES = new Set(["TLV", "BGW", "ETM", "HFA", "SDV", "VDA", "KCN"]);
const EU_AIRPORT_CODES = new Set([
  "LHR","LGW","STN","LTN","MAN","BHX","GLA","EDI","BRS","NCL","ABZ","LCY","SEN","LPL","EMA","LBA","CWL","ABZ","BFS","SOU",
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

// ── Flight lookup via AeroDataBox API ────────────────────────────────────────
async function lookupFlightViaApi(
  flightNumber: string,
  flightDate: string,
  aerodataboxKey: string | undefined,
): Promise<{ delayMin: number; status: string } | null> {
  if (!aerodataboxKey || !flightNumber || !flightDate) return null;
  try {
    const iata = flightNumber.replace(/\s/g, "").toUpperCase();
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${iata}/${flightDate}`,
      { headers: { "x-rapidapi-host": "aerodatabox.p.rapidapi.com", "x-rapidapi-key": aerodataboxKey } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const f = data[0] as Record<string, unknown>;
    const arr = f.arrival as Record<string, unknown> | undefined;
    const arrSched = arr?.scheduledTime as Record<string, unknown> | undefined;
    const arrActual = arr?.actualTime as Record<string, unknown> | undefined;
    const schedArr = (arrSched?.local || arrSched?.utc) as string | null;
    const actualArr = (arrActual?.local || arrActual?.utc) as string | null;
    let delayMin = 0;
    if (schedArr && actualArr) {
      delayMin = Math.max(0, Math.round((new Date(actualArr).getTime() - new Date(schedArr).getTime()) / 60000));
    }
    return { delayMin, status: (f.flight_status as string) || "scheduled" };
  } catch {
    return null;
  }
}

// ── Compensation calculation (simplified — Phase B will replace with canonical service) ──
const KM_SHORT = 1500, KM_MEDIUM = 3500;
const COMP_EUR = { short: 250, medium: 400, long: 600 };
const COMP_ILS = { short: 1470, medium: 2390, long: 3530 };

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

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0]-a[0])*Math.PI)/180, dLon = ((b[1]-a[1])*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(h)));
}

function calcCompensation(dep: string, arr: string): { amount: number; currency: string } {
  const coordA = AIRPORT_COORDS[dep.toUpperCase()];
  const coordB = AIRPORT_COORDS[arr.toUpperCase()];
  const isIL = isIsraeliRoute(dep, arr);
  const currency = isIL ? "ILS" : "EUR";
  const dist = coordA && coordB ? haversineKm(coordA, coordB) : 2000;
  const bands = isIL ? COMP_ILS : COMP_EUR;
  if (dist < KM_SHORT) return { amount: bands.short, currency };
  if (dist <= KM_MEDIUM) return { amount: bands.medium, currency };
  return { amount: bands.long, currency };
}

// ── Main evaluation ─────────────────────────────────────────────────────────
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
    .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline_reason, delay_hours, agent")
    .eq("id", claimId)
    .maybeSingle();

  if (error || !claim) {
    return { claimId, claimRef: "", decision: "Pending Check", delayMinutes: 0, reasonCode: null, source: null, detail: "Claim not found or lookup failed" };
  }

  const departure = (claim.departure || "").toUpperCase();
  const arrival = (claim.arrival || "").toUpperCase();
  const flightDate = claim.flight_date || "";
  const claimRef = claim.claim_ref || claimId;
  const now = new Date();
  const aerodataboxKey = Deno.env.get("AERODATABOX_API_KEY");

  // Stage 1: Statute of limitations
  if (flightDate) {
    const depDate = new Date(flightDate);
    const ageYears = yearsBetween(depDate, now);
    if (isIsraeliRoute(departure, arrival) && ageYears > 4) {
      const detail = `Israeli route older than 4 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: 0, reasonCode: null, source: null, detail };
    }
    if (isEuRoute(departure, arrival) && ageYears > 6) {
      const detail = `EU route older than 6 years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(supabase, claimId, claimRef, "Not Eligible - Expired", detail);
      return { claimId, claimRef, decision: "Not Eligible - Expired", delayMinutes: 0, reasonCode: null, source: null, detail };
    }
  }

  // Stage 2: Resolve delay
  let delayMinutes = 0;
  let reasonCode: DelayReasonCode = "CARRIER";
  let source: DelaySource = "mock";

  if (claim.delay_hours != null && Number(claim.delay_hours) > 0) {
    delayMinutes = Math.round(Number(claim.delay_hours) * 60);
    reasonCode = claim.airline_reason ? classifyReason(claim.airline_reason) : "CARRIER";
    source = "db";
  } else {
    const apiResult = await lookupFlightViaApi(claim.flight_number || "", flightDate, aerodataboxKey);
    if (apiResult && apiResult.delayMin > 0) {
      delayMinutes = apiResult.delayMin;
      reasonCode = claim.airline_reason ? classifyReason(claim.airline_reason) : inferReasonFromStatus(apiResult.status);
      source = "live_api";
    } else {
      // No delay data available from DB or live API.
      // Do NOT use mock data for automatic decisions (Phase B will remove mock entirely).
      // Unavailable evidence must produce Pending Check for manual review.
      const detail = `No delay data available from database or live API — manual review required.`;
      await applyDecision(supabase, claimId, claimRef, "Pending Check", detail);
      return { claimId, claimRef, decision: "Pending Check", delayMinutes: 0, reasonCode: null, source: null, detail };
    }
  }

  // Stage 3: Delay timing
  if (delayMinutes < 180) {
    const detail = `Delay of ${delayMinutes}min is below the 3-hour threshold. (source: ${source})`;
    await applyDecision(supabase, claimId, claimRef, "Not Eligible", detail);
    return { claimId, claimRef, decision: "Not Eligible", delayMinutes, reasonCode, source, detail };
  }

  // Stage 4: Force majeure
  const isCarrierFault = reasonCode === "CARRIER" || reasonCode === "TECHNICAL" || reasonCode === "CREW";
  if (isCarrierFault) {
    const detail = `Delay of ${delayMinutes}min caused by ${reasonCode.toLowerCase()} issue — carrier responsibility. (source: ${source})`;
    await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
    await applyFinancials(supabase, claimId, claimRef, departure, arrival, claim.agent || null);
    return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, source, detail };
  }

  // Non-carrier fault — Phase B will add real neighboring flight check
  // For now, treat as eligible (carrier may be misusing extraordinary circumstances)
  const detail = `Delay of ${delayMinutes}min (${reasonCode}) — requires manual force majeure verification. (source: ${source})`;
  await applyDecision(supabase, claimId, claimRef, "Eligible", detail);
  await applyFinancials(supabase, claimId, claimRef, departure, arrival, claim.agent || null);
  return { claimId, claimRef, decision: "Eligible", delayMinutes, reasonCode, source, detail };
}

async function applyDecision(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  claimRef: string,
  status: EngineDecision,
  detail: string,
): Promise<void> {
  const update: Record<string, unknown> = { status, notes: detail, updated_at: new Date().toISOString() };
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
  agentCode: string | null,
): Promise<void> {
  const { amount, currency } = calcCompensation(departure, arrival);
  const symbol = currency === "ILS" ? "₪" : "€";
  await supabase.from("claims").update({
    compensation_amount: amount,
    amount: `${symbol}${amount}`,
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
      const commission = Math.round((amount * rate) / 100 * 100) / 100;
      const newTotal = Math.round((Number(agent.total_payout_earned || 0) + commission) * 100) / 100;
      await supabase.from("worker_profiles").update({ total_payout_earned: newTotal }).eq("id", agent.id);
      await supabase.from("notifications").insert({
        type: "commission_earned",
        claim_ref: claimRef,
        claim_id: claimId,
        message: `Agent ${agentCode} earned ${symbol}${commission} commission (${rate}% of ${symbol}${amount}). Total payout: ${symbol}${newTotal}.`,
      });
    }
  }
}
