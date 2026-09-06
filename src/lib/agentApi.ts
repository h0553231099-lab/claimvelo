/**
 * Agent Finance API — client wrapper for the manage-agent-finance edge function.
 *
 * All commission mutations (approve / pay) and the agent's own context read
 * go through this secure server-side endpoint. The frontend NEVER writes
 * commission_rate, commission_amount, or commission_status directly — those
 * are computed and persisted server-side only.
 */
import { supabase } from './supabase';
import type { AgentContext, CommissionStatus } from '../types';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-agent-finance`;

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

// ── Agent & API-key management (all server-side, JWT-authorized) ──────────────

export interface AgentListItem {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  agent_code: string;
  status: string;
  commission_rate?: number | null;
  total_payout_earned?: number | null;
  total_paid_to_date?: number | null;
  created_at: string;
  has_key: boolean;
}

/** List the caller's team agents (server-side; raw API keys are never returned). */
export async function listAgents(): Promise<AgentListItem[]> {
  const data = await call("list-agents");
  return (data.agents || []) as AgentListItem[];
}

/** Create a new agent. Role & manager_id are assigned server-side. */
export async function createAgent(payload: {
  email: string;
  full_name: string;
  agent_code: string;
  password: string;
}): Promise<void> {
  await call("create-agent", payload);
}

/** Generate a cryptographically secure API key. Returns the raw key ONCE. */
export async function generateApiKey(agentId: string): Promise<string> {
  const data = await call("generate-api-key", { agentId });
  return data.apiKey as string;
}

/** Revoke an agent's API key. */
export async function revokeApiKey(agentId: string): Promise<void> {
  await call("revoke-api-key", { agentId });
}

/** Fetch the calling agent's profile + manager display name (server-side). */
export async function getAgentContext(): Promise<AgentContext | null> {
  const data = await call('get-agent-context');
  if (!data.agent) return null;
  return {
    ...data.agent,
    managerName: data.managerName ?? null,
    managerEmail: data.managerEmail ?? null,
  } as AgentContext;
}

/** Approve a commission (pending → approved). Sales manager (own team) or admin. */
export async function approveCommission(commissionId: string): Promise<CommissionStatus> {
  const data = await call('approve-commission', { commissionId });
  return data.status as CommissionStatus;
}

/** Mark a commission paid (approved → paid). Sales manager (own team) or admin. */
export async function payCommission(commissionId: string): Promise<CommissionStatus> {
  const data = await call('pay-commission', { commissionId });
  return data.status as CommissionStatus;
}
