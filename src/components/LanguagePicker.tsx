import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { LANGUAGES, flagUrl, useLang, type Language } from '../lib/language';
import { useTranslation } from 'react-i18next';
import { buildUrl } from '../lib/router';
import { type Locale } from '../lib/i18n';
import { parseUrl } from '../lib/router';

const SUGGESTED = LANGUAGES.filter(l => l.suggested);
const ALL = LANGUAGES.filter(l => !l.suggested);

function Flag({ country, size = 'w20' }: { country: string; size?: 'w20' | 'w40' }) {
  return (
    <img
      src={flagUrl(country, size)}
      alt=""
      className="rounded-sm object-cover flex-shrink-0"
      style={{ width: size === 'w40' ? 24 : 18, height: size === 'w40' ? 16 : 12 }}
    />
  );
}

export default function LanguagePicker() {
  const { lang, setLang } = useLang();
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  function pickLang(l: Language) {
    setLang(l);
    const locale = l.code as Locale;
    i18n.changeLanguage(locale);
    // Update URL to use new locale prefix while keeping current page
    const { page } = parseUrl(window.location.pathname);
    const newUrl = buildUrl(page, locale);
    window.history.pushState({}, '', newUrl);
    setOpen(false);
  }
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = btnRef.current?.contains(target);
      const inDrop = dropRef.current?.contains(target);
      if (!inBtn && !inDrop) setOpen(false);
    }
    // Use click (not mousedown) so portal button onClick fires first
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + window.scrollY + 6,
        right: window.innerWidth - r.right,
      });
    }
    setOpen(o => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-white border border-[#e2e8f0] text-[#374151] hover:border-[#2563eb] hover:bg-[#eff6ff] hover:text-[#2563eb] transition-all cursor-pointer group shadow-sm"
      >
        <Flag country={lang.country} size="w40" />
        <span className="hidden sm:inline text-[11px] font-bold max-w-[72px] truncate tracking-wide">{lang.label}</span>
        <ChevronDown className={`w-3 h-3 text-[#94a3b8] group-hover:text-[#2563eb] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'absolute', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-[360px] bg-white border border-[#e2e8f0] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Suggested */}
          <div className="px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
            <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2.5">Suggested</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SUGGESTED.map(l => (
                <button
                  key={l.code}
                  onClick={() => pickLang(l)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all border cursor-pointer text-left ${
                    lang.code === l.code
                      ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]'
                      : 'bg-[#f8fafc] border-[#e2e8f0] text-[#0f172a] hover:bg-[#f1f5f9] hover:border-[#cbd5e1]'
                  }`}
                >
                  <Flag country={l.country} size="w40" />
                  <span className="flex-1 truncate">{l.label}</span>
                  {lang.code === l.code && <Check className="w-3.5 h-3.5 flex-shrink-0 text-[#2563eb]" />}
                </button>
              ))}
            </div>
          </div>

          {/* All languages */}
          <div className="px-4 pt-3 pb-4">
            <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2.5">All Languages</div>
            <div className="grid grid-cols-2 gap-0.5 max-h-60 overflow-y-auto pr-1">
              {ALL.map(l => (
                <button
                  key={l.code}
                  onClick={() => pickLang(l)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors cursor-pointer text-left ${
                    lang.code === l.code
                      ? 'bg-[#eff6ff] text-[#1d4ed8]'
                      : 'text-[#374151] hover:bg-[#f8fafc]'
                  }`}
                >
                  <Flag country={l.country} />
                  <span className="flex-1 truncate">{l.label}</span>
                  {lang.code === l.code && <Check className="w-3 h-3 flex-shrink-0 text-[#2563eb]" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
