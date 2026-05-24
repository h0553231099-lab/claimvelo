import { useState, useEffect } from 'react';
import { Page, Claim, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { Plane, LogOut, UserPlus, TrendingUp, Users, CheckCircle, X, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface AgentRow {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  agent_code: string;
  status: string;
  created_at: string;
}

interface Props {
  onNav: (p: Page) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

type SalesView = 'overview' | 'agents' | 'add-agent';

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
      </div>
    </div>
  );
}
