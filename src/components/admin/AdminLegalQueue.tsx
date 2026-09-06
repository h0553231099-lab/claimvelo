/**
 * Admin Legal Queue — Phase 9C
 *
 * Admin view of all escalated / unassigned legal cases, with assignment and
 * reassignment. All mutations (escalate a claim, assign/reassign a lawyer,
 * update legal status) go through the secure manage-legal-finance endpoint.
 *
 * Admin / super_admin only (the parent gates visibility).
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { escalateClaim, updateLegalCase } from '../../lib/legalFinanceApi';
import type { Claim, LegalCase } from '../../types';
import LegalCaseDetail from '../legal/LegalCaseDetail';
import { Search, Gavel, ArrowLeft, RefreshCw, UserCheck, AlertCircle } from 'lucide-react';

interface QueueRow {
  claim: Claim;
  legalCase: LegalCase | null;
}

interface LawyerOption { id: string; full_name: string; email: string; }

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', pre_litigation: 'Pre-litigation', letter_before_claim: 'Letter Before Claim',
  court_filed: 'Court Filed', in_discovery: 'In Discovery', hearing_scheduled: 'Hearing Scheduled',
  judgment: 'Judgment', settled: 'Settled', closed: 'Closed', withdrawn: 'Withdrawn',
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-[#f1f5f9] text-[#64748b]', medium: 'bg-[#eff6ff] text-[#2563eb]',
  high: 'bg-[#fff7ed] text-[#ea580c]', urgent: 'bg-[#fef2f2] text-[#dc2626]',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminLegalQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [view, setStatusFilter] = useState<'all' | 'unassigned' | 'escalated'>('all');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // All legal cases (admin RLS sees all) + their claims
      const { data: legalCases, error: lcErr } = await supabase
        .from('legal_cases')
        .select('*, claim:claims(*)')
        .order('updated_at', { ascending: false });
      if (lcErr) throw lcErr;

      // Also include escalated claims that have NO legal_case yet (orphans)
      const { data: escalatedClaims } = await supabase
        .from('claims')
        .select('*')
        .not('escalated_at', 'is', null)
        .is('legal_case_id', null)
        .order('escalated_at', { ascending: false });

      const queueRows: QueueRow[] = (legalCases || [])
        .filter((r: Record<string, unknown>) => r.claim != null)
        .map((r: Record<string, unknown>) => ({ legalCase: r as unknown as LegalCase, claim: r.claim as Claim }));
      for (const c of (escalatedClaims || []) as Claim[]) {
        queueRows.push({ claim: c, legalCase: null });
      }
      setRows(queueRows);

      // Lawyers for assignment dropdown
      const { data: lawyerProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'lawyer')
        .order('full_name');
      setLawyers((lawyerProfiles || []) as LawyerOption[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load legal queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function assign(claimId: string, legalCaseId: string | null, lawyerId: string, reason?: string) {
    setBusy(claimId);
    setMsg(null);
    try {
      if (!legalCaseId) {
        // Escalate first (creates the legal_case), then assign
        const res = await escalateClaim(claimId, lawyerId || undefined, reason);
        const newId = (res.legalCase as { id: string }).id;
        if (lawyerId && newId) await updateLegalCase(newId, { lawyerId });
      } else {
        await updateLegalCase(legalCaseId, { lawyerId: lawyerId || null });
      }
      setMsg({ kind: 'ok', text: lawyerId ? 'Lawyer assigned.' : 'Lawyer unassigned.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Assignment failed' });
    } finally {
      setBusy('');
    }
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || [r.claim.claim_ref, r.claim.airline, r.claim.flight_number, `${r.claim.passenger_first_name} ${r.claim.passenger_last_name}`].join(' ').toLowerCase().includes(q);
    const matchV = view === 'all' ? true : view === 'unassigned' ? !r.legalCase?.lawyer_id : view === 'escalated' ? true : true;
    return matchQ && matchV;
  });

  // ── Case detail view ──────────────────────────────────────────────────────
  if (selectedClaimId) {
    return (
      <div>
        <button onClick={() => setSelectedClaimId(null)} className="flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#0f172a] bg-transparent border-none cursor-pointer mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to legal queue
        </button>
        <LegalCaseDetail claimId={selectedClaimId} isAdmin lawyers={lawyers} onUpdated={load} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Gavel className="w-4 h-4 text-[#0f2744]" />
        <span className="font-bold text-[14px] text-[#0f172a]">Legal Queue</span>
        <span className="text-[11px] text-[#64748b]">{rows.length} cases</span>
        <button onClick={load} disabled={loading} className="ml-auto text-[#64748b] hover:text-[#0f172a] bg-transparent border-none cursor-pointer p-0 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search claim ref, airline, passenger…"
            className="w-full pl-8 pr-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb] bg-white" />
        </div>
        <div className="flex rounded-[7px] overflow-hidden border border-[#e2e8f0]">
          {(['all', 'unassigned', 'escalated'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-2 text-[11px] font-semibold border-none cursor-pointer capitalize ${view === v ? 'bg-[#0f2744] text-white' : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'}`}>
              {v === 'all' ? 'All' : v === 'unassigned' ? 'Unassigned' : 'Escalated'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-[12px] text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-[8px] px-3 py-2 mb-3">{error}</div>}
      {msg && <div className={`text-[11px] font-semibold rounded-[7px] px-3 py-2 mb-3 ${msg.kind === 'ok' ? 'text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0]' : 'text-[#dc2626] bg-[#fef2f2] border border-[#fecaca]'}`}>{msg.text}</div>}

      {/* Table */}
      {loading ? (
        <div className="text-center py-10 text-[12px] text-[#94a3b8]">Loading legal queue…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-[12px] text-[#94a3b8] bg-white border border-[#e2e8f0] rounded-[10px]">No legal cases.</div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
          {/* header row (hidden on mobile) */}
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_0.9fr_1.3fr] gap-2 px-3 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            <span>Claim</span><span>Legal Status</span><span>Priority</span><span>Deadline</span><span>Assigned Lawyer</span>
          </div>
          {filtered.map(r => {
            const lc = r.legalCase;
            return (
              <div key={r.claim.id} className="border-b border-[#e2e8f0] last:border-0">
                <div className="md:grid md:grid-cols-[1.4fr_1fr_1fr_0.9fr_1.3fr] gap-2 px-3 py-2.5 items-center">
                  {/* Claim */}
                  <button onClick={() => setSelectedClaimId(r.claim.id)} className="text-left block">
                    <div className="font-bold text-[12px] text-[#2563eb] hover:underline">{r.claim.claim_ref}</div>
                    <div className="text-[10px] text-[#64748b]">{r.claim.airline} · {r.claim.flight_number}</div>
                    <div className="text-[10px] text-[#94a3b8]">{r.claim.passenger_first_name} {r.claim.passenger_last_name}</div>
                    {!lc && <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#fff7ed] text-[#ea580c]">Not escalated</span>}
                  </button>
                  {/* Legal status */}
                  <div className="mt-1 md:mt-0">
                    {lc ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb]">{STATUS_LABELS[lc.legal_status] ?? lc.legal_status}</span> : <span className="text-[11px] text-[#94a3b8]">—</span>}
                  </div>
                  {/* Priority */}
                  <div className="mt-1 md:mt-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[r.claim.priority || 'medium'] || PRIORITY_STYLE.medium}`}>{(r.claim.priority || 'medium').charAt(0).toUpperCase() + (r.claim.priority || 'medium').slice(1)}</span>
                  </div>
                  {/* Deadline */}
                  <div className="text-[11px] text-[#0f172a] mt-1 md:mt-0">{lc ? fmtDate(lc.next_deadline_date) : '—'}</div>
                  {/* Assignment */}
                  <div className="flex items-center gap-1.5 mt-1.5 md:mt-0">
                    <UserCheck className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
                    <select value={lc?.lawyer_id || ''} disabled={busy === r.claim.id}
                      onChange={e => assign(r.claim.id, lc?.id || null, e.target.value, r.claim.escalation_reason || undefined)}
                      className="flex-1 px-2 py-1 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] disabled:opacity-50 bg-white">
                      <option value="">Unassigned</option>
                      {lawyers.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                    </select>
                  </div>
                </div>
                {r.claim.escalation_reason && (
                  <div className="px-3 pb-2 flex items-start gap-1.5 text-[10px] text-[#92400e]"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{r.claim.escalation_reason}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
