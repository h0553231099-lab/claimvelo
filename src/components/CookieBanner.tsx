import { useState, useEffect } from 'react';
import { X, Cookie, ChevronUp, ChevronDown } from 'lucide-react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) setVisible(true);
  }, []);

  function acceptAll() {
    localStorage.setItem('cookie_consent', 'all');
    setVisible(false);
  }

  function acceptNecessary() {
    localStorage.setItem('cookie_consent', 'necessary');
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem('cookie_consent', 'dismissed');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-[#0f172a] border-t border-[#1e293b] shadow-2xl">
        {/* Compact bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-xl mx-auto">
          <Cookie className="w-4 h-4 text-[#60a5fa] shrink-0" />
          <p className="text-[12px] text-[#94a3b8] flex-1 leading-tight">
            We use cookies to improve your experience.{' '}
            <button
              onClick={() => setShowDetails(d => !d)}
              className="text-[#60a5fa] font-semibold hover:underline bg-transparent border-none cursor-pointer text-[12px] inline-flex items-center gap-0.5"
            >
              {showDetails ? 'Less' : 'Details'}
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={acceptNecessary}
              className="px-3 py-1.5 text-[11px] font-semibold text-[#94a3b8] hover:text-white bg-transparent border border-[#334155] hover:border-[#475569] rounded-lg transition-colors cursor-pointer"
            >
              Necessary
            </button>
            <button
              onClick={acceptAll}
              className="px-3 py-1.5 text-[11px] font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg transition-colors cursor-pointer border-none"
            >
              Allow all
            </button>
            <button
              onClick={dismiss}
              className="text-[#475569] hover:text-[#94a3b8] transition-colors bg-transparent border-none cursor-pointer p-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expandable details */}
        {showDetails && (
          <div className="border-t border-[#1e293b] px-4 py-3 max-w-screen-xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: 'Necessary', desc: 'Required for the website to function. Cannot be disabled.', always: true },
                { label: 'Analytics', desc: 'Help us understand how visitors interact with our website.', always: false },
                { label: 'Preferences', desc: 'Allow the website to remember your settings and preferences.', always: false },
              ].map(({ label, desc, always }) => (
                <div key={label} className="bg-[#1e293b] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-white">{label}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${always ? 'bg-[#14532d] text-[#4ade80]' : 'bg-[#1e3a8a] text-[#93c5fd]'}`}>
                      {always ? 'Always on' : 'Optional'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748b] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
