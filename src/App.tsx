import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, ClaimFormData, UserProfile } from './types';
import Nav from './components/Nav';
import SEO from './components/SEO';
import { supabase } from './lib/supabase';
import CookieBanner from './components/CookieBanner';
import { LanguageProvider } from './lib/language';
import { parseUrl, buildUrl } from './lib/router';
import { type Locale } from './lib/i18n';
import type { CheckerPrefill } from './components/CompensationChecker';
// Lazy-load heavy pages for better initial bundle size / LCP
const HomePage = lazy(() => import('./pages/HomePage'));
const ClaimPage = lazy(() => import('./pages/ClaimPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LOAPage = lazy(() => import('./pages/LOAPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const FeesPage = lazy(() => import('./pages/FeesPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const SignInPage = lazy(() => import('./pages/SignInPage'));
const CompensationChecker = lazy(() => import('./components/CompensationChecker'));
const AgentDashboardPage = lazy(() => import('./pages/AgentDashboardPage'));
const SalesManagerPage = lazy(() => import('./pages/SalesManagerPage'));
const AgentSignInPage = lazy(() => import('./pages/AgentSignInPage'));
const SalesSignInPage = lazy(() => import('./pages/SalesSignInPage'));
const SeoSignInPage = lazy(() => import('./pages/SeoSignInPage'));
const PartnerPage = lazy(() => import('./pages/PartnerPage'));
const ApiDocsPage = lazy(() => import('./pages/ApiDocsPage'));
const IrelandPage = lazy(() => import('./pages/IrelandPage'));
const UKPage = lazy(() => import('./pages/UKPage'));
const ClaimSuccessPage = lazy(() => import('./pages/ClaimSuccessPage'));
const emptyForm = (): ClaimFormData => ({
  firstName: '', lastName: '', email: '', phone: '', address: '', country: 'United Kingdom', countryOther: '', dob: '',
  flight: '', fdate: '', dep: '', arr: '', airline: '', issue: '', reason: '',
});
function Loader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-[13px] text-[#64748b]">Loading...</div>
    </div>
  );
}
export default function App() {
  const { i18n } = useTranslation();
  const initial = parseUrl(window.location.pathname);
  const [page, setPage] = useState<Page>(initial.page);
  const [locale, setLocale] = useState<Locale>(initial.locale);
  const [form] = useState<ClaimFormData>(emptyForm());
  const [sigData] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [checkerOpen, setCheckerOpen] = useState(false);
  const [claimPrefill, setClaimPrefill] = useState<CheckerPrefill | undefined>(undefined);
  useEffect(() => { i18n.changeLanguage(locale); }, [locale, i18n]);
  useEffect(() => {
    const url = buildUrl(page, locale);
    if (window.location.pathname !== url) window.history.pushState({}, '', url);
  }, [page, locale]);
  useEffect(() => {
    function onPop() {
      const { locale: l, page: p } = parseUrl(window.location.pathname);
      setLocale(l);
      setPage(p);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    async function loadProfile(userId: string, email: string, fullName: string): Promise<UserProfile | null> {
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!profile) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: userId, role: 'customer', full_name: fullName || email.split('@')[0], email })
          .select()
          .single();
        profile = newProfile;
      }
      return profile as UserProfile | null;
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const profile = await loadProfile(u.id, u.email || '', u.user_metadata?.full_name || u.user_metadata?.name || '');
        if (profile) {
          setUser(profile);
          if (window.location.search.includes('signin=google')) {
            window.history.replaceState({}, '', window.location.pathname);
            handleAuth(profile);
          }
        }
      }
      setLoadingAuth(false);
    });
    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
        } else if (event === 'SIGNED_IN' && session.user) {
          const u = session.user;
          const profile = await loadProfile(u.id, u.email || '', u.user_metadata?.full_name || u.user_metadata?.name || '');
          if (profile) {
            setUser(profile);
            // Navigate after Google OAuth redirect (token in URL hash)
            if (window.location.hash.includes('access_token') || window.location.search.includes('signin=google')) {
              window.history.replaceState({}, '', window.location.pathname);
              handleAuth(profile);
            }
          }
        }
      })();
    });
  }, []);
  function nav(p: Page) { setPage(p); window.scrollTo(0, 0); }
  function handleAuth(profile: UserProfile) {
    setUser(profile);
    if (profile.role === 'admin' || profile.role === 'worker') {
      nav('admin');
    } else if (profile.role === 'agent') {
      nav('agent-dashboard');
    } else if (profile.role === 'sales_manager') {
      nav('sales-dashboard');
    } else if (profile.role === 'seo_worker') {
      nav('admin');
    } else {
      nav('dashboard');
    }
  }
  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    nav('home');
  }
  // Private portals — render without the public Nav/Chat
  if (!loadingAuth && user?.role === 'agent' && page !== 'home' && page !== 'claim') {
    return (
      <LanguageProvider>
        <Suspense fallback={<Loader />}>
          <AgentDashboardPage onNav={nav} user={user} onSignOut={handleSignOut} />
        </Suspense>
      </LanguageProvider>
    );
  }
  if (!loadingAuth && user?.role === 'sales_manager' && page !== 'home' && page !== 'claim') {
    return (
      <LanguageProvider>
        <Suspense fallback={<Loader />}>
          <SalesManagerPage onNav={nav} user={user} onSignOut={handleSignOut} />
        </Suspense>
      </LanguageProvider>
    );
  }
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-[13px] text-[#64748b]">Loading...</div>
      </div>
    );
  }
  return (
    <LanguageProvider>
      <SEO page={page} locale={locale} />
      <div className="min-h-screen bg-[#f8fafc]">
        <Nav page={page} onNav={nav} user={user} onSignOut={handleSignOut} />
        <Suspense fallback={<Loader />}>
          {checkerOpen && (
            <CompensationChecker
              onClose={() => setCheckerOpen(false)}
              onStartClaim={(prefill) => {
                setClaimPrefill(prefill);
                setCheckerOpen(false);
                nav('claim');
              }}
            />
          )}
          {page === 'home' && <HomePage onNav={nav} onCheckCompensation={() => setCheckerOpen(true)} />}
          {page === 'claim' && <ClaimPage onNav={nav} prefill={claimPrefill} />}
          {page === 'claim-success' && <ClaimSuccessPage onNav={nav} />}
          {page === 'dashboard' && <DashboardPage onNav={nav} user={user} />}
          {page === 'admin' && user && (user.role === 'admin' || user.role === 'worker' || user.role === 'seo_worker') && <AdminPage onNav={nav} user={user} onSignOut={handleSignOut} />}
          {page === 'loa' && <LOAPage onNav={nav} form={form} sigData={sigData} />}
          {page === 'about' && <AboutPage onNav={nav} />}
          {page === 'how-it-works' && <HowItWorksPage onNav={nav} />}
          {page === 'fees' && <FeesPage onNav={nav} />}
          {page === 'signin' && <SignInPage onAuth={handleAuth} onNav={nav} />}
          {page === 'agent-signin' && <AgentSignInPage onAuth={handleAuth} onNav={nav} />}
          {page === 'sales-signin' && <SalesSignInPage onAuth={handleAuth} onNav={nav} />}
          {page === 'seo-signin' && <SeoSignInPage onAuth={handleAuth} onNav={nav} />}
          {page === 'privacy' && <PrivacyPolicyPage onNav={nav} />}
          {page === 'partners' && <PartnerPage onNav={nav} />}
          {page === 'api-docs' && <ApiDocsPage onNav={nav} />}
          {page === 'ireland' && <IrelandPage onNav={nav} />}
          {page === 'united-kingdom' && <UKPage onNav={nav} />}
          {page === 'agent-dashboard' && <AgentDashboardPage onNav={nav} user={user} onSignOut={handleSignOut} />}
          {page === 'sales-dashboard' && <SalesManagerPage onNav={nav} user={user} onSignOut={handleSignOut} />}
        </Suspense>
        <CookieBanner />
      </div>
    </LanguageProvider>
  );
}
