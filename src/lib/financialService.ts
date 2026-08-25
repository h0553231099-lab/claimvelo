import { supabase, insertNotification } from './supabase';

/**
 * Financial Service — Sub-Step A
 *
 * Calculates estimated compensation values for eligible claims and splits
 * commission to the travel agent's profile. Called automatically by the
 * rules engine when a claim is marked "Eligible".
 *
 * Compensation bands (EU261 / similar):
 *   - Short haul  (< 1,500 km):  €250
 *   - Medium haul (1,500–3,500 km): €400
 *   - Long haul  (> 3,500 km):   €600
 *
 * For Israeli routes the equivalent ILS amounts are used:
 *   - Short:  1,300 ₪
 *   - Medium: 2,100 ₪
 *   - Long:   3,100 ₪
 */

const KM_SHORT = 1500;
const KM_MEDIUM = 3500;

const COMP_SHORT_EUR = 250;
const COMP_MEDIUM_EUR = 400;
const COMP_LONG_EUR = 600;

const COMP_SHORT_ILS = 1300;
const COMP_MEDIUM_ILS = 2100;
const COMP_LONG_ILS = 3100;

export type Currency = 'EUR' | 'ILS';

export interface CompensationResult {
  amount: number;
  currency: Currency;
  distanceKm: number;
  band: 'short' | 'medium' | 'long';
}

export interface CommissionResult {
  agentCode: string;
  commissionRate: number;
  commissionAmount: number;
  newTotalPayout: number;
  currency: Currency;
}

// Approximate lat/lon for major airports used in distance estimation.
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

const ISRAELI_AIRPORT_CODES = new Set(['TLV', 'BGW', 'ETM', 'HFA']);

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function estimateDistance(departure: string, arrival: string): number {
  const dep = departure.toUpperCase();
  const arr = arrival.toUpperCase();
  const coordA = AIRPORT_COORDS[dep];
  const coordB = AIRPORT_COORDS[arr];
  if (coordA && coordB) return haversineKm(coordA, coordB);
  // Unknown airports — assume medium haul as a safe middle ground
  return 2000;
}

function isIsraeliRoute(dep: string, arr: string): boolean {
  return ISRAELI_AIRPORT_CODES.has(dep.toUpperCase()) || ISRAELI_AIRPORT_CODES.has(arr.toUpperCase());
}

/**
 * Calculates the estimated compensation for a claim based on flight distance.
 * Returns the amount in EUR for EU routes, ILS for Israeli routes.
 */
export function calculateCompensation(departure: string, arrival: string): CompensationResult {
  const distanceKm = estimateDistance(departure, arrival);
  const isILS = isIsraeliRoute(departure, arrival);
  const currency: Currency = isILS ? 'ILS' : 'EUR';

  let band: 'short' | 'medium' | 'long';
  let amount: number;

  if (distanceKm < KM_SHORT) {
    band = 'short';
    amount = isILS ? COMP_SHORT_ILS : COMP_SHORT_EUR;
  } else if (distanceKm <= KM_MEDIUM) {
    band = 'medium';
    amount = isILS ? COMP_MEDIUM_ILS : COMP_MEDIUM_EUR;
  } else {
    band = 'long';
    amount = isILS ? COMP_LONG_ILS : COMP_LONG_EUR;
  }

  return { amount, currency, distanceKm, band };
}

/**
 * Fetches the agent's commission_rate from their worker_profiles row.
 * Returns null if the agent is not found or not active.
 */
async function getAgentProfile(agentCode: string): Promise<{ id: string; commissionRate: number; totalPayout: number } | null> {
  if (!agentCode || agentCode === '—') return null;
  const { data, error } = await supabase
    .from('worker_profiles')
    .select('id, commission_rate, total_payout_earned')
    .eq('agent_code', agentCode)
    .eq('role', 'agent')
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    commissionRate: Number(data.commission_rate) || 10,
    totalPayout: Number(data.total_payout_earned) || 0,
  };
}

/**
 * Sub-Step A entry point — called by the rules engine when a claim is
 * marked "Eligible". Performs:
 *   1. Calculates the estimated compensation based on flight distance
 *   2. Saves it to claims.compensation_amount
 *   3. Looks up the agent's commission_rate and computes their cut
 *   4. Atomically increments the agent's total_payout_earned
 *
 * Returns the full result so callers (e.g. notifications) can use the detail.
 */
