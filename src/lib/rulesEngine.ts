import { supabase, insertNotification } from './supabase';

/**
 * Global Automated Checking Engine (Rules Engine)
 *
 * Evaluates a claim through a multi-stage pipeline and updates its status
 * in the database automatically. Can be called from anywhere in the system:
 * bulk import, manual claim submission, webhooks, or manual triggers.
 *
 * Pipeline:
 *   1. Statute of Limitations filter (TLV: 4yr, EU: 6yr)
 *   2. Flight Delay Timing check (< 3h = not eligible)
 *   3. Weather & Force Majeure analysis (carrier fault vs weather/ATC +
 *      neighboring flights verification)
 */

type DelayReasonCode =
  | 'CARRIER'
  | 'CREW'
  | 'TECHNICAL'
  | 'WEATHER'
  | 'ATC'
  | 'SECURITY';

interface MockFlightData {
  delayMinutes: number;
  reasonCode: DelayReasonCode;
}

export type EngineDecision =
  | 'Not Eligible - Expired'
  | 'Not Eligible'
  | 'Eligible'
  | 'Force Majeure';

export interface EngineResult {
  claimId: string;
  decision: EngineDecision;
  delayMinutes: number;
  reasonCode: DelayReasonCode;
  neighborsOnTime: boolean | null;
  detail: string;
}

const REASON_MAP: Record<string, DelayReasonCode> = {
  'carrier': 'CARRIER',
  'technical': 'TECHNICAL',
  'crew': 'CREW',
  'weather': 'WEATHER',
  'atc': 'ATC',
  'air traffic control': 'ATC',
  'security': 'SECURITY',
};

function classifyReason(raw: string): DelayReasonCode {
  const lower = raw.toLowerCase().trim();
  for (const [key, code] of Object.entries(REASON_MAP)) {
    if (lower.includes(key)) return code;
  }
  return 'CARRIER';
}

/** Deterministic mock flight data — same claim always evaluates the same way. */
function generateMockFlightData(flightNumber: string, flightDate: string): MockFlightData {
  let hash = 0;
  const seed = `${flightNumber}|${flightDate}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);
  const delayMinutes = absHash % 481;

  const roll = absHash % 100;
  let reasonCode: DelayReasonCode;
  if (roll < 35) reasonCode = 'CARRIER';
  else if (roll < 55) reasonCode = 'TECHNICAL';
  else if (roll < 70) reasonCode = 'CREW';
  else if (roll < 85) reasonCode = 'WEATHER';
  else if (roll < 95) reasonCode = 'ATC';
  else reasonCode = 'SECURITY';

  return { delayMinutes, reasonCode };
}

/** Mock check of 3 neighboring flights from the same airport. */
function checkNeighboringFlights(
  airport: string,
  flightDate: string,
  reasonCode: DelayReasonCode,
): boolean {
  let hash = 0;
  const seed = `${airport}|${flightDate}|${reasonCode}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100 < 70;
}

const ISRAELI_AIRPORT_CODES = new Set(['TLV', 'BGW', 'ETM', 'HFA']);

const EU_AIRPORT_CODES = new Set([
  'LHR','LGW','STN','LTN','MAN','BHX','GLA','EDI','BRS','NCL','ABZ','LCY',
  'CDG','ORY','NCE','LYS','MRS','TLS','BOD','BIA','NTE','MPL',
  'FRA','MUC','DUS','HAM','BER','CGN','STR','HAJ','LEJ','DRS',
  'AMS','RTM','EIN','BRU','CRL','LUX',
  'FCO','MXP','LIN','BGY','VCE','NAP','CIA','FLR','TRN','BLQ',
  'MAD','BCN','VLC','AGP','PMI','SVQ','BIO','OVD',
  'LIS','OPO','FAO',
  'ATH','SKG','HER','RHO','KLV',
  'VIE','SZG','INN',
  'ZRH','GVA','BSL','BRN',
  'CPH','RNN','BLL','AAL',
  'ARN','BMA','GOT','MMX',
  'OSL','BGO','TRD',
  'HEL','TMP','TKU',
  'DUB','ORK','SNN','NOC',
  'KEF',
  'WAW','KRK','GDN','KTW','WRO',
  'PRG','BRQ',
  'BUD','DEB',
  'OTP','CLJ','TSR',
  'SOF','VAR',
  'BEG','TGD',
  'ZAG','SPU','DBV',
  'LJU','MBX',
  'TLL','TYS',
  'RIX','VNO','KUN',
]);

function isIsraeliRoute(departure: string, arrival: string): boolean {
  return ISRAELI_AIRPORT_CODES.has(departure.toUpperCase()) || ISRAELI_AIRPORT_CODES.has(arrival.toUpperCase());
}

function isEuRoute(departure: string, arrival: string): boolean {
  return EU_AIRPORT_CODES.has(departure.toUpperCase()) || EU_AIRPORT_CODES.has(arrival.toUpperCase());
}

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) years--;
  return years;
}

const STATUTE_LIMIT_TLV_YEARS = 4;
const STATUTE_LIMIT_EU_YEARS = 6;
const MIN_ELIGIBLE_DELAY_MINUTES = 180;

