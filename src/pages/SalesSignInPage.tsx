import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, Page } from '../types';
import { BarChart2, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';

interface Props {
  onAuth: (profile: UserProfile) => void;
  onNav: (p: Page) => void;
}

type View = 'signin' | 'set-password';

export default function SalesSignInPage({ onAuth, onNav }: Props) {
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

    if (signInErr || !data.user) {
      setError(signInErr?.message || 'Invalid email or password');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      setError('Account not found. Please contact your administrator.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    if (profile.role !== 'sales_manager' && profile.role !== 'admin') {
      setError('This portal is for Sales Managers only.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const createdAt = new Date(data.user.created_at);
    const lastSignIn = data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at) : null;
    const isFirstLogin = !lastSignIn || (lastSignIn.getTime() - createdAt.getTime() < 5000);

    setLoading(false);

    if (isFirstLogin) {
      setPendingProfile(profile as UserProfile);
      setView('set-password');
    } else {
      onAuth(profile as UserProfile);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    if (pendingProfile) onAuth(pendingProfile);
  }

  async function handleGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/sales-signin` },
    });
    if (error) setError(error.message);
  }

  if (view === 'set-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] px-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-[#0369a1] rounded-xl flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-[#0f172a] font-extrabold text-[17px]">ClaimVelo</span>
          </div>

          <div className="mb-6">
            <div className="text-[22px] font-extrabold text-[#0f172a] mb-1.5">Set your password</div>
            <div className="text-[13px] text-[#64748b]">
              Welcome! Choose a secure password to replace your temporary one.
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-7">
            <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    autoFocus
                    className="w-full pl-9 pr-9 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0369a1] transition-colors bg-[#f8fafc] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] bg-transparent border-none cursor-pointer p-0 transition-colors"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="w-full pl-9 pr-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0369a1] transition-colors bg-[#f8fafc] focus:bg-white"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[12px] rounded-lg px-3 py-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-[13px] text-white border-none cursor-pointer transition-all disabled:opacity-60 bg-[#0369a1] hover:bg-[#075985] mt-1"
              >
                {loading ? 'Saving...' : 'Set Password & Enter Portal'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#0c1a2e] px-10 py-12">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 bg-[#0369a1] rounded-xl flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-extrabold text-[17px] tracking-tight">ClaimVelo</span>
          </div>

          <div className="text-white text-[28px] font-extrabold leading-tight mb-4">
            Sales Manager Portal
          </div>
          <div className="text-[#94a3b8] text-[14px] leading-relaxed mb-10">
            Manage your agents, track performance, and monitor your team's claims in one place.
          </div>

          <div className="space-y-4">
            {[
              { label: 'Team overview', desc: 'See all agents under your account.' },
              { label: 'Performance tracking', desc: 'Monitor claims and earnings per agent.' },
              { label: 'Pipeline visibility', desc: 'Live status on every claim in your pipeline.' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#0369a1] flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
                <div>
                  <div className="text-white text-[13px] font-semibold">{item.label}</div>
                  <div className="text-[#64748b] text-[12px]">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[#334155] text-[11px]">
          ClaimVelo Ltd. · Sales Manager Portal
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#f8fafc] px-6 py-12">
        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-[#0369a1] rounded-xl flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-[#0f172a] font-extrabold text-[17px]">ClaimVelo</span>
          </div>

          <div className="mb-7">
            <div className="text-[24px] font-extrabold text-[#0f172a] mb-1.5">Sales Manager sign in</div>
            <div className="text-[13px] text-[#64748b]">
              Your account is created by the ClaimVelo admin team.
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-7">
            {/* Google sign-in */}
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] font-semibold text-[#0f172a] bg-white hover:bg-[#f8fafc] transition-colors cursor-pointer mb-4"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#e2e8f0]" />
              <span className="text-[11px] text-[#94a3b8] font-medium">or</span>
              <div className="flex-1 h-px bg-[#e2e8f0]" />
            </div>

            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0369a1] transition-colors bg-[#f8fafc] focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-9 pr-9 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0369a1] transition-colors bg-[#f8fafc] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] bg-transparent border-none cursor-pointer p-0 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[12px] rounded-lg px-3 py-2.5 leading-relaxed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-[13px] text-white border-none cursor-pointer transition-all disabled:opacity-60 bg-[#0369a1] hover:bg-[#075985] active:scale-[0.98] mt-1"
              >
                {loading ? 'Signing in...' : 'Sign In to Sales Portal'}
              </button>
            </form>
          </div>

          <div className="mt-6 flex items-center justify-between text-[12px] text-[#94a3b8]">
            <button
              onClick={() => onNav('home')}
              className="flex items-center gap-1.5 hover:text-[#64748b] bg-transparent border-none cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to website
            </button>
            <button
              onClick={() => onNav('agent-signin')}
              className="hover:text-[#64748b] bg-transparent border-none cursor-pointer transition-colors"
            >
              Agent sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