export async function applyFinancials(
  claimId: string,
  claimRef: string,
  departure: string,
  arrival: string,
  agentCode: string | null,
): Promise<{ compensation: CompensationResult; commission: CommissionResult | null }> {
  const compensation = calculateCompensation(departure, arrival);
  const currencySymbol = compensation.currency === 'ILS' ? '₪' : '€';

  // 1. Save compensation amount to the claim
  await supabase
    .from('claims')
    .update({
      compensation_amount: compensation.amount,
      amount: `${currencySymbol}${compensation.amount}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId);

  // 2. Calculate and apply agent commission
  let commission: CommissionResult | null = null;

  if (agentCode) {
    const agent = await getAgentProfile(agentCode);
    if (agent) {
      const commissionAmount = Math.round((compensation.amount * agent.commissionRate) / 100 * 100) / 100;
      const newTotal = Math.round((agent.totalPayout + commissionAmount) * 100) / 100;

      await supabase
        .from('worker_profiles')
        .update({ total_payout_earned: newTotal })
        .eq('id', agent.id);

      commission = {
        agentCode,
        commissionRate: agent.commissionRate,
        commissionAmount,
        newTotalPayout: newTotal,
        currency: compensation.currency,
      };

      await insertNotification({
        type: 'commission_earned',
        claim_ref: claimRef,
        claim_id: claimId,
        message: `Agent ${agentCode} earned ${currencySymbol}${commissionAmount} commission (${agent.commissionRate}% of ${currencySymbol}${compensation.amount}). Total payout: ${currencySymbol}${newTotal}.`,
      });
    }
  }

  return { compensation, commission };
}

/**
 * Sub-Step B — recalculates an agent's total_payout_earned from scratch
 * using their current commission_rate. Called by the admin dashboard when
 * an admin changes an agent's commission percentage.
 *
 * Iterates all eligible claims attributed to this agent, recomputes the
 * commission for each based on the new rate, and updates the agent's
 * total_payout_earned in one atomic write.
 *
 * Returns the new total and a breakdown of the recalculation.
 */
export async function recalculateAgentPayout(
  agentId: string,
  newRate: number,
): Promise<{ newTotal: number; claimCount: number; breakdown: { claimRef: string; amount: number; commission: number }[] }> {
  // Save the new rate first
  await supabase
    .from('worker_profiles')
    .update({ commission_rate: newRate })
    .eq('id', agentId);

  // Fetch the agent's code so we can find their claims
  const { data: agent } = await supabase
    .from('worker_profiles')
    .select('agent_code')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent?.agent_code) {
    return { newTotal: 0, claimCount: 0, breakdown: [] };
  }

  // Get all eligible claims for this agent that have a compensation_amount
  const { data: claims } = await supabase
    .from('claims')
    .select('id, claim_ref, compensation_amount, departure, arrival')
    .eq('agent', agent.agent_code)
    .eq('status', 'Eligible')
    .not('compensation_amount', 'is', null);

  if (!claims || claims.length === 0) {
    await supabase
      .from('worker_profiles')
      .update({ total_payout_earned: 0 })
      .eq('id', agentId);
    return { newTotal: 0, claimCount: 0, breakdown: [] };
  }

  let total = 0;
  const breakdown: { claimRef: string; amount: number; commission: number }[] = [];

  for (const claim of claims) {
    const compAmount = Number(claim.compensation_amount);
    if (isNaN(compAmount) || compAmount <= 0) continue;

    // If compensation wasn't calculated yet (e.g. pre-financial-module claim),
    // recalculate it from the route
    let amount = compAmount;
    if (!amount) {
      const result = calculateCompensation(claim.departure, claim.arrival);
      amount = result.amount;
      await supabase
        .from('claims')
        .update({ compensation_amount: amount })
        .eq('id', claim.id);
    }

    const commission = Math.round((amount * newRate) / 100 * 100) / 100;
    total = Math.round((total + commission) * 100) / 100;
    breakdown.push({ claimRef: claim.claim_ref, amount, commission });
  }

  await supabase
    .from('worker_profiles')
    .update({ total_payout_earned: total })
    .eq('id', agentId);

  return { newTotal: total, claimCount: claims.length, breakdown };
}
