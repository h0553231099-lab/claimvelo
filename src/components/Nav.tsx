import { Page, UserProfile } from '../types';
import { Plane, LogIn, LogOut, User } from 'lucide-react';
import LanguagePicker from './LanguagePicker';
import { useLang } from '../lib/language';

interface NavProps {
  page: Page;
  onNav: (p: Page) => void;
  user?: UserProfile | null;
  onSignOut?: () => void;
}

export default function Nav({ page, onNav, user, onSignOut }: NavProps) {
  const { t } = useLang();
  const roleLabel = user
    ? user.role === 'admin' ? 'Admin' : user.role === 'worker' ? 'Worker' : 'Passenger'
    : null;

  const roleColor = user
    ? user.role === 'admin' ? '#b45309' : user.role === 'worker' ? '#16a34a' : '#2563eb'
    : '#2563eb';

  const roleBg = user
    ? user.role === 'admin' ? '#fffbeb' : user.role === 'worker' ? '#f0fdf4' : '#eff6ff'
    : '#eff6ff';

  return (
    <nav className="bg-white border-b border-[#e2e8f0] h-[58px] flex items-center px-5 gap-1.5 sticky top-0 z-[200] overflow-x-auto">
      <button
        onClick={() => onNav('home')}
        className="font-extrabold text-base text-[#2563eb] flex items-center gap-2 cursor-pointer mr-1 shrink-0 border-none bg-transparent"
      >
        <div className="w-[30px] h-[30px] bg-[#2563eb] rounded-[7px] text-white flex items-center justify-center">
          <Plane className="w-4 h-4" />
        </div>
        ClaimVelo
      </button>
      <div className="w-px h-6 bg-[#e2e8f0] mx-1.5 shrink-0" />

      {[
        { id: 'home' as Page, label: t('nav.home') },
        { id: 'about' as Page, label: t('nav.about') },
        { id: 'how-it-works' as Page, label: t('nav.how') },
        { id: 'fees' as Page, label: t('nav.fees') },
        { id: 'claim' as Page, label: t('nav.claim') },
      ].map(l => (
        <button
          key={l.id}
          onClick={() => onNav(l.id)}
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
          onClick={() => onNav('dashboard')}
          className={`px-[11px] py-[5px] rounded-[7px] text-xs font-medium whitespace-nowrap border-none cursor-pointer transition-colors ${
            page === 'dashboard'
              ? 'bg-[#eff6ff] text-[#2563eb]'
              : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
          }`}
        >
          {t('nav.myclaims')}
        </button>
      )}

      {/* Admin / Worker CRM link */}
      {user && (user.role === 'admin' || user.role === 'worker') && (
        <button
          onClick={() => onNav('admin')}
          className={`px-[11px] py-[5px] rounded-[7px] text-xs font-medium whitespace-nowrap border-none cursor-pointer transition-colors ${
            page === 'admin'
              ? 'bg-[#eff6ff] text-[#2563eb]'
              : 'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
          }`}
        >
          {user.role === 'admin' ? 'Admin CRM' : 'Worker Portal'}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        <LanguagePicker />
        {user ? (
          <div className="flex items-center gap-2">
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
          </div>
        ) : (
          <button
            onClick={() => onNav('signin')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[7px] text-[11px] font-semibold border-none cursor-pointer transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> {t('nav.signin')}
          </button>
        )}
      </div>
    </nav>
  );
}
