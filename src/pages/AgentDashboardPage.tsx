import { useState, useEffect } from 'react';
import { Page, Claim, ClaimStatus, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { Plane, LogOut, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

const STATUS_COLORS: Record<ClaimStatus, { bg: string; text: string; dot: string }> = {
  'Untouched':  { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' },
  'In Progress':{ bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
  'Submitted':  { bg: '#ecfeff', text: '#0891b2', dot: '#0891b2' },
  'Waiting':    { bg: '#fffbeb', text: '#d97706', dot: '#d97706' },
  'Resolved':   { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
  'Escalated':  { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
};

function Badge({ status }: { status: ClaimStatus }) {
  const c = STATUS_COLORS[status] || { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

export default function AgentDashboardPage({ onNav, user, onSignOut }: Props) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentCode, setAgentCode] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  useEffect(() => {
    if (!user) return;
    // Load agent code from worker_profiles
    supabase
      .from('worker_profiles')
      .select('agent_code, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const code = data?.agent_code || '';
        setAgentCode(code);
        if (code) {
          loadClaims(code);
        } else {
          setLoading(false);
        }
      });
  }, [user]);

  async function loadClaims(code: string) {
    setLoading(true);
    const { data } = await supabase
      .from('claims')
      .select('*')
      .eq('agent', code)
      .order('created_at', { ascending: false });
    if (data) setClaims(data as Claim[]);
    setLoading(false);
  }

  const total = claims.length;
  const resolved = claims.filter(c => c.status === 'Resolved').length;
  const inProgress = claims.filter(c => c.status === 'In Progress').length;
  const pending = claims.filter(c => c.status === 'Untouched' || c.status === 'Submitted' || c.status === 'Waiting').length;
  const totalValue = claims
    .filter(c => c.status === 'Resolved')
    .reduce((sum, c) => sum + parseFloat(c.amount?.replace(/[^0-9.]/g, '') || '0'), 0);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <nav className="bg-white border-b border-[#e2e8f0] h-[58px] flex items-center px-5 gap-3 sticky top-0 z-50">
        <button
          onClick={() => onNav('home')}
          className="font-extrabold text-base text-[#2563eb] flex items-center gap-2 cursor-pointer border-none bg-transparent"
        >
          <div className="w-[30px] h-[30px] bg-[#2563eb] rounded-[7px] text-white flex items-center justify-center">
            <Plane className="w-4 h-4" />
          </div>
          ClaimVelo
        </button>
        <div className="w-px h-6 bg-[#e2e8f0] mx-1" />
        <span className="text-[12px] font-semibold text-[#64748b]">Agent Portal</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#eff6ff] rounded-[7px]">
            <div className="w-6 h-6 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-[10px] font-bold">
              {user?.full_name?.[0] || 'A'}
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#0f172a] leading-tight">{user?.full_name || 'Agent'}</div>
              {agentCode && <div className="text-[10px] font-mono text-[#2563eb] leading-tight">Code: {agentCode}</div>}
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="w-8 h-8 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      <div className="max-w-[900px] mx-auto px-5 py-8">
        {/* Welcome */}
        <div className="mb-7">
          <h1 className="text-[22px] font-black text-[#0f172a]">Welcome back, {user?.full_name?.split(' ')[0] || 'Agent'}</h1>
          <p className="text-[13px] text-[#64748b] mt-1">
            {agentCode ? `Showing claims brought in under code: ` : 'No agent code assigned yet.'}
            {agentCode && <span className="font-mono font-bold text-[#2563eb]">{agentCode}</span>}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          {[
            { label: 'Total Claims', value: total, icon: Plane, color: '#2563eb', bg: '#eff6ff' },
            { label: 'In Progress', value: inProgress, icon: Clock, color: '#d97706', bg: '#fffbeb' },
            { label: 'Resolved', value: resolved, icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Pending', value: pending, icon: AlertCircle, color: '#64748b', bg: '#f8fafc' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <div className="text-[22px] font-black leading-none" style={{ color }}>{value}</div>
                <div className="text-[10px] text-[#64748b] font-medium mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Earnings summary */}
        {resolved > 0 && (
          <div className="bg-[#0f2744] text-white rounded-[12px] px-5 py-4 mb-7 flex items-center gap-4">
            <TrendingUp className="w-8 h-8 text-[#60a5fa] shrink-0" />
            <div>
              <div className="text-[13px] font-semibold opacity-80">Total compensation recovered for your clients</div>
              <div className="text-[26px] font-black">€{totalValue.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Claims table */}
        <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <span className="font-bold text-[13px] text-[#0f172a]">Your Claims</span>
            <span className="text-[11px] text-[#64748b]">{total} total</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[13px] text-[#64748b]">Loading claims...</div>
          ) : claims.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-[32px] mb-2">📋</div>
              <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No claims yet</div>
              <div className="text-[12px] text-[#64748b]">
                {agentCode
                  ? `Share your referral code ${agentCode} or QR code to bring in clients.`
                  : 'Contact your manager to get an agent code assigned.'}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Ref', 'Passenger', 'Route', 'Airline', 'Status', 'Amount', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedClaim(selectedClaim?.id === c.id ? null : c)}
                      className="hover:bg-[#f8fafc] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-semibold text-[#2563eb]">{c.claim_ref}</td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{c.passenger_first_name} {c.passenger_last_name}</td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.departure} → {c.arrival}</td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.airline || '—'}</td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0]"><Badge status={c.status} /></td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#16a34a]">{c.amount}</td>
                      <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8]">{c.created_at?.split('T')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expanded claim row */}
        {selectedClaim && (
          <div className="mt-3 bg-white border border-[#e2e8f0] rounded-[12px] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-[13px] text-[#0f172a]">{selectedClaim.claim_ref} — Details</span>
              <button onClick={() => setSelectedClaim(null)} className="text-[#94a3b8] hover:text-[#0f172a] border-none bg-transparent cursor-pointer text-xs">Close</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
              <div><span className="text-[#64748b] block mb-0.5">Passenger</span><span className="font-semibold">{selectedClaim.passenger_first_name} {selectedClaim.passenger_last_name}</span></div>
              <div><span className="text-[#64748b] block mb-0.5">Flight</span><span className="font-semibold">{selectedClaim.flight_number} · {selectedClaim.flight_date}</span></div>
              <div><span className="text-[#64748b] block mb-0.5">Route</span><span className="font-semibold">{selectedClaim.departure} → {selectedClaim.arrival}</span></div>
              <div><span className="text-[#64748b] block mb-0.5">Issue</span><span className="font-semibold">{selectedClaim.issue_type}</span></div>
              <div><span className="text-[#64748b] block mb-0.5">Status</span><Badge status={selectedClaim.status} /></div>
              <div><span className="text-[#64748b] block mb-0.5">LOA Signed</span><span className={`font-semibold ${selectedClaim.loa_signed ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{selectedClaim.loa_signed ? 'Yes' : 'No'}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
