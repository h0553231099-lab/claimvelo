import { Page } from '../types';
import { ChevronLeft, Check, Scale, CreditCard, ArrowRight, DollarSign } from 'lucide-react';

interface Props { onNav: (p: Page) => void; }

export default function FeesPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[640px] mx-auto px-5 pt-7 pb-16">

        {/* Back */}
        <button
          onClick={() => onNav('home')}
          className="flex items-center gap-1 text-[13px] text-[#64748b] bg-transparent border-none cursor-pointer hover:text-[#0f172a] mb-8 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#eff6ff] mx-auto mb-4">
            <DollarSign className="w-7 h-7 text-[#2563eb]" />
          </div>
          <h1 className="text-[28px] font-black text-[#0f172a] tracking-tight mb-1">Our Fees — Simple & Transparent</h1>
          <p className="text-[13px] text-[#94a3b8] uppercase tracking-widest font-medium">No win, no fee. Ever.</p>
        </div>

        {/* Free Services */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-4 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="w-9 h-9 rounded-full bg-[#dcfce7] flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-[#059669]" />
            </div>
            <span className="font-extrabold text-[15px] text-[#0f172a]">Free Services</span>
          </div>
          <div className="px-5 py-4 text-[13px] text-[#374151] leading-relaxed bg-[#f0fdf4]">
            ClaimVelo does not charge anything for the{' '}
            <span className="text-[#2563eb] font-semibold">Eligibility Check</span>,{' '}
            <span className="text-[#2563eb] font-semibold">Case Review</span>, or{' '}
            <span className="text-[#2563eb] font-semibold">unsuccessful claims</span>.
            If we don't win, you owe us nothing — ever.
          </div>
        </div>

        {/* Standard Fee */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-4 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="w-9 h-9 rounded-full bg-[#fef9c3] flex items-center justify-center shrink-0 text-[#ca8a04] font-black text-[12px]">
              30%
            </div>
            <span className="font-extrabold text-[15px] text-[#0f172a]">Standard Success Fee</span>
          </div>
          <div className="px-5 py-4 text-[13px] text-[#374151] leading-relaxed">
            For most claims settled directly with the airline, we charge a{' '}
            <span className="text-[#2563eb] font-semibold">30% success fee</span> deducted from the amount recovered.
            This is our standard rate — and only applies when you win.
          </div>
        </div>

        {/* Legal Escalation Fee */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-4 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="w-9 h-9 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-[#dc2626]" />
            </div>
            <span className="font-extrabold text-[15px] text-[#0f172a]">Legal Escalation Fee — 50%</span>
          </div>
          <div className="px-5 py-4 text-[13px] text-[#374151] leading-relaxed space-y-3">
            <p>
              If the airline refuses to pay and we need to involve a lawyer or take legal action, our fee increases to{' '}
              <span className="text-[#dc2626] font-semibold">50%</span> of the recovered amount.
            </p>
            <p>
              We will always notify you before escalating to legal proceedings. There are still <span className="font-semibold">no upfront costs</span> — you only pay if we win.
            </p>
          </div>
        </div>

        {/* Worked Examples */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <span className="font-extrabold text-[15px] text-[#0f172a]">Worked Examples — EU Flight Delay (€600)</span>
          </div>

          {/* Standard */}
          <div className="px-5 pt-4 pb-2">
            <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Standard claim (no lawyer needed)</div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[13px] text-[#374151]">Compensation from airline</span>
              <span className="text-[15px] font-black text-[#059669]">€600</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[13px] text-[#374151]">ClaimVelo fee (30%)</span>
              <span className="text-[15px] font-black text-[#dc2626]">−€180</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3 bg-[#f0fdf4]">
              <span className="text-[14px] font-extrabold text-[#0f172a]">You receive</span>
              <span className="text-[18px] font-black text-[#059669]">€420</span>
            </div>
          </div>

          {/* Legal */}
          <div className="px-5 pt-4 pb-2 border-t border-[#e2e8f0] mt-1">
            <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Legal escalation (lawyer required)</div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[13px] text-[#374151]">Compensation from airline</span>
              <span className="text-[15px] font-black text-[#059669]">€600</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[13px] text-[#374151]">ClaimVelo fee (50%)</span>
              <span className="text-[15px] font-black text-[#dc2626]">−€300</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3 bg-[#f0fdf4]">
              <span className="text-[14px] font-extrabold text-[#0f172a]">You receive</span>
              <span className="text-[18px] font-black text-[#059669]">€300</span>
            </div>
          </div>

          <div className="px-5 py-2.5 bg-[#f8fafc] border-t border-[#e2e8f0]">
            <div className="text-[11px] text-[#94a3b8] italic">* Example based on long-haul EU261 claim, 1 passenger.</div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-6 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="w-9 h-9 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4 text-[#2563eb]" />
            </div>
            <span className="font-extrabold text-[15px] text-[#0f172a]">How You Get Paid</span>
          </div>
          <div className="px-5 py-4 text-[13px] text-[#374151] leading-relaxed">
            As soon as we receive compensation from the airline, we deduct our fee and send you the remaining amount by{' '}
            <span className="text-[#2563eb] font-semibold">direct bank transfer</span> — typically within 5–10 business days of settlement.
          </div>
        </div>

        {/* Fee Summary Table */}
        <div className="border border-[#e2e8f0] rounded-2xl mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <span className="font-extrabold text-[15px] text-[#0f172a]">Fee Summary</span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {[
              { label: 'Eligibility check', fee: 'Free', green: true },
              { label: 'Unsuccessful claim', fee: '€0', green: true },
              { label: 'Successful standard settlement', fee: '30%', green: false },
              { label: 'Successful legal / court case', fee: '50%', green: false },
              { label: 'Upfront cost to you', fee: '€0 always', green: true },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-[13px] text-[#374151]">{row.label}</span>
                <span className={`text-[13px] font-bold ${row.green ? 'text-[#059669]' : 'text-[#0f172a]'}`}>{row.fee}</span>
              </div>
            ))}
          </div>
        </div>

        {/* No Win No Fee */}
        <div className="rounded-2xl p-7 text-center mb-8" style={{ background: 'linear-gradient(135deg,#0f2744,#1e4a7c)' }}>
          <div className="font-black text-[20px] text-white mb-2">No Win, No Fee. Guaranteed.</div>
          <p className="text-[13px] text-white/75 leading-relaxed max-w-[380px] mx-auto">
            Standard claims: 30%. Legal escalation: 50%. Either way — you only pay when you win, and never a penny upfront. That's our promise.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-[#0f2744] hover:bg-[#1a3a5c] text-white px-8 py-4 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Start a Claim — Free <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
