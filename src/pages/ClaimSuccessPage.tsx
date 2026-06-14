import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Page } from '../types';

interface Props { onNav: (p: Page) => void; }

export default function ClaimSuccessPage({ onNav }: Props) {
  const [claimRef, setClaimRef] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setClaimRef(params.get('ref') || '');
    setEmail(params.get('email') || '');
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-xl p-10 text-center">
        <div className="w-16 h-16 bg-[#16a34a] rounded-full flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-white" />
        </div>
        <div className="text-[26px] font-extrabold text-[#0f172a] mb-2">Claim Submitted!</div>
        <div className="text-[14px] text-[#64748b] mb-7">We've received your claim and our team will start working on it right away.</div>
        {claimRef && (
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-2xl p-6 mb-7">
            <div className="text-[11px] font-bold text-[#16a34a] uppercase tracking-wider mb-2">Your Claim Reference</div>
            <div className="text-[34px] font-black text-[#16a34a] tracking-widest">{claimRef}</div>
            <div className="text-[12px] text-[#64748b] mt-1">
              {email ? `Confirmation sent to ${email}` : 'Keep this reference safe'}
            </div>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onNav('dashboard')}
            className="px-6 py-2.5 bg-[#0f2744] text-white rounded-xl text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1a3a5c]"
          >
            Track My Claim
          </button>
          <button
            onClick={() => onNav('home')}
            className="px-6 py-2.5 bg-white border-2 border-[#e2e8f0] text-[#374151] rounded-xl text-[13px] font-semibold cursor-pointer hover:border-[#94a3b8]"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
