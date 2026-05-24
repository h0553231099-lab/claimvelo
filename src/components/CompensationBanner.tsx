import { useState } from 'react';
import { X, CheckCircle2, Plane } from 'lucide-react';

interface Props {
  onCheck: () => void;
}

export default function CompensationBanner({ onCheck }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="w-full text-white px-5 py-3 flex items-center gap-4 relative z-50"
      style={{ background: 'linear-gradient(90deg, #0f2744 0%, #1e3a8a 60%, #1d4ed8 100%)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0 mr-1">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <Plane className="w-4 h-4 text-[#60a5fa]" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-bold text-[14px] leading-snug mb-1">
          Flight delayed or cancelled? You may be owed up to <span className="text-[#60a5fa]">€600 per passenger</span>.
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          {['No win, no fee — ever', 'EU · UK · Israeli law covered', '18,000+ claims won'].map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[12px] text-white/80">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#34d399] shrink-0" />
              {t}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={onCheck}
        className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white text-[#1e3a8a] font-black text-[12px] rounded-xl border-none cursor-pointer hover:bg-[#f0f9ff] hover:-translate-y-px transition-all whitespace-nowrap shadow-md"
      >
        Check My Flight →
      </button>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 ml-1 p-1 bg-transparent border-none cursor-pointer text-white/50 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
