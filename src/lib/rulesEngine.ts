import { supabase } from './supabase';

/**
 * Client-side Rules Engine entry point.
 *
 * Phase B.1: All mock / fabricated flight-data decision paths have been
 * REMOVED. The client no longer evaluates claims locally and no longer
 * writes decisions to the database directly (it ran with the anon key,
 * subject to RLS). Instead it delegates to the secure server-side
 * `evaluate-claim` Edge Function, which:
 *   - fetches real provider flight data,
 *   - cross-checks flight number / date / origin / destination,
 *   - never auto-marks extraordinary circumstances Eligible,
 *   - persists evidence server-side (never exposed to the frontend),
 *   - returns Pending Check whenever evidence is uncertain.
 *
 * `generateMockFlightData()` and `checkNeighboringFlights()` are GONE.
 */

export type EngineDecision =
  | 'Not Eligible - Expired'
  | 'Not Eligible'
  | 'Eligible'
  | 'Pending Check';

export interface EngineResult {
  claimId: string;
  decision: EngineDecision;
  detail: string;
}

/**
 * Evaluates a single claim by calling the server-side evaluate-claim Edge
 * Function. Requires an authenticated staff session (the Edge Function
 * verifies the JWT and staff role), so this must be called from a staff
 * context (e.g. Bulk Import, run by an admin).
 */
export async function evaluateClaim(claimId: string): Promise<EngineResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ claimId }),
  });
  const data = await res.json();
  if (!data.success) {
    return { claimId, decision: 'Pending Check', detail: data.error || 'Evaluation request failed' };
  }
  const r = data.result || {};
  return {
    claimId,
    decision: (r.decision as EngineDecision) || 'Pending Check',
    detail: r.detail || '',
  };
}

/** Batch-evaluate multiple claims sequentially via the server-side engine. */
export async function evaluateClaims(claimIds: string[]): Promise<EngineResult[]> {
  const results: EngineResult[] = [];
  for (const id of claimIds) {
    try {
      results.push(await evaluateClaim(id));
    } catch {
      results.push({ claimId: id, decision: 'Pending Check', detail: 'Evaluation failed' });
    }
  }
  return results;
}
