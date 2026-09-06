import { useState, useEffect, useMemo } from 'react';
import { Page, Claim, Commission, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { Plane, LogOut, UserPlus, TrendingUp, Users, CheckCircle, X, Eye, EyeOff, AlertCircle, Key, Copy, RefreshCw, Trash2, DollarSign, BarChart3, Award, Target } from 'lucide-react';
import SalesCommissions from '../components/sales/SalesCommissions';
import SalesClaims from '../components/sales/SalesClaims';
import { listAgents, createAgent as apiCreateAgent, generateApiKey as apiGenerateApiKey, revokeApiKey as apiRevokeApiKey } from '../lib/agentApi';

interface AgentRow {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  agent_code: string;
  status: string;
  has_key: boolean;
  commission_rate?: number | null;
  total_payout_earned?: number | null;
  total_paid_to_date?: number | null;
  created_at: string;
}

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

type SalesView = 'overview' | 'agents' | 'claims' | 'commissions' | 'performance';
type AgentSubView = 'list' | 'add' | 'api-keys';

const euro = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SalesManagerPage({ onNav, user, onSignOut }: Props) {
  const [view, setView] = useState<SalesView>('overview');
  const [agentSubView, setAgentSubView] = useState<AgentSubView>('list');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [commLoading, setCommLoading] = useState(false);

  // New agent form
  const [form, setForm] = useState({ email: '', full_name: '', agent_code: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState<string | null>(null);
  const [keyError, setKeyError] = useState('');
  // Raw keys are only ever held in memory right after generation (shown once).
  // They are never persisted client-side or re-read from the database.
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, [user]);

  async function loadData() {
    if (!user) return;
    setLoading(true);

    // Load agents belonging to this manager via the authorized server-side flow.
    // The edge function enforces team scoping and never returns raw API keys.
    const myAgents = await listAgents();
    setAgents(myAgents);

    // Load all claims for the team (RLS filters to team claims for sales_manager)
    const { data: claimData } = await supabase
      .from('claims')
      .select('*')
      .order('created_at', { ascending: false });
    setClaims((claimData || []) as Claim[]);

    setLoading(false);
    await loadCommissions();
  }

  async function loadCommissions() {
    setCommLoading(true);
    // RLS returns only team commissions; join claim + agent for display
    const { data: commData } = await supabase
      .from('commissions')
      .select('*, claim:claims(claim_ref), agent:worker_profiles(full_name, agent_code)')
      .order('created_at', { ascending: false });
    if (commData) {
      setCommissions((commData as unknown as Commission[]).map((c: Record<string, unknown>) => ({
        ...(c as object),
        claim_ref: (c.claim as { claim_ref?: string })?.claim_ref,
        agent_name: (c.agent as { full_name?: string })?.full_name,
        agent_code: (c.agent as { agent_code?: string })?.agent_code,
      })));
    }
    setCommLoading(false);
  }

  async function createAgent() {
    setError('');
    setSuccess('');
    if (!form.email.trim() || !form.full_name.trim() || !form.agent_code.trim()) {
      setError('Name, email, and agent code are required.');
      return;
    }
    if (!form.password || form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);

    try {
      // All creation happens server-side: role is hardcoded to 'agent' and
      // manager_id is assigned to the caller — neither is controllable client-side.
      await apiCreateAgent({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        agent_code: form.agent_code.trim().toUpperCase(),
        password: form.password,
      });
      setSuccess(`Agent ${form.full_name} created with code ${form.agent_code.toUpperCase()}.`);
      setForm({ email: '', full_name: '', agent_code: '', password: '', confirm: '' });
      await loadData();
      setTimeout(() => setAgentSubView('list'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  }

  async function createApiKey(agent: AgentRow) {
    setKeyError('');
    setKeyBusy(agent.id);
    try {
      // Key is generated server-side (crypto-secure) and returned ONCE.
      const rawKey = await apiGenerateApiKey(agent.id);
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, has_key: true } : a));
      setNewKeys(prev => ({ ...prev, [agent.id]: rawKey }));
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally {
      setKeyBusy(null);
    }
  }

  async function revokeApiKey(agent: AgentRow) {
    if (!confirm(`Revoke API key for ${agent.full_name}?`)) return;
    setKeyBusy(agent.id);
    try {
      await apiRevokeApiKey(agent.id);
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, has_key: false } : a));
      setNewKeys(prev => { const n = { ...prev }; delete n[agent.id]; return n; });
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setKeyBusy(null);
    }
  }

  async function copyKey(key: string, agentId: string) {
    try { await navigator.clipboard.writeText(key); setCopiedKey(agentId); setTimeout(() => setCopiedKey(null), 2000); } catch { /* */ }
  }

  // Agent code → name map (for claims display)
  const agentNames = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach(a => { if (a.agent_code) m[a.agent_code] = a.full_name; });
    return m;
  }, [agents]);

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const totalAgents = agents.length;
  const totalClaims = claims.length;
  const totalResolved = claims.filter(c => c.status === 'Resolved').length;
  const conversion = totalClaims > 0 ? Math.round((totalResolved / totalClaims) * 100) : 0;
  const revenueGenerated = claims.filter(c => c.status === 'Resolved').reduce((s, c) => s + (Number(c.compensation_amount) || 0), 0);

  const commTotal = commissions.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commPending = commissions.filter(c => c.commission_status === 'pending').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commApproved = commissions.filter(c => c.commission_status === 'approved').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const commPaid = commissions.filter(c => c.commission_status === 'paid').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);

  // Per-agent stats
  function agentStats(code: string) {
    const ac = claims.filter(c => c.agent === code);
    const resolved = ac.filter(c => c.status === 'Resolved').length;
    const revenue = ac.filter(c => c.status === 'Resolved').reduce((s, c) => s + (Number(c.compensation_amount) || 0), 0);
    const winRate = ac.length > 0 ? Math.round((resolved / ac.length) * 100) : 0;
    return { total: ac.length, resolved, revenue, winRate };
  }

  const NAV_TABS: [SalesView, string][] = [
    ['overview', 'Overview'],
    ['agents', 'Agents'],
    ['claims', 'Leads/Claims'],
    ['commissions', 'Commissions'],
    ['performance', 'Performance'],
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <nav className="bg-white border-b border-[#e2e8f0] h-[58px] flex items-center px-5 gap-3 sticky top-0 z-50">
        <button onClick={() => onNav('home')} className="font-extrabold text-base text-[#2563eb] flex items-center gap-2 cursor-pointer border-none bg-transparent">
          <div className="w-[30px] h-[30px] bg-[#2563eb] rounded-[7px] text-white flex items-center justify-center"><Plane className="w-4 h-4" /></div>
          ClaimVelo
        </button>
        <div className="w-px h-6 bg-[#e2e8f0] mx-1" />
        <span className="text-[12px] font-semibold text-[#64748b]">Sales Manager Portal</span>

        <div className="flex items-center gap-1 ml-4 overflow-x-auto">
          {NAV_TABS.map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-[7px] text-[11px] font-semibold border-none cursor-pointer whitespace-nowrap transition-colors ${view === v ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f0fdf4] rounded-[7px]">
            <div className="w-6 h-6 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-[10px] font-bold">{user?.full_name?.[0] || 'M'}</div>
            <span className="text-[11px] font-semibold text-[#0f172a]">{user?.full_name || 'Manager'}</span>
          </div>
          <button onClick={onSignOut} className="w-8 h-8 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer transition-colors" title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      <div className="max-w-[960px] mx-auto px-5 py-8">
        {/* ── OVERVIEW ── */}
        {view === 'overview' && (
          <div>
            <div className="mb-7">
              <h1 className="text-[22px] font-black text-[#0f172a]">Sales Overview</h1>
              <p className="text-[13px] text-[#64748b] mt-1">Performance summary across your team.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Agents', value: totalAgents, icon: Users, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Total Claims', value: totalClaims, icon: Plane, color: '#0891b2', bg: '#ecfeff' },
                { label: 'Resolved', value: totalResolved, icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Conversion', value: `${conversion}%`, icon: Target, color: '#d97706', bg: '#fffbeb' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}><Icon className="w-4 h-4" style={{ color }} /></div>
                  <div>
                    <div className="text-[20px] font-black leading-none" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-[#64748b] font-medium mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="bg-[#0f2744] text-white rounded-[12px] px-5 py-4 flex items-center gap-4">
                <TrendingUp className="w-8 h-8 text-[#60a5fa] shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold opacity-80">Compensation / Revenue Generated</div>
                  <div className="text-[24px] font-black">{euro(revenueGenerated)}</div>
                </div>
              </div>
              <div className="bg-white border border-[#e2e8f0] rounded-[12px] px-5 py-4 flex items-center gap-4">
                <DollarSign className="w-8 h-8 text-[#16a34a] shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold text-[#64748b]">Commission Total</div>
                  <div className="text-[24px] font-black text-[#0f172a]">{euro(commTotal)}</div>
                </div>
              </div>
            </div>

            {/* Commission breakdown */}
            <div className="grid grid-cols-3 gap-3 mb-7">
              {[
                { label: 'Pending', value: euro(commPending), color: '#d97706', bg: '#fffbeb' },
                { label: 'Approved', value: euro(commApproved), color: '#0891b2', bg: '#ecfeff' },
                { label: 'Paid', value: euro(commPaid), color: '#16a34a', bg: '#f0fdf4' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className="rounded-[10px] px-4 py-3" style={{ background: bg }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
                  <div className="text-[16px] font-black mt-0.5" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Agent leaderboard */}
            <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0]"><span className="font-bold text-[13px] text-[#0f172a]">Agent Leaderboard</span></div>
              {loading ? (
                <div className="py-10 text-center text-[13px] text-[#64748b]">Loading...</div>
              ) : agents.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-[28px] mb-2">👥</div>
                  <div className="text-[13px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                  <button onClick={() => { setView('agents'); setAgentSubView('add'); }} className="mt-2 px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">Add your first agent</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>{['Rank', 'Agent', 'Code', 'Claims', 'Resolved', 'Revenue', 'Win Rate'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {[...agents].map(a => ({ ...a, ...agentStats(a.agent_code) })).sort((a, b) => b.resolved - a.resolved).map((a, i) => (
                        <tr key={a.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#94a3b8]">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{a.full_name}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#2563eb]">{a.total}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#16a34a]">{a.resolved}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#d97706]">{euro(a.revenue)}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] text-[#64748b]">{a.total > 0 ? `${a.winRate}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AGENTS ── */}
        {view === 'agents' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-[22px] font-black text-[#0f172a]">My Agents</h1>
                <p className="text-[13px] text-[#64748b] mt-1">{agents.length} agent{agents.length !== 1 ? 's' : ''} in your team</p>
              </div>
              <div className="flex items-center gap-1.5">
                {(['list', 'add', 'api-keys'] as AgentSubView[]).map(sv => (
                  <button key={sv} onClick={() => setAgentSubView(sv)}
                    className={`px-3 py-2 rounded-[8px] text-[11px] font-semibold border-none cursor-pointer transition-colors ${agentSubView === sv ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-white text-[#64748b] border border-[#e2e8f0] hover:bg-[#f8fafc]'}`}>
                    {sv === 'list' ? 'All' : sv === 'add' ? 'Add Agent' : 'API Keys'}
                  </button>
                ))}
              </div>
            </div>

            {agentSubView === 'list' && (
              agents.length === 0 ? (
                <div className="bg-white border border-[#e2e8f0] rounded-[12px] py-14 text-center">
                  <div className="text-[32px] mb-2">👥</div>
                  <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                  <div className="text-[12px] text-[#64748b] mb-4">Add your first agent to start tracking performance.</div>
                  <button onClick={() => setAgentSubView('add')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">Add Agent</button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {agents.map(a => {
                    const stats = agentStats(a.agent_code);
                    return (
                      <div key={a.id} className="bg-white border border-[#e2e8f0] rounded-[12px] p-5 flex flex-wrap items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#2563eb] font-bold text-[15px] shrink-0">{a.full_name?.[0] || 'A'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[14px] text-[#0f172a]">{a.full_name}</div>
                          <div className="text-[11px] text-[#64748b]">{a.email}</div>
                        </div>
                        <div className="text-center px-3"><div className="text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</div><div className="text-[10px] text-[#94a3b8]">Code</div></div>
                        <div className="text-center px-3"><div className="text-[18px] font-black text-[#2563eb]">{stats.total}</div><div className="text-[10px] text-[#94a3b8]">Claims</div></div>
                        <div className="text-center px-3"><div className="text-[18px] font-black text-[#16a34a]">{stats.resolved}</div><div className="text-[10px] text-[#94a3b8]">Resolved</div></div>
                        <div className="text-center px-3"><div className="text-[14px] font-black text-[#d97706]">{euro(stats.revenue)}</div><div className="text-[10px] text-[#94a3b8]">Revenue</div></div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${a.status === 'active' ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fffbeb] text-[#d97706]'}`}>{a.status === 'active' ? 'Active' : 'Pending'}</span>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {agentSubView === 'add' && (
              <div className="max-w-[520px]">
                <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Full Name</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Smith" className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Email Address</label>
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@agency.com" type="email" className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Agent / Referral Code</label>
                    <input value={form.agent_code} onChange={e => setForm(f => ({ ...f, agent_code: e.target.value.toUpperCase() }))} placeholder="e.g. JS01" maxLength={12} className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] font-mono outline-none focus:border-[#2563eb]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Password</label>
                    <div className="relative">
                      <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" type={showPw ? 'text' : 'password'} className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] pr-10" />
                      <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] border-none bg-transparent cursor-pointer">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Confirm Password</label>
                    <input value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat password" type={showPw ? 'text' : 'password'} className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb]" />
                  </div>
                  {error && <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                  {success && <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f0fdf4] border border-[#86efac] rounded-[9px] text-[12px] text-[#16a34a]"><CheckCircle className="w-4 h-4 shrink-0" />{success}</div>}
                  <div className="flex gap-3 pt-1">
                    <button onClick={createAgent} disabled={saving} className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[9px] text-[13px] font-semibold border-none cursor-pointer disabled:opacity-60 transition-colors">{saving ? 'Creating...' : 'Create Agent Account'}</button>
                    <button onClick={() => { setAgentSubView('list'); setError(''); setSuccess(''); }} className="px-4 py-2.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[9px] text-[13px] font-semibold cursor-pointer hover:bg-[#f8fafc]"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            )}

            {agentSubView === 'api-keys' && (
              <div>
                {keyError && <div className="mb-4 flex items-center gap-2 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]"><AlertCircle className="w-4 h-4 shrink-0" />{keyError}</div>}
                {agents.length === 0 ? (
                  <div className="bg-white border border-[#e2e8f0] rounded-[12px] py-14 text-center">
                    <div className="text-[32px] mb-2">🔑</div>
                    <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                    <div className="text-[12px] text-[#64748b]">Add an agent first, then generate their API key.</div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {agents.map(a => {
                      const hasKey = a.has_key;
                      const rawKey = newKeys[a.id]; // only present right after generation
                      return (
                        <div key={a.id} className="bg-white border border-[#e2e8f0] rounded-[12px] p-5">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#2563eb] font-bold text-[14px] shrink-0">{a.full_name?.[0] || 'A'}</div>
                            <div className="flex-1 min-w-0"><div className="font-bold text-[14px] text-[#0f172a]">{a.full_name}</div><div className="text-[11px] text-[#64748b]">{a.email}</div></div>
                            <div className="text-center px-3"><div className="text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</div><div className="text-[10px] text-[#94a3b8]">Code</div></div>
                            {hasKey ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f0fdf4] text-[#16a34a]"><span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />Active</span> : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f1f5f9] text-[#64748b]"><span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />No key</span>}
                          </div>
                          {hasKey && (
                            <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] px-3 py-2.5">
                              <Key className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
                              {rawKey ? (
                                <>
                                  <code className="flex-1 text-[11px] font-mono text-[#0f172a] truncate">{rawKey}</code>
                                  <button onClick={() => copyKey(rawKey, a.id)} className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#94a3b8] hover:text-[#2563eb] hover:bg-white border-none bg-transparent cursor-pointer transition-colors shrink-0" title="Copy">{copiedKey === a.id ? <CheckCircle className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}</button>
                                </>
                              ) : (
                                <code className="flex-1 text-[11px] font-mono text-[#94a3b8] truncate">cv_live_•••••••••••••••• — key set (regenerate to view)</code>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={() => createApiKey(a)} disabled={keyBusy === a.id} className="flex items-center gap-1.5 px-3 py-2 bg-[#2563eb] text-white rounded-[8px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"><RefreshCw className={`w-3 h-3 ${keyBusy === a.id ? 'animate-spin' : ''}`} />{hasKey ? 'Regenerate' : 'Generate Key'}</button>
                            {hasKey && <button onClick={() => revokeApiKey(a)} disabled={keyBusy === a.id} className="flex items-center gap-1.5 px-3 py-2 bg-white text-[#dc2626] border border-[#fecaca] rounded-[8px] text-[11px] font-semibold cursor-pointer hover:bg-[#fef2f2] disabled:opacity-60 transition-colors"><Trash2 className="w-3 h-3" />Revoke</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CLAIMS ── */}
        {view === 'claims' && (
          <SalesClaims claims={claims} agentNames={agentNames} loading={loading} />
        )}

        {/* ── COMMISSIONS ── */}
        {view === 'commissions' && (
          <SalesCommissions commissions={commissions} loading={commLoading} user={user} onRefresh={loadCommissions} />
        )}

        {/* ── PERFORMANCE ── */}
        {view === 'performance' && (
          <div>
            <div className="mb-6">
              <h1 className="text-[22px] font-black text-[#0f172a]">Performance</h1>
              <p className="text-[13px] text-[#64748b] mt-1">Agent performance and win rates across your team.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Agents', value: totalAgents, icon: Users, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Team Win Rate', value: `${conversion}%`, icon: Award, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Resolved Claims', value: totalResolved, icon: CheckCircle, color: '#0891b2', bg: '#ecfeff' },
                { label: 'Revenue Generated', value: euro(revenueGenerated), icon: TrendingUp, color: '#d97706', bg: '#fffbeb' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}><Icon className="w-4 h-4" style={{ color }} /></div>
                  <div>
                    <div className="text-[18px] font-black leading-none" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-[#64748b] font-medium mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0]"><span className="font-bold text-[13px] text-[#0f172a]">Agent Performance</span></div>
              {agents.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-[#64748b]">No agents to report on.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>{['Agent', 'Code', 'Claims', 'Resolved', 'Win Rate', 'Revenue', 'Commission Rate'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {[...agents].map(a => {
                        const s = agentStats(a.agent_code);
                        const winColor = s.winRate >= 70 ? '#16a34a' : s.winRate >= 40 ? '#d97706' : '#dc2626';
                        return (
                          <tr key={a.id} className="hover:bg-[#f8fafc] transition-colors">
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{a.full_name}</td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#2563eb]">{s.total}</td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#16a34a]">{s.resolved}</td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 max-w-[80px] h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${s.winRate}%`, background: winColor }} />
                                </div>
                                <span className="text-[12px] font-bold" style={{ color: winColor }}>{s.total > 0 ? `${s.winRate}%` : '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#d97706]">{euro(s.revenue)}</td>
                            <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] text-[#64748b]">{a.commission_rate != null ? `${a.commission_rate}%` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
