import { useState } from 'react';
import { Page, UserProfile } from '../types';
import { Plane, LogIn, LogOut, User, Menu, X } from 'lucide-react';
import { useLang } from '../lib/language';

interface NavProps {
  page: Page;
  onNav: (p: Page) => void;
  user?: UserProfile | null;
  onSignOut?: () => void;
}

export default function Nav({ page, onNav, user, onSignOut }: NavProps) {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);

  const roleLabel = user
    ? user.role === 'admin' ? 'Admin' : user.role === 'worker' ? 'Worker' : 'Passenger'
    : null;

  const roleColor = user
    ? user.role === 'admin' ? '#b45309' : user.role === 'worker' ? '#16a34a' : '#2563eb'
    : '#2563eb';

  const roleBg = user
    ? user.role === 'admin' ? '#fffbeb' : user.role === 'worker' ? '#f0fdf4' : '#eff6ff'
    : '#eff6ff';

  const navLinks = [
    { id: 'home' as Page, label: t('nav.home') },
    { id: 'about' as Page, label: t('nav.about') },
    { id: 'how-it-works' as Page, label: t('nav.how') },
    { id: 'fees' as Page, label: t('nav.fees') },
    { id: 'partners' as Page, label: 'B2B Partners' },
    { id: 'claim' as Page, label: t('nav.claim') },
  ];

  function handleNav(p: Page) {
    onNav(p);
    setMenuOpen(false);
  }

  return (
    <>
      <nav className="bg-white border-b border-[#e2e8f0] h-[58px] flex items-center px-4 gap-1.5 sticky top-0 z-[200]">
        {/* Logo */}
        <button
          onClick={() => handleNav('home')}
          className="font-extrabold text-base text-[#2563eb] flex items-center gap-2 cursor-pointer mr-1 shrink-0 border-none bg-transparent"
        >
          <div className="w-[30px] h-[30px] bg-[#2563eb] rounded-[7px] text-white flex items-center justify-center">
            <Plane className="w-4 h-4" />
          </div>
          ClaimVelo
        </button>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-0.5">
          <div className="w-px h-6 bg-[#e2e8f0] mx-1.5 shrink-0" />
          {navLinks.map(l => (
            <button
              key={l.id}
              onClick={() => handleNav(l.id)}
              className={`px-[11px] py-[5px] rounded-[7px] text-xs font-medium whitespace-nowrap border-none cursor-pointer transition-colors ${
                page === l.id
                  ? 'bg-[#eff6ff] text-[#2563eb]'
                  : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
              }`}
            >
              {l.label}
            </button>
          ))}

          {(!user || user.role === 'customer') && (
            <button
              onClick={() => handleNav('dashboard')}
              className={`px-[11px] py-[5px] rounded-[7px] text-xs font-medium whitespace-nowrap border-none cursor-pointer transition-colors ${
                page === 'dashboard'
                  ? 'bg-[#eff6ff] text-[#2563eb]'
                  : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
              }`}
            >
              {t('nav.myclaims')}
            </button>
          )}

          {user && (user.role === 'admin' || user.role === 'worker') && (
            <button
              onClick={() => handleNav('admin')}
              className={`px-[11px] py-[5px] rounded-[7px] text-xs font-medium whitespace-nowrap border-none cursor-pointer transition-colors ${
                page === 'admin'
                  ? 'bg-[#eff6ff] text-[#2563eb]'
                  : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
              }`}
            >
              {user.role === 'admin' ? 'Admin CRM' : 'Worker Portal'}
            </button>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Desktop user / sign in */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] text-[11px] font-semibold" style={{ background: roleBg, color: roleColor }}>
                  <User className="w-3 h-3" />
                  {user.full_name || user.email}
                  <span className="opacity-60">·</span>
                  {roleLabel}
                </div>
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="w-7 h-7 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => handleNav('signin')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[7px] text-[11px] font-semibold border-none cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" /> {t('nav.signin')}
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] cursor-pointer transition-colors hover:bg-[#eff6ff] hover:text-[#2563eb]"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden fixed top-[58px] left-0 right-0 z-[199] bg-white border-b border-[#e2e8f0] shadow-lg max-h-[calc(100dvh-58px)] overflow-y-auto">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navLinks.map(l => (
              <button
                key={l.id}
                onClick={() => handleNav(l.id)}
                className={`px-4 py-2.5 rounded-[8px] text-[13px] font-medium text-left border-none cursor-pointer transition-colors ${
                  page === l.id
                    ? 'bg-[#eff6ff] text-[#2563eb] font-semibold'
                    : 'bg-transparent text-[#374151] hover:bg-[#f8fafc]'
                }`}
              >
                {l.label}
              </button>
            ))}

            {(!user || user.role === 'customer') && (
              <button
                onClick={() => handleNav('dashboard')}
                className={`px-4 py-2.5 rounded-[8px] text-[13px] font-medium text-left border-none cursor-pointer transition-colors ${
                  page === 'dashboard'
                    ? 'bg-[#eff6ff] text-[#2563eb] font-semibold'
                    : 'bg-transparent text-[#374151] hover:bg-[#f8fafc]'
                }`}
              >
                {t('nav.myclaims')}
              </button>
            )}

            {user && (user.role === 'admin' || user.role === 'worker') && (
              <button
                onClick={() => handleNav('admin')}
                className={`px-4 py-2.5 rounded-[8px] text-[13px] font-medium text-left border-none cursor-pointer transition-colors ${
                  page === 'admin'
                    ? 'bg-[#eff6ff] text-[#2563eb] font-semibold'
                    : 'bg-transparent text-[#374151] hover:bg-[#f8fafc]'
                }`}
              >
                {user.role === 'admin' ? 'Admin CRM' : 'Worker Portal'}
              </button>
            )}

            <div className="h-px bg-[#e2e8f0] my-1" />

            {user ? (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: roleColor }}>
                  <User className="w-3.5 h-3.5" />
                  {user.full_name || user.email}
                  <span className="opacity-50">· {roleLabel}</span>
                </div>
                <button
                  onClick={() => { onSignOut?.(); setMenuOpen(false); }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-[#dc2626] bg-transparent border-none cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleNav('signin')}
                className="flex items-center justify-center gap-2 mx-1 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[8px] text-[13px] font-semibold border-none cursor-pointer transition-colors"
              >
                <LogIn className="w-4 h-4" /> {t('nav.signin')}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
