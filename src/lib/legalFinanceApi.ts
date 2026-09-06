/**
 * Legal & Finance API — client wrapper for the manage-legal-finance edge function.
 *
 * ALL legal/finance mutations go through this secure server-side endpoint. The
 * frontend NEVER writes protected legal/finance fields directly to Supabase
 * and NEVER calculates fee or payout amounts client-side — those are computed
 * and persisted server-side only.
 *
 * Authorization is enforced by the edge function from the caller's JWT:
 *   - admin / super_admin → all actions
 *   - lawyer              → get-legal-overview for own assigned cases only
 *   - everyone else       → 403
 */
import { supabase } from './supabase';
import type { LegalStatus } from '../types';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-legal-finance`;

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ── Types matching the edge function responses ──────────────────────────────

export interface LegalOverview {
  legalCase: {
    id: string;
    claim_id: string;
    lawyer_id: string | null;
    legal_status: LegalStatus;
    escalation_reason: string;
    escalated_at: string | null;
    escalated_by: string | null;
    next_deadline_date: string | null;
    deadlines: unknown[];
    notes: string;
    created_at: string;
    updated_at: string;
  };
  claim: Record<string, unknown> | null;
  transactions: LegalTransaction[];
  reconciliation: ReconciliationSummary;
}

export interface LegalTransaction {
  id: string;
  type: 'income' | 'expense';
  transaction_type: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  claim_ref: string | null;
}

export interface ReconciliationSummary {
  approvedCompensation: number;
  airlinePayment: number;
  claimveloFee: number;
  customerPayout: number;
  airlineMismatch: number | null;
  expectedPayout: number | null;
  payoutMismatch: number | null;
  overallStatus: 'pending' | 'in_progress' | 'complete' | 'mismatch';
}

export interface ReconciliationDetail {
  claimId: string;
  claimRef: string;
  approvedCompensation: number;
  airlinePayment: { status: string; amount: number; date: string | null };
  claimveloFee: { tier: string | null; rate: number | null; amount: number };
  customerPayout: { status: string; amount: number; date: string | null };
  airlineMismatch: number | null;
  expectedPayout: number | null;
  payoutMismatch: number | null;
  overallStatus: 'pending' | 'in_progress' | 'complete' | 'mismatch';
}

export interface LegalDeadline {
  label: string;
  date: string;
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** Escalate a claim to legal (creates a legal_case). Admin only. */
export async function escalateClaim(claimId: string, lawyerId?: string, escalationReason?: string) {
  return call('escalate-claim', { claimId, lawyerId, escalationReason });
}

/** Human-confirm the approved compensation amount. Admin only. */
export async function approveCompensation(claimId: string, amount: number) {
  return call('approve-compensation', { claimId, amount });
}

/** Record an airline payment. Admin only. */
export async function recordAirlinePayment(
  claimId: string,
  amount: number,
  paymentDate: string,
  reference: string,
  paymentStatus: 'partial' | 'received' = 'received',
) {
  return call('record-airline-payment', { claimId, amount, paymentDate, reference, paymentStatus });
}

/** Calculate & persist the ClaimVelo success fee. Admin only. */
export async function setClaimveloFee(claimId: string, tier: 'standard' | 'legal') {
  return call('set-claimvelo-fee', { claimId, tier });
}

/** Record the net customer payout. Admin only. */
export async function recordCustomerPayout(
  claimId: string,
  amount: number,
  paymentDate: string,
  reference: string,
) {
  return call('record-customer-payout', { claimId, amount, paymentDate, reference });
}

/** Record a legal expense (multiple per claim allowed). Admin only. */
export async function recordLegalExpense(
  amount: number,
  paymentDate: string,
  description: string,
  claimId?: string,
  category?: string,
) {
  return call('record-legal-expense', { claimId, amount, paymentDate, description, category });
}

/** Update a legal case (status / lawyer / deadlines / notes). Admin only. */
export async function updateLegalCase(
  legalCaseId: string,
  updates: {
    legalStatus?: LegalStatus;
    lawyerId?: string | null;
    nextDeadlineDate?: string | null;
    deadlines?: LegalDeadline[];
    notes?: string;
  },
) {
  return call('update-legal-case', { legalCaseId, ...updates });
}

/** Full reconciliation state for a claim. Admin only. */
export async function getReconciliation(claimId: string): Promise<ReconciliationDetail> {
  return (await call('get-reconciliation', { claimId })) as ReconciliationDetail;
}

/** Legal case + finance summary. Admin or assigned lawyer. */
export async function getLegalOverview(claimId: string): Promise<LegalOverview> {
  return (await call('get-legal-overview', { claimId })) as LegalOverview;
}
