import { useState, useEffect } from 'react';
import { Page, Claim, ClaimStatus, Commission, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { getAgentContext } from '../lib/agentApi';
import { Plane, LogOut, TrendingUp, Clock, CheckCircle, AlertCircle, Wallet, Percent, User, QrCode, PlusCircle, BarChart3 } from 'lucide-react';
import ReferralCard from '../components/agent/ReferralCard';
import CreateLeadForm from '../components/agent/CreateLeadForm';

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

type Tab = 'dashboard' | 'profile' | 'create-lead';

const STATUS_COLORS: Record<ClaimStatus, { bg: string; text: string; dot: string }> = {
  'Untouched':  { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' },
  'In Progress':{ bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
  'Submitted':  { bg: '#ecfeff', text: '#0891b2', dot: '#0891b2' },
  'Waiting':    { bg: '#fffbeb', text: '#d97706', dot: '#d97706' },
  'Resolved':   { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
  'Escalated':  { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
  'Pending Check': { bg: '#fff7ed', text: '#ea580c', dot: '#ea580c' },
  'Eligible':   { bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  'Not Eligible': { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  'Not Eligible - Expired': { bg: '#f8fafc', text: '#94a3b8', dot: '#cbd5e1' },
  'Force Majeure': { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
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

const euro = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AgentDashboardPage({ onNav, user, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentCode, setAgentCode] = useState('');
  const [agentId, setAgentId] = useState('');
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [totalPayoutEarned, setTotalPayoutEarned] = useState(0);
  const [totalPaidToDate, setTotalPaidToDate] = useState(0);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [agentEmail, setAgentEmail] = useState('');
  const [agentFullName, setAgentFullName] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      // Load agent profile + manager name via the secure server-side endpoint
      try {
        const ctx = await getAgentContext();
        if (!ctx || !active) { setLoading(false); return; }
        setAgentCode(ctx.agent_code || '');
        setAgentId(ctx.id);
        setCommissionRate(ctx.commission_rate ?? null);
        setTotalPayoutEarned(Number(ctx.total_payout_earned) || 0);
        setTotalPaidToDate(Number(ctx.total_paid_to_date) || 0);
        setManagerName(ctx.managerName);
        setManagerEmail(ctx.managerEmail);
        setAgentEmail(ctx.email || user.email || '');
        setAgentFullName(ctx.full_name || user.full_name || '');
        if (ctx.id) await loadClaimsAndCommissions(ctx.id);
      } catch {
        // Fallback: read worker_profiles directly via RLS (no manager name)
        const { data: wp } = await supabase
          .from('worker_profiles')
          .select('id, agent_code, commission_rate, total_payout_earned, total_paid_to_date, email, full_name')
          .eq('user_id', user.id)
          .maybeSingle();
        if (wp && active) {
          setAgentCode(wp.agent_code || '');
          setAgentId(wp.id);
          setCommissionRate(wp.commission_rate ?? null);
          setTotalPayoutEarned(Number(wp.total_payout_earned) || 0);
          setTotalPaidToDate(Number(wp.total_paid_to_date) || 0);
          setAgentEmail(wp.email || user.email || '');
          setAgentFullName(wp.full_name || user.full_name || '');
          if (wp.id) await loadClaimsAndCommissions(wp.id);
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  async function loadClaimsAndCommissions(wpId: string) {
    const [claimsRes, commRes] = await Promise.all([
      supabase.from('claims').select('*').eq('agent_id', wpId).order('created_at', { ascending: false }),
      supabase.from('commissions').select('*').eq('agent_id', wpId).order('created_at', { ascending: false }),
    ]);
    if (claimsRes.data) setClaims(claimsRes.data as Claim[]);
    if (commRes.data) setCommissions(commRes.data as Commission[]);
  }

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const total = claims.length;
  const resolved = claims.filter(c => c.status === 'Resolved').length;
  const inProgress = claims.filter(c => c.status === 'In Progress').length;
  const pending = claims.filter(c => c.status === 'Untouched' || c.status === 'Submitted' || c.status === 'Waiting').length;

  // Compensation recovered for clients — sum of compensation_amount on resolved claims
  const compensationRecovered = claims
    .filter(c => c.status === 'Resolved' && c.compensation_amount != null)
    .reduce((sum, c) => sum + (Number(c.compensation_amount) || 0), 0);

  // Commission breakdown (server-computed values, only summed here for display)
  const commEarned = commissions.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commPending = commissions.filter(c => c.commission_status === 'pending').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commApproved = commissions.filter(c => c.commission_status === 'approved').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commPaid = commissions.filter(c => c.commission_status === 'paid').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);

  // Outstanding balance = total earned − total paid (server-managed totals)
  const outstandingBalance = Math.max(0, totalPayoutEarned - totalPaidToDate);

  // Claims pipeline — count per status
  const pipeline = (['Untouched', 'In Progress', 'Submitted', 'Waiting', 'Resolved', 'Escalated'] as ClaimStatus[])
    .map(s => ({ status: s, count: claims.filter(c => c.status === s).length }))
    .filter(p => p.count > 0);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <nav className="bg-white border-b border-[#e2e8f0] h-[58px] flex items-center px-5 gap-3 sticky top-0 z-50">
        <button onClick={() => onNav('home')} className="font-extrabold text-base text-[#2563eb] flex items-center gap-2 cursor-pointer border-none bg-transparent">
          <div className="w-[30px] h-[30px] bg-[#2563eb] rounded-[7px] text-white flex items-center justify-center">
            <Plane className="w-4 h-4" />
          </div>
          ClaimVelo
        </button>
        <div className="w-px h-6 bg-[#e2e8f0] mx-1" />
        <span className="text-[12px] font-semibold text-[#64748b]">Agent Portal</span>

        {/* Tabs */}
        <div className="flex items-center gap-1 ml-4">
          {([
            ['dashboard', 'Dashboard', BarChart3],
            ['profile', 'Profile', User],
            ['create-lead', 'Create Lead', PlusCircle],
          ] as [Tab, string, typeof Plane][]).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[11px] font-semibold border-none cursor-pointer transition-colors ${tab === t ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc]'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

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
          <button onClick={onSignOut} className="w-8 h-8 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer transition-colors" title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      <div className="max-w-[920px] mx-auto px-5 py-8">
        {loading ? (
          <div className="py-20 text-center text-[13px] text-[#64748b]">Loading your dashboard...</div>
        ) : tab === 'dashboard' ? (
          <>
            <div className="mb-6">
              <h1 className="text-[22px] font-black text-[#0f172a]">Welcome back, {user?.full_name?.split(' ')[0] || 'Agent'}</h1>
              <p className="text-[13px] text-[#64748b] mt-1">
                {agentCode ? <>Showing claims attributed to code <span className="font-mono font-bold text-[#2563eb]">{agentCode}</span></> : 'No agent code assigned yet.'}
              </p>
            </div>

            {/* Referral / QR card */}
            <div className="mb-6">
              <ReferralCard agentCode={agentCode} />
            </div>

            {/* Claims stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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

            {/* Compensation recovered */}
            <div className="bg-[#0f2744] text-white rounded-[12px] px-5 py-4 mb-6 flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-[#60a5fa] shrink-0" />
              <div>
                <div className="text-[13px] font-semibold opacity-80">Compensation recovered for your clients</div>
                <div className="text-[26px] font-black">{euro(compensationRecovered)}</div>
              </div>
            </div>

            {/* Commission cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Commission Earned', value: euro(commEarned), icon: Wallet, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Pending', value: euro(commPending), icon: Clock, color: '#d97706', bg: '#fffbeb' },
                { label: 'Approved', value: euro(commApproved), icon: CheckCircle, color: '#0891b2', bg: '#ecfeff' },
                { label: 'Paid', value: euro(commPaid), icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Outstanding Balance', value: euro(outstandingBalance), icon: AlertCircle, color: '#dc2626', bg: '#fef2f2' },
                { label: 'Commission Rate', value: commissionRate != null ? `${commissionRate}%` : '—', icon: Percent, color: '#64748b', bg: '#f8fafc', readOnly: true },
              ].map(({ label, value, icon: Icon, color, bg, readOnly }) => (
                <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-[18px] font-black leading-none" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-[#64748b] font-medium mt-0.5 flex items-center gap-1">
                      {label}
                      {readOnly && <span className="text-[9px] text-[#94a3b8] font-normal">(read-only)</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Claims pipeline */}
            {pipeline.length > 0 && (
              <div className="bg-white border border-[#e2e8f0] rounded-[12px] p-5 mb-6">
                <div className="font-bold text-[13px] text-[#0f172a] mb-3">Claims Pipeline</div>
                <div className="flex flex-wrap gap-2">
                  {pipeline.map(p => {
                    const c = STATUS_COLORS[p.status] || { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' };
                    return (
                      <div key={p.status} className="flex items-center gap-2 px-3 py-2 rounded-[8px]" style={{ background: c.bg }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                        <span className="text-[12px] font-semibold" style={{ color: c.text }}>{p.status}</span>
                        <span className="text-[14px] font-black" style={{ color: c.text }}>{p.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Claims table */}
            <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden mb-6">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
                <span className="font-bold text-[13px] text-[#0f172a]">Your Claims</span>
                <span className="text-[11px] text-[#64748b]">{total} total</span>
              </div>
              {claims.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-[32px] mb-2">📋</div>
                  <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No claims yet</div>
                  <div className="text-[12px] text-[#64748b]">Share your referral link or create a lead to get started.</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Ref', 'Passenger', 'Route', 'Airline', 'Status', 'Compensation', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map(c => (
                        <tr key={c.id} onClick={() => setSelectedClaim(selectedClaim?.id === c.id ? null : c)} className="hover:bg-[#f8fafc] cursor-pointer transition-colors">
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-semibold text-[#2563eb]">{c.claim_ref}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{c.passenger_first_name} {c.passenger_last_name}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.departure} → {c.arrival}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.airline || '—'}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0]"><Badge status={c.status} /></td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#16a34a]">{c.compensation_amount != null ? euro(Number(c.compensation_amount)) : c.amount}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8]">{c.created_at?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Commissions table */}
            <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
                <span className="font-bold text-[13px] text-[#0f172a]">Your Commissions</span>
                <span className="text-[11px] text-[#64748b]">{commissions.length} total</span>
              </div>
              {commissions.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[#64748b]">No commissions yet. Commissions are generated server-side when your claims are resolved.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Claim', 'Rate', 'Amount', 'Status', 'Created'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono text-[#2563eb]">{c.claim_id.slice(0, 8)}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] text-[#64748b]">{c.commission_rate}%</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#16a34a]">{euro(Number(c.commission_amount))}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0]">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              c.commission_status === 'paid' ? 'bg-[#f0fdf4] text-[#16a34a]' :
                              c.commission_status === 'approved' ? 'bg-[#ecfeff] text-[#0891b2]' :
                              'bg-[#fffbeb] text-[#d97706]'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.commission_status === 'paid' ? '#16a34a' : c.commission_status === 'approved' ? '#0891b2' : '#d97706' }} />
                              {c.commission_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8]">{c.created_at?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : tab === 'profile' ? (
          <>
            <div className="mb-6">
              <h1 className="text-[22px] font-black text-[#0f172a]">Agent Profile</h1>
              <p className="text-[13px] text-[#64748b] mt-1">Your account details and referral tools.</p>
            </div>

            <div className="grid gap-4">
              {/* Profile details */}
              <div className="bg-white border border-[#e2e8f0] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-4 h-4 text-[#2563eb]" />
                  <span className="font-bold text-[13px] text-[#0f172a]">Account</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[12px]">
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Name</div>
                    <div className="font-semibold text-[#0f172a]">{agentFullName || user?.full_name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Contact email</div>
                    <div className="font-semibold text-[#0f172a]">{agentEmail || user?.email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Agent code</div>
                    <div className="font-mono font-bold text-[#2563eb]">{agentCode || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Manager</div>
                    <div className="font-semibold text-[#0f172a]">{managerName || 'Not assigned'}</div>
                    {managerEmail && <div className="text-[11px] text-[#64748b]">{managerEmail}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Commission rate</div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#0f172a]">{commissionRate != null ? `${commissionRate}%` : '—'}</span>
                      <span className="text-[9px] text-[#94a3b8] px-1.5 py-0.5 bg-[#f1f5f9] rounded-full">read-only</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Outstanding balance</div>
                    <div className="font-bold text-[#dc2626]">{euro(outstandingBalance)}</div>
                  </div>
                </div>
                <div className="mt-4 px-3.5 py-2.5 bg-[#fffbeb] border border-[#fcd34d] rounded-[9px] text-[11px] text-[#92400e]">
                  Commission rate, payout totals, and attribution fields are managed by your manager — you cannot edit them directly.
                </div>
              </div>

              {/* Referral / QR */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <QrCode className="w-4 h-4 text-[#2563eb]" />
                  <span className="font-bold text-[13px] text-[#0f172a]">Referral link & QR code</span>
                </div>
                <ReferralCard agentCode={agentCode} />
              </div>
            </div>
          </>
        ) : (
          // Create Lead tab
          <CreateLeadForm agentCode={agentCode} onCreated={() => { if (agentId) loadClaimsAndCommissions(agentId); setTab('dashboard'); }} />
        )}

        {/* Expanded claim row */}
        {selectedClaim && tab === 'dashboard' && (
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
              <div><span className="text-[#64748b] block mb-0.5">Compensation</span><span className="font-semibold text-[#16a34a]">{selectedClaim.compensation_amount != null ? euro(Number(selectedClaim.compensation_amount)) : selectedClaim.amount}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
