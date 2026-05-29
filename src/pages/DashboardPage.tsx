import { useState, useEffect } from 'react';
import { Page, UserProfile, Claim, ClaimStatus } from '../types';
import { supabase } from '../lib/supabase';
import { Plane, Plus, RefreshCw } from 'lucide-react';

interface Props { onNav: (p: Page) => void; user?: UserProfile | null; }

const STAGES: ClaimStatus[] = ['Untouched', 'In Progress', 'Submitted', 'Waiting', 'Resolved', 'Escalated'];

const STATUS_STYLE: Record<ClaimStatus, string> = {
  'Untouched':   'bg-[#f8fafc] text-[#64748b]',
  'In Progress': 'bg-[#eff6ff] text-[#2563eb]',
  'Submitted':   'bg-[#ecfeff] text-[#0891b2]',
  'Waiting':     'bg-[#fffbeb] text-[#d97706]',
  'Resolved':    'bg-[#f0fdf4] text-[#16a34a]',
  'Escalated':   'bg-[#fef2f2] text-[#dc2626]',
};

const STAGE_LABELS: Record<ClaimStatus, string> = {
  'Untouched':   'Received — being reviewed',
  'In Progress': 'Being actively worked on',
  'Submitted':   'Sent to airline',
  'Waiting':     'Awaiting airline response',
  'Resolved':    'Compensation confirmed',
  'Escalated':   'Escalated to legal team',
};

function ClaimTimeline({ status }: { status: ClaimStatus }) {
  const current = STAGES.indexOf(status);
  return (
    <div className="relative pl-6 mt-4">
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-[#e2e8f0]" />
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="relative mb-4 last:mb-0">
            <div className={`absolute -left-[15px] top-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[9px] z-10 transition-all
              ${done ? 'bg-[#16a34a] border-[#16a34a] text-white'
              : active ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'bg-white border-[#e2e8f0]'}`}>
              {done ? '✓' : active ? '→' : ''}
            </div>
            <div className={`text-[13px] font-semibold leading-tight
              ${active ? 'text-[#2563eb]' : done ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
              {s}
            </div>
            {active && (
              <div className="text-[11px] text-[#2563eb] mt-0.5">{STAGE_LABELS[s]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage({ onNav, user }: Props) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Claim | null>(null);

  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }
    supabase
      .from('claims')
      .select('*')
      .eq('email', user.email)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setClaims(data as Claim[]);
          if (data.length > 0) setSelected(data[0] as Claim);
        }
        setLoading(false);
      });
  }, [user?.email]);

  const name = user?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="max-w-[860px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="text-xl font-extrabold">My Claims</div>
          <div className="text-[13px] text-[#64748b]">
            {user ? `Welcome back, ${name}` : 'Sign in to track your claims'}
          </div>
        </div>
        <button
          onClick={() => onNav('claim')}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-[10px] text-xs font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Claim
        </button>
      </div>

      {/* Not signed in */}
      {!user && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 text-center">
          <div className="w-12 h-12 bg-[#eff6ff] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane className="w-6 h-6 text-[#2563eb]" />
          </div>
          <div className="font-bold text-[15px] mb-2">Sign in to see your claims</div>
          <div className="text-[13px] text-[#64748b] mb-5">Your claim history and status updates are linked to your account.</div>
          <div className="flex gap-2.5 justify-center">
            <button onClick={() => onNav('signin')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[10px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">Sign In</button>
            <button onClick={() => onNav('claim')} className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[10px] text-[13px] font-semibold cursor-pointer hover:bg-[#e2e8f0]">Submit a Claim</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {user && loading && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 flex items-center justify-center gap-2 text-[#64748b] text-[13px]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading your claims...
        </div>
      )}

      {/* No claims */}
      {user && !loading && claims.length === 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 text-center">
          <div className="w-12 h-12 bg-[#f0fdf4] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane className="w-6 h-6 text-[#16a34a]" />
          </div>
          <div className="font-bold text-[15px] mb-2">No claims yet</div>
          <div className="text-[13px] text-[#64748b] mb-5">Start a claim and we'll handle everything from here.</div>
          <button onClick={() => onNav('claim')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[10px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">Start My First Claim →</button>
        </div>
      )}

      {/* Claims list + detail */}
      {user && !loading && claims.length > 0 && (
        <div className="flex flex-col md:flex-row gap-4">

          {/* List — hidden on mobile when a claim is selected */}
          <div className={`md:w-[260px] md:shrink-0 flex flex-col gap-2 ${selected ? 'hidden md:flex' : 'flex'}`}>
            {claims.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3.5 rounded-[10px] border cursor-pointer transition-all ${
                  selected?.id === c.id
                    ? 'bg-[#eff6ff] border-[#2563eb]'
                    : 'bg-white border-[#e2e8f0] hover:border-[#93c5fd]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-[#2563eb]">{c.claim_ref}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </div>
                <div className="font-semibold text-[12px] text-[#0f172a] truncate">{c.airline}</div>
                <div className="text-[11px] text-[#64748b]">{c.departure} → {c.arrival}</div>
                <div className="text-[10px] text-[#94a3b8] mt-1">{c.created_at?.split('T')[0]}</div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="flex-1 bg-white border border-[#e2e8f0] rounded-[14px] p-4 sm:p-6 min-w-0">
              {/* Back button on mobile */}
              <button
                onClick={() => setSelected(null)}
                className="md:hidden mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#2563eb] bg-transparent border-none cursor-pointer p-0"
              >
                ← Back to claims
              </button>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[11px] text-[#64748b] mb-0.5">{selected.claim_ref}</div>
                  <div className="font-bold text-[16px] text-[#0f172a]">
                    {selected.airline} · {selected.flight_number || '—'}
                  </div>
                  <div className="text-[13px] text-[#64748b] mt-0.5">
                    {selected.departure} → {selected.arrival}
                    {selected.flight_date && ` · ${selected.flight_date}`}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-[10px] text-[11px] font-semibold ${STATUS_STYLE[selected.status]}`}>
                    {selected.status}
                  </span>
                  <div className="text-[11px] font-bold text-[#16a34a] mt-1.5">{selected.amount}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5 p-3 sm:p-3.5 bg-[#f8fafc] rounded-[10px]">
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">Filed</div>
                  <div className="text-[11px] sm:text-[12px] font-semibold">{selected.created_at?.split('T')[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">Issue</div>
                  <div className="text-[11px] sm:text-[12px] font-semibold truncate">{selected.issue_type || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">LOA</div>
                  <div className={`text-[11px] sm:text-[12px] font-semibold ${selected.loa_signed ? 'text-[#16a34a]' : 'text-[#d97706]'}`}>
                    {selected.loa_signed ? '✓ Signed' : 'Not signed'}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1">Claim Progress</div>
              <ClaimTimeline status={selected.status} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
