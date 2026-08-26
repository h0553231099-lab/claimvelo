import { useState, useEffect } from 'react';
import { Page, Claim, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { Plane, LogOut, UserPlus, TrendingUp, Users, CheckCircle, X, Eye, EyeOff, AlertCircle, Key, Copy, RefreshCw, Trash2 } from 'lucide-react';

interface AgentRow {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  agent_code: string;
  status: string;
  api_key: string | null;
  created_at: string;
}

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

type SalesView = 'overview' | 'agents' | 'add-agent' | 'api-keys';

export default function SalesManagerPage({ onNav, user, onSignOut }: Props) {
  const [view, setView] = useState<SalesView>('overview');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  // New agent form
  const [form, setForm] = useState({ email: '', full_name: '', agent_code: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState<string | null>(null);
  const [keyError, setKeyError] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [user]);

  async function loadData() {
    if (!user) return;
    setLoading(true);

    // Load agents belonging to this manager
    const { data: agentData } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('manager_id', user.id)
      .order('created_at', { ascending: false });

    const myAgents = (agentData || []) as AgentRow[];
    setAgents(myAgents);

    // Load all claims for those agents
    if (myAgents.length > 0) {
      const codes = myAgents.map(a => a.agent_code).filter(Boolean);
      if (codes.length > 0) {
        const { data: claimData } = await supabase
          .from('claims')
          .select('*')
          .in('agent', codes)
          .order('created_at', { ascending: false });
        setClaims((claimData || []) as Claim[]);
      }
    }

    setLoading(false);
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

    // 1. Create Supabase auth user
    const { data: authData, error: authErr } = await supabase.auth.admin
      ? // Prefer admin API if available (edge function would handle this in production)
        { data: null, error: new Error('Use admin panel to create auth users') }
      : { data: null, error: new Error('Use admin panel to create auth users') };

    // Since we can't call auth.admin directly from the client, we use signUp
    // and immediately update the profile role. In production use an edge function.
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.full_name.trim(), role: 'agent' },
      },
    });

    void authData; void authErr;

    if (signUpErr) {
      setError(signUpErr.message);
      setSaving(false);
      return;
    }

    const newUserId = signUpData?.user?.id;

    // 2. Upsert profile with agent role
    if (newUserId) {
      await supabase.from('profiles').upsert({
        id: newUserId,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role: 'agent',
      });
    }

    // 3. Insert worker_profile linked to this manager
    const { error: wpErr } = await supabase.from('worker_profiles').insert({
      user_id: newUserId || null,
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      role: 'agent',
      status: 'active',
      agent_code: form.agent_code.trim().toUpperCase(),
      manager_id: user?.id,
    });

    if (wpErr) {
      setError(wpErr.message);
      setSaving(false);
      return;
    }

    setSuccess(`Agent ${form.full_name} created with code ${form.agent_code.toUpperCase()}.`);
    setForm({ email: '', full_name: '', agent_code: '', password: '', confirm: '' });
    setSaving(false);
    await loadData();
    setTimeout(() => setView('agents'), 1500);
  }

  function generateApiKey(agent: AgentRow): string {
    const slug = agent.full_name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const rand = Math.random().toString(36).slice(2, 8);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `cv_live_${slug}_${rand}${suffix}`;
  }

  async function createApiKey(agent: AgentRow) {
    setKeyError('');
    setKeyBusy(agent.id);
    const newKey = generateApiKey(agent);
    const { error } = await supabase
      .from('worker_profiles')
      .update({ api_key: newKey })
      .eq('id', agent.id);
    if (error) {
      setKeyError(error.message);
      setKeyBusy(null);
      return;
    }
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, api_key: newKey } : a));
    setRevealedKeys(prev => new Set(prev).add(agent.id));
    setKeyBusy(null);
  }

  async function revokeApiKey(agent: AgentRow) {
    if (!confirm(`Revoke API key for ${agent.full_name}? This will immediately disable their API access.`)) return;
    setKeyBusy(agent.id);
    const { error } = await supabase
      .from('worker_profiles')
      .update({ api_key: null })
      .eq('id', agent.id);
    if (error) {
      setKeyError(error.message);
      setKeyBusy(null);
      return;
    }
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, api_key: null } : a));
    setRevealedKeys(prev => { const next = new Set(prev); next.delete(agent.id); return next; });
    setKeyBusy(null);
  }

  async function copyKey(key: string, agentId: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(agentId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch { /* clipboard not available */ }
  }

  function maskKey(key: string): string {
    if (key.length <= 12) return key.slice(0, 4) + '••••';
    return key.slice(0, 8) + '••••••••••••' + key.slice(-4);
  }

  function toggleReveal(agentId: string) {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  // Per-agent stats
  function agentStats(code: string) {
    const ac = claims.filter(c => c.agent === code);
    const resolved = ac.filter(c => c.status === 'Resolved').length;
    const totalVal = ac
      .filter(c => c.status === 'Resolved')
      .reduce((s, c) => s + parseFloat(c.amount?.replace(/[^0-9.]/g, '') || '0'), 0);
    return { total: ac.length, resolved, totalVal };
  }

  const totalClaims = claims.length;
  const totalResolved = claims.filter(c => c.status === 'Resolved').length;
  const totalRevenue = claims.filter(c => c.status === 'Resolved').reduce((s, c) => s + parseFloat(c.amount?.replace(/[^0-9.]/g, '') || '0'), 0);

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
        <span className="text-[12px] font-semibold text-[#64748b]">Sales Manager Portal</span>

        {/* Nav tabs */}
        <div className="flex items-center gap-1 ml-4">
          {([
            ['overview', 'Overview'],
            ['agents', 'My Agents'],
            ['add-agent', 'Add Agent'],
            ['api-keys', 'API Keys'],
          ] as [SalesView, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-[7px] text-[11px] font-semibold border-none cursor-pointer transition-colors ${
                view === v ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f0fdf4] rounded-[7px]">
            <div className="w-6 h-6 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-[10px] font-bold">
              {user?.full_name?.[0] || 'M'}
            </div>
            <span className="text-[11px] font-semibold text-[#0f172a]">{user?.full_name || 'Manager'}</span>
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

      <div className="max-w-[960px] mx-auto px-5 py-8">
        {/* OVERVIEW */}
        {view === 'overview' && (
          <div>
            <div className="mb-7">
              <h1 className="text-[22px] font-black text-[#0f172a]">Sales Overview</h1>
              <p className="text-[13px] text-[#64748b] mt-1">Performance summary across all your agents</p>
            </div>

            {/* Top stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
              {[
                { label: 'Total Agents', value: agents.length, icon: Users, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Total Claims', value: totalClaims, icon: Plane, color: '#0891b2', bg: '#ecfeff' },
                { label: 'Resolved', value: totalResolved, icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Revenue Generated', value: `€${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: '#d97706', bg: '#fffbeb' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-[20px] font-black leading-none" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-[#64748b] font-medium mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Per-agent leaderboard */}
            <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e8f0]">
                <span className="font-bold text-[13px] text-[#0f172a]">Agent Leaderboard</span>
              </div>
              {loading ? (
                <div className="py-10 text-center text-[13px] text-[#64748b]">Loading...</div>
              ) : agents.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-[28px] mb-2">👥</div>
                  <div className="text-[13px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                  <button onClick={() => setView('add-agent')} className="mt-2 px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">
                    Add your first agent
                  </button>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Rank', 'Agent', 'Code', 'Status', 'Claims', 'Resolved', 'Revenue', 'Win Rate'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...agents]
                      .map(a => ({ ...a, ...agentStats(a.agent_code) }))
                      .sort((a, b) => b.resolved - a.resolved)
                      .map((a, i) => (
                        <tr key={a.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#94a3b8]">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{a.full_name}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0]">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === 'active' ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fffbeb] text-[#d97706]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'active' ? 'bg-[#16a34a]' : 'bg-[#d97706]'}`} />
                              {a.status === 'active' ? 'Active' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#2563eb]">{a.total}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[13px] font-bold text-[#16a34a]">{a.resolved}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#d97706]">€{a.totalVal.toLocaleString()}</td>
                          <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] text-[#64748b]">
                            {a.total > 0 ? Math.round((a.resolved / a.total) * 100) + '%' : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* AGENTS LIST */}
        {view === 'agents' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-[22px] font-black text-[#0f172a]">My Agents</h1>
                <p className="text-[13px] text-[#64748b] mt-1">{agents.length} agent{agents.length !== 1 ? 's' : ''} in your team</p>
              </div>
              <button
                onClick={() => setView('add-agent')}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#2563eb] text-white rounded-[9px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] transition-colors"
              >
                <UserPlus className="w-4 h-4" /> Add Agent
              </button>
            </div>

            {agents.length === 0 ? (
              <div className="bg-white border border-[#e2e8f0] rounded-[12px] py-14 text-center">
                <div className="text-[32px] mb-2">👥</div>
                <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                <div className="text-[12px] text-[#64748b] mb-4">Add your first agent to start tracking performance.</div>
                <button onClick={() => setView('add-agent')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">
                  Add Agent
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {agents.map(a => {
                  const stats = agentStats(a.agent_code);
                  return (
                    <div key={a.id} className="bg-white border border-[#e2e8f0] rounded-[12px] p-5 flex items-center gap-5">
                      <div className="w-11 h-11 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#2563eb] font-bold text-[15px] shrink-0">
                        {a.full_name?.[0] || 'A'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[14px] text-[#0f172a]">{a.full_name}</div>
                        <div className="text-[11px] text-[#64748b]">{a.email}</div>
                      </div>
                      <div className="text-center px-4">
                        <div className="text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</div>
                        <div className="text-[10px] text-[#94a3b8]">Code</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-[18px] font-black text-[#2563eb]">{stats.total}</div>
                        <div className="text-[10px] text-[#94a3b8]">Claims</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-[18px] font-black text-[#16a34a]">{stats.resolved}</div>
                        <div className="text-[10px] text-[#94a3b8]">Resolved</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-[16px] font-black text-[#d97706]">€{stats.totalVal.toLocaleString()}</div>
                        <div className="text-[10px] text-[#94a3b8]">Revenue</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${a.status === 'active' ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fffbeb] text-[#d97706]'}`}>
                        {a.status === 'active' ? 'Active' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ADD AGENT */}
        {view === 'add-agent' && (
          <div className="max-w-[520px]">
            <div className="mb-6">
              <h1 className="text-[22px] font-black text-[#0f172a]">Add New Agent</h1>
              <p className="text-[13px] text-[#64748b] mt-1">Create a sign-in account for a new field agent.</p>
            </div>

            <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-6">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jane@agency.com"
                    type="email"
                    className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">
                    Agent / Referral Code
                    <span className="ml-1.5 text-[#94a3b8] font-normal normal-case">Used to track claims from this agent</span>
                  </label>
                  <input
                    value={form.agent_code}
                    onChange={e => setForm(f => ({ ...f, agent_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. JS01"
                    maxLength={12}
                    className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] font-mono outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 8 characters"
                      type={showPw ? 'text' : 'password'}
                      className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] border-none bg-transparent cursor-pointer"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <input
                    value={form.confirm}
                    onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                    placeholder="Repeat password"
                    type={showPw ? 'text' : 'password'}
                    className="w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f0fdf4] border border-[#86efac] rounded-[9px] text-[12px] text-[#16a34a]">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {success}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={createAgent}
                    disabled={saving}
                    className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[9px] text-[13px] font-semibold border-none cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {saving ? 'Creating...' : 'Create Agent Account'}
                  </button>
                  <button
                    onClick={() => { setView('agents'); setError(''); setSuccess(''); }}
                    className="px-4 py-2.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[9px] text-[13px] font-semibold cursor-pointer hover:bg-[#f8fafc] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 px-4 py-3 bg-[#fffbeb] border border-[#fcd34d] rounded-[9px] text-[11px] text-[#92400e]">
              <strong>Note:</strong> The agent will receive a sign-in confirmation email. They use the email and password you set here to access their Agent Portal.
            </div>
          </div>
        )}

        {/* API KEYS */}
        {view === 'api-keys' && (
          <div>
            <div className="mb-6">
              <h1 className="text-[22px] font-black text-[#0f172a] flex items-center gap-2">
                <Key className="w-5 h-5 text-[#2563eb]" /> API Keys
              </h1>
              <p className="text-[13px] text-[#64748b] mt-1">
                Generate Bearer tokens so your agents can submit leads programmatically via the B2B API.
              </p>
            </div>

            {keyError && (
              <div className="mb-4 flex items-center gap-2 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {keyError}
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-[13px] text-[#64748b]">Loading...</div>
            ) : agents.length === 0 ? (
              <div className="bg-white border border-[#e2e8f0] rounded-[12px] py-14 text-center">
                <div className="text-[32px] mb-2">🔑</div>
                <div className="text-[14px] font-semibold text-[#0f172a] mb-1">No agents yet</div>
                <div className="text-[12px] text-[#64748b]">Add an agent first, then generate their API key here.</div>
                <button onClick={() => setView('add-agent')} className="mt-4 px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">
                  Add Agent
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {agents.map(a => {
                  const hasKey = !!a.api_key;
                  const revealed = revealedKeys.has(a.id);
                  return (
                    <div key={a.id} className="bg-white border border-[#e2e8f0] rounded-[12px] p-5">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#2563eb] font-bold text-[14px] shrink-0">
                          {a.full_name?.[0] || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[14px] text-[#0f172a]">{a.full_name}</div>
                          <div className="text-[11px] text-[#64748b]">{a.email}</div>
                        </div>
                        <div className="text-center px-3">
                          <div className="text-[11px] font-mono font-bold text-[#2563eb]">{a.agent_code}</div>
                          <div className="text-[10px] text-[#94a3b8]">Code</div>
                        </div>
                        {hasKey ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f0fdf4] text-[#16a34a]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f1f5f9] text-[#64748b]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" /> No key
                          </span>
                        )}
                      </div>

                      {hasKey && (
                        <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] px-3 py-2.5">
                          <Key className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
                          <code className="flex-1 text-[11px] font-mono text-[#0f172a] truncate">
                            {revealed ? a.api_key : maskKey(a.api_key!)}
                          </code>
                          <button
                            onClick={() => toggleReveal(a.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#94a3b8] hover:text-[#64748b] hover:bg-white border-none bg-transparent cursor-pointer transition-colors shrink-0"
                            title={revealed ? 'Hide' : 'Reveal'}
                          >
                            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => copyKey(a.api_key!, a.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#94a3b8] hover:text-[#2563eb] hover:bg-white border-none bg-transparent cursor-pointer transition-colors shrink-0"
                            title="Copy"
                          >
                            {copiedKey === a.id ? <CheckCircle className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => createApiKey(a)}
                          disabled={keyBusy === a.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#2563eb] text-white rounded-[8px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${keyBusy === a.id ? 'animate-spin' : ''}`} />
                          {hasKey ? 'Regenerate' : 'Generate Key'}
                        </button>
                        {hasKey && (
                          <button
                            onClick={() => revokeApiKey(a)}
                            disabled={keyBusy === a.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white text-[#dc2626] border border-[#fecaca] rounded-[8px] text-[11px] font-semibold cursor-pointer hover:bg-[#fef2f2] disabled:opacity-60 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 px-4 py-3.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-[10px]">
              <div className="text-[12px] font-bold text-[#2563eb] mb-1">B2B API Endpoint</div>
              <div className="text-[11px] text-[#475569] mb-2">
                Agents send leads to this URL with their API key in the Authorization header:
              </div>
              <code className="block bg-white border border-[#e2e8f0] rounded-[7px] px-3 py-2 text-[11px] font-mono text-[#0f172a] overflow-x-auto">
                POST /functions/v1/b2b-api/api/v1/leads<br />
                Authorization: Bearer &lt;AGENT_API_KEY&gt;
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
