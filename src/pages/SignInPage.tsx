import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, Page } from '../types';
import { Plane, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

interface Props {
  onAuth: (profile: UserProfile) => void;
  onNav: (p: Page) => void;
}

export default function SignInPage({ onAuth, onNav }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setGoogleLoading(false);
  }, []);

  // Safety: reset Google button after 8s in case redirect never fires
  useEffect(() => {
    if (!googleLoading) return;
    const t = setTimeout(() => setGoogleLoading(false), 8000);
    return () => clearTimeout(t);
  }, [googleLoading]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError('');
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/?signin=google' },
      });
      if (oauthErr) {
        setError(oauthErr.message);
        setGoogleLoading(false);
      }
      // If no error, the browser is redirecting — loading state stays until navigation
    } catch {
      setError('Google sign-in is not available. Please use email and password.');
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isRegister) {
      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
      if (signUpErr || !data.user) {
        setError(signUpErr?.message || 'Registration failed');
        setLoading(false);
        return;
      }
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        role: 'customer',
        full_name: fullName,
        email,
      });
      if (profileErr) {
        setError(profileErr.message);
        setLoading(false);
        return;
      }
      onAuth({ id: data.user.id, role: 'customer', full_name: fullName, email });
    } else {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr || !data.user) {
        setError(signInErr?.message || 'Invalid email or password');
        setLoading(false);
        return;
      }
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      if (!profile) {
        const { data: newProfile, error: profileErr } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, role: 'customer', full_name: data.user.email?.split('@')[0] || '', email: data.user.email || '' })
          .select()
          .single();
        if (profileErr || !newProfile) {
          setError('Failed to load account. Please try again.');
          setLoading(false);
          return;
        }
        profile = newProfile;
      }
      onAuth(profile as UserProfile);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-58px)] flex items-center justify-center bg-gradient-to-br from-[#f0f4ff] via-[#f8fafc] to-[#e8f5e9] px-4">
      <div className="w-full max-w-[420px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#2563eb] rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <div className="text-2xl font-extrabold text-[#0f172a]">ClaimVelo</div>
          <div className="text-[13px] text-[#64748b] mt-1">Flight Compensation Specialists</div>
        </div>

        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden">
          <div className="px-7 pt-6 pb-2 border-b border-[#e2e8f0]">
            <div className="text-[17px] font-bold text-[#0f172a] mb-1">
              {isRegister ? 'Create an account' : 'Welcome back'}
            </div>
            <div className="text-[13px] text-[#64748b] mb-4">
              {isRegister ? 'Register as a passenger to track your claims' : 'Sign in to continue'}
            </div>
          </div>

          <div className="px-7 pt-5 pb-0">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border-[1.5px] border-[#e2e8f0] bg-white text-[13px] font-semibold text-[#0f172a] hover:bg-[#f8fafc] transition-colors disabled:opacity-60 cursor-pointer"
            >
              <GoogleIcon />
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>
            <div className="flex items-center gap-3 mt-4 mb-1">
              <div className="flex-1 h-px bg-[#e2e8f0]" />
              <span className="text-[11px] text-[#94a3b8] font-medium">or</span>
              <div className="flex-1 h-px bg-[#e2e8f0]" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-7 py-5 flex flex-col gap-3.5">
            {isRegister && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                    className="w-full pl-9 pr-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] transition-colors"
                  />
                </div>
              </div>
            )}

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
                  className="w-full pl-9 pr-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] transition-colors"
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
                  className="w-full pl-9 pr-9 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors bg-transparent border-none cursor-pointer p-0"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
              className="w-full py-2.5 rounded-lg font-semibold text-[13px] text-white border-none cursor-pointer transition-opacity disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8]"
            >
              {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
            </button>

            <div className="text-center text-[12px] text-[#64748b]">
              {isRegister ? (
                <>Already have an account?{' '}
                  <button type="button" onClick={() => { setIsRegister(false); setError(''); }} className="text-[#2563eb] font-semibold hover:underline cursor-pointer bg-transparent border-none">
                    Sign in
                  </button>
                </>
              ) : (
                <>New passenger?{' '}
                  <button type="button" onClick={() => { setIsRegister(true); setError(''); }} className="text-[#2563eb] font-semibold hover:underline cursor-pointer bg-transparent border-none">
                    Create account
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        <div className="text-center mt-5 text-[11px] text-[#94a3b8]">
          <button onClick={() => onNav('home')} className="hover:text-[#64748b] cursor-pointer bg-transparent border-none transition-colors">
            ← Back to website
          </button>
        </div>
      </div>
    </div>
  );
}