/**
 * Core evaluation pipeline. Fetches the claim, runs all stages, and
 * updates the database status automatically.
 *
 * @param claimId - UUID of the claim in the `claims` table
 */
export async function evaluateClaim(claimId: string): Promise<EngineResult> {
  const { data: claim, error } = await supabase
    .from('claims')
    .select('id, claim_ref, flight_number, flight_date, departure, arrival, airline_reason')
    .eq('id', claimId)
    .maybeSingle();

  if (error || !claim) {
    return { claimId, decision: 'Not Eligible', delayMinutes: 0, reasonCode: 'CARRIER', neighborsOnTime: null, detail: 'Claim not found or lookup failed' };
  }

  const departure = (claim.departure || '').toUpperCase();
  const arrival = (claim.arrival || '').toUpperCase();
  const flightDate = claim.flight_date || '';
  const claimRef = claim.claim_ref || claimId;
  const now = new Date();

  // --- Stage 1: Statute of Limitations ---
  if (flightDate) {
    const depDate = new Date(flightDate);
    const ageYears = yearsBetween(depDate, now);

    if (isIsraeliRoute(departure, arrival) && ageYears > STATUTE_LIMIT_TLV_YEARS) {
      const detail = `Israeli route older than ${STATUTE_LIMIT_TLV_YEARS} years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(claimId, claimRef, 'Not Eligible - Expired', detail);
      return { claimId, decision: 'Not Eligible - Expired', delayMinutes: 0, reasonCode: 'CARRIER', neighborsOnTime: null, detail };
    }

    if (isEuRoute(departure, arrival) && ageYears > STATUTE_LIMIT_EU_YEARS) {
      const detail = `EU route older than ${STATUTE_LIMIT_EU_YEARS} years (${ageYears}y) — statute of limitations exceeded.`;
      await applyDecision(claimId, claimRef, 'Not Eligible - Expired', detail);
      return { claimId, decision: 'Not Eligible - Expired', delayMinutes: 0, reasonCode: 'CARRIER', neighborsOnTime: null, detail };
    }
  }

  // --- Stage 2: Flight Delay Timing ---
  const flightData = generateMockFlightData(claim.flight_number || '', flightDate);
  const reasonCode = claim.airline_reason ? classifyReason(claim.airline_reason) : flightData.reasonCode;

  if (flightData.delayMinutes < MIN_ELIGIBLE_DELAY_MINUTES) {
    const detail = `Delay of ${flightData.delayMinutes}min is below the 3-hour (180min) threshold.`;
    await applyDecision(claimId, claimRef, 'Not Eligible', detail);
    return { claimId, decision: 'Not Eligible', delayMinutes: flightData.delayMinutes, reasonCode, neighborsOnTime: null, detail };
  }

  // --- Stage 3: Weather & Force Majeure Analysis ---
  const isCarrierFault = reasonCode === 'CARRIER' || reasonCode === 'TECHNICAL' || reasonCode === 'CREW';

  if (isCarrierFault) {
    const detail = `Delay of ${flightData.delayMinutes}min caused by ${reasonCode.toLowerCase()} issue — carrier responsibility.`;
    await applyDecision(claimId, claimRef, 'Eligible', detail);
    return { claimId, decision: 'Eligible', delayMinutes: flightData.delayMinutes, reasonCode, neighborsOnTime: null, detail };
  }

  // Weather / ATC / Security → check neighboring flights
  const neighborsOnTime = checkNeighboringFlights(departure, flightDate, reasonCode);

  if (neighborsOnTime) {
    const detail = `Delay of ${flightData.delayMinutes}min (${reasonCode}) but neighboring flights departed on time — not force majeure.`;
    await applyDecision(claimId, claimRef, 'Eligible', detail);
    return { claimId, decision: 'Eligible', delayMinutes: flightData.delayMinutes, reasonCode, neighborsOnTime: true, detail };
  }

  const detail = `Delay of ${flightData.delayMinutes}min (${reasonCode}) and neighboring flights also delayed — force majeure confirmed.`;
  await applyDecision(claimId, claimRef, 'Force Majeure', detail);
  return { claimId, decision: 'Force Majeure', delayMinutes: flightData.delayMinutes, reasonCode, neighborsOnTime: false, detail };
}

async function applyDecision(claimId: string, claimRef: string, status: EngineDecision, detail: string): Promise<void> {
  await supabase.from('claims').update({ status, notes: detail, updated_at: new Date().toISOString() }).eq('id', claimId);
  await insertNotification({ type: 'status_changed', claim_ref: claimRef, claim_id: claimId, message: `Rules Engine → ${status}: ${detail}` });
}

/** Batch-evaluate multiple claims sequentially. Used by bulk import. */
export async function evaluateClaims(claimIds: string[]): Promise<EngineResult[]> {
  const results: EngineResult[] = [];
  for (const id of claimIds) {
    try {
      results.push(await evaluateClaim(id));
    } catch {
      results.push({ claimId: id, decision: 'Not Eligible', delayMinutes: 0, reasonCode: 'CARRIER', neighborsOnTime: null, detail: 'Evaluation failed' });
    }
  }
  return results;
}
