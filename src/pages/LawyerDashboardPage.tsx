/**
 * Lawyer Dashboard — Phase 9C
 *
 * A dedicated portal for the `lawyer` role. Shows ONLY the legal cases assigned
 * to the logged-in lawyer. RLS enforces this server-side: claims / legal_cases /
 * files / comms are filtered to rows where lawyer_id = auth.uid().
 *
 * A lawyer cannot see unrelated claims, the global finance dashboard, or any
 * finance/legal-admin actions — those are gated to admin/super_admin.
 */
import { useState, useEffect, useCallback } from 'react';
import { Page, UserProfile, Claim, LegalCase } from '../types';
import { supabase } from '../lib/supabase';
import LegalCaseDetail from '../components/legal/LegalCaseDetail';
import { LogOut, Gavel, Search, ArrowLeft, Calendar } from 'lucide-react';

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile;
  onSignOut: () => void;
}

interface AssignedCase {
  claim: Claim;
  legalCase: LegalCase | null;
}

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', pre_litigation: 'Pre-litigation', letter_before_claim: 'Letter Before Claim',
  court_filed: 'Court Filed', in_discovery: 'In Discovery', hearing_scheduled: 'Hearing Scheduled',
  judgment: 'Judgment', settled: 'Settled', closed: 'Closed', withdrawn: 'Withdrawn',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function LawyerDashboardPage({ onNav, user, onSignOut }: Props) {
  const [cases, setCases] = useState<AssignedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // RLS returns only legal_cases where lawyer_id = auth.uid()
      const { data: legalCases, error: lcErr } = await supabase
        .from('legal_cases')
        .select('*, claim:claims(*)')
        .order('updated_at', { ascending: false });
      if (lcErr) throw lcErr;
      const rows: AssignedCase[] = (legalCases || [])
        .filter((r: Record<string, unknown>) => r.claim != null)
        .map((r: Record<string, unknown>) => ({
          legalCase: r as unknown as LegalCase,
          claim: r.claim as Claim,
        }));
      setCases(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || [c.claim.claim_ref, c.claim.airline, c.claim.flight_number, `${c.claim.passenger_first_name} ${c.claim.passenger_last_name}`].join(' ').toLowerCase().includes(q);
    const matchS = !statusFilter || (c.legalCase?.legal_status ?? '') === statusFilter;
    return matchQ && matchS;
  });

  // ── Case detail view ──────────────────────────────────────────────────────
  if (selectedClaimId) {
    const sel = cases.find(c => c.claim.id === selectedClaimId);
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <header className="bg-white border-b border-[#e2e8f0] h-14 flex items-center px-4 gap-3 sticky top-0 z-10">
          <button onClick={() => setSelectedClaimId(null)} className="flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#0f172a] bg-transparent border-none cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to cases
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-[#64748b]">{user.email}</span>
            <button onClick={onSignOut} className="flex items-center gap-1 text-[11px] text-[#dc2626] hover:underline bg-transparent border-none cursor-pointer"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
          </div>
        </header>
        <div className="max-w-3xl mx-auto p-4">
          <LegalCaseDetail claimId={selectedClaimId} isAdmin={false} lawyers={[]} onUpdated={load} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="bg-white border-b border-[#e2e8f0] h-14 flex items-center px-4 gap-2 sticky top-0 z-10">
        <Gavel className="w-4 h-4 text-[#0f2744]" />
        <span className="font-bold text-[14px] text-[#0f172a]">Lawyer Portal</span>
        <span className="text-[11px] text-[#64748b] hidden sm:inline">— {user.full_name || user.email}</span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => onNav('home')} className="text-[11px] text-[#64748b] hover:text-[#0f172a] bg-transparent border-none cursor-pointer">← Website</button>
          <button onClick={onSignOut} className="flex items-center gap-1 text-[11px] text-[#dc2626] hover:underline bg-transparent border-none cursor-pointer"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-[#64748b]">Assigned cases</div>
            <div className="text-[20px] font-bold text-[#0f172a]">{cases.length}</div>
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-[#64748b]">Open (not closed/settled)</div>
            <div className="text-[20px] font-bold text-[#2563eb]">{cases.filter(c => !['closed', 'settled', 'withdrawn'].includes(c.legalCase?.legal_status ?? '')).length}</div>
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-[#64748b]">Deadlines within 7 days</div>
            <div className="text-[20px] font-bold text-[#ea580c]">{cases.filter(c => { const d = daysUntil(c.legalCase?.next_deadline_date); return d != null && d >= 0 && d <= 7; }).length}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search claim ref, airline, passenger…"
              className="w-full pl-8 pr-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb] bg-white" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2.5 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {error && <div className="text-[12px] text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-[8px] px-3 py-2 mb-3">{error}</div>}

        {/* Case list */}
        {loading ? (
          <div className="text-center py-10 text-[12px] text-[#94a3b8]">Loading your cases…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-[12px] text-[#94a3b8] bg-white border border-[#e2e8f0] rounded-[10px]">
            {cases.length === 0 ? 'No legal cases assigned to you yet.' : 'No cases match your filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => {
              const dl = daysUntil(c.legalCase?.next_deadline_date);
              const dlUrgent = dl != null && dl <= 7 && dl >= 0;
              const dlOverdue = dl != null && dl < 0;
              return (
                <button key={c.claim.id} onClick={() => setSelectedClaimId(c.claim.id)}
                  className="w-full text-left bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3 hover:border-[#2563eb] hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[13px] text-[#0f172a]">{c.claim.claim_ref}</span>
                    {c.legalCase && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb]">{STATUS_LABELS[c.legalCase.legal_status] ?? c.legalCase.legal_status}</span>}
                    {dlOverdue && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626]">Overdue</span>}
                    {dlUrgent && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fff7ed] text-[#ea580c]">Due soon</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-[#64748b]">
                    <div><span className="text-[#94a3b8]">Passenger:</span> <span className="text-[#0f172a]">{c.claim.passenger_first_name} {c.claim.passenger_last_name}</span></div>
                    <div><span className="text-[#94a3b8]">Airline:</span> <span className="text-[#0f172a]">{c.claim.airline}</span></div>
                    <div><span className="text-[#94a3b8]">Flight:</span> <span className="text-[#0f172a]">{c.claim.flight_number} · {c.claim.flight_date || '—'}</span></div>
                    <div><span className="text-[#94a3b8]">Approved:</span> <span className="text-[#0f172a]">{c.claim.approved_compensation_amount != null ? `€${Number(c.claim.approved_compensation_amount).toFixed(2)}` : '—'}</span></div>
                    <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#94a3b8]">Next deadline:</span> <span className={dlOverdue ? 'text-[#dc2626] font-medium' : dlUrgent ? 'text-[#ea580c] font-medium' : 'text-[#0f172a]'}>{fmtDate(c.legalCase?.next_deadline_date)}</span></div>
                    <div><span className="text-[#94a3b8]">Escalated:</span> <span className="text-[#0f172a]">{fmtDate(c.claim.escalated_at)}</span></div>
                  </div>
                  {c.claim.escalation_reason && <div className="mt-1.5 text-[11px] text-[#92400e] truncate"><strong>Reason:</strong> {c.claim.escalation_reason}</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
