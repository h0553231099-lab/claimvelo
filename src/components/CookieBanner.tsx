import { useState, useEffect } from 'react';
import { X, Cookie } from 'lucide-react';

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
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto bg-white border border-[#e2e8f0] rounded-2xl shadow-2xl">
        <div className="flex items-start gap-4 p-5 md:p-6">
          <div className="w-10 h-10 bg-[#eff6ff] rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Cookie className="w-5 h-5 text-[#2563eb]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#0f172a] mb-1">This website uses cookies</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed">
                  We use cookies to enhance your experience, analyse site traffic, and personalise content.
                  By clicking "Allow all", you consent to our use of cookies.{' '}
                  <button
                    onClick={() => setShowDetails(d => !d)}
                    className="text-[#2563eb] font-medium hover:underline bg-transparent border-none cursor-pointer text-[13px]"
                  >
                    {showDetails ? 'Hide details' : 'Show details'} &rsaquo;
                  </button>
                </p>
              </div>
              <button
                onClick={dismiss}
                className="text-[#94a3b8] hover:text-[#64748b] transition-colors flex-shrink-0 bg-transparent border-none cursor-pointer p-1 -m-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {showDetails && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Necessary', desc: 'Required for the website to function. Cannot be disabled.', always: true },
                  { label: 'Analytics', desc: 'Help us understand how visitors interact with our website.', always: false },
                  { label: 'Preferences', desc: 'Allow the website to remember your settings and preferences.', always: false },
                ].map(({ label, desc, always }) => (
                  <div key={label} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-[#0f172a]">{label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${always ? 'bg-[#dcfce7] text-[#16a34a]' : 'bg-[#eff6ff] text-[#2563eb]'}`}>
                        {always ? 'Always on' : 'Optional'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={acceptAll}
                className="px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[13px] font-semibold rounded-lg transition-colors cursor-pointer border-none"
              >
                Allow all
              </button>
              <button
                onClick={acceptNecessary}
                className="px-5 py-2 bg-white hover:bg-[#f8fafc] text-[#0f172a] text-[13px] font-semibold rounded-lg border border-[#e2e8f0] transition-colors cursor-pointer"
              >
                Necessary only
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
