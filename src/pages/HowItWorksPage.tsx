import { Page } from '../types';
import { Plane, Search, FileText, PenLine, Send, TrendingUp, CheckCircle, Clock, Shield, DollarSign, ArrowRight } from 'lucide-react';

interface Props { onNav: (p: Page) => void; }

const STEPS = [
  {
    icon: Search,
    color: '#0f2744',
    num: '01',
    title: 'Submit Your Flight Details',
    desc: 'Fill out our simple form in under two minutes. All we need is your flight number, date, and what happened. Our AI instantly checks your eligibility.',
    detail: 'Takes under 2 minutes. No account needed to check. Completely free.',
  },
  {
    icon: FileText,
    color: '#2563eb',
    num: '02',
    title: 'We Build Your Case',
    desc: 'Our experts verify your eligibility and compile all necessary documentation — flight records, delay data, and legal grounds — to build the strongest possible claim against the airline.',
    detail: 'We handle all research, documentation, and legal filing on your behalf.',
  },
  {
    icon: PenLine,
    color: '#0891b2',
    num: '03',
    title: 'Sign the Letter of Authority',
    desc: 'Draw your digital signature to authorise ClaimVelo to act on your behalf. This legally binding document allows us to contact and negotiate with the airline directly.',
    detail: 'No printing, no scanning. Fully digital. Stored securely.',
  },
  {
    icon: Send,
    color: '#059669',
    num: '04',
    title: 'We File & Negotiate',
    desc: 'We send the formal compensation demand to the airline with full supporting documentation. Most airlines settle at this stage. If they stall or reject, we escalate immediately.',
    detail: 'Airlines have 30 days to respond. We follow up proactively — no delays on our end.',
  },
  {
    icon: TrendingUp,
    color: '#d97706',
    num: '05',
    title: 'We Chase & Fight Back',
    desc: "Our team monitors every claim in real time. We push back on invalid rejections, challenge 'extraordinary circumstances' excuses, and take the case further if needed. You can track progress anytime.",
    detail: '99% success rate on eligible claims. We never give up on a valid case.',
  },
  {
    icon: DollarSign,
    color: '#059669',
    num: '06',
    title: 'You Get Paid',
    desc: "Compensation is transferred directly to your bank account. We deduct our fee (30% standard, 50% if legal action was needed) only after you receive the money. If we don't win, you pay absolutely nothing.",
    detail: 'You can claim up to €600 per passenger. On a family of four, that\'s up to €2,400.',
  },
];

const ELIGIBLE = [
  { icon: Clock, label: 'Delays of 3+ hours at arrival', color: '#d97706' },
  { icon: Plane, label: 'Flight cancellations with less than 14 days notice', color: '#dc2626' },
  { icon: Shield, label: 'Denied boarding due to overbooking', color: '#0369a1' },
  { icon: CheckCircle, label: 'Missed connections caused by the first flight', color: '#059669' },
];

export default function HowItWorksPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero */}
      <div className="relative overflow-hidden text-white text-center py-20 px-5" style={{ background: 'linear-gradient(135deg,#0f2744 0%,#1e3a8a 50%,#1d4ed8)' }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative max-w-[720px] mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold mb-6 tracking-wider uppercase">
            ✈ Simple 6-Step Process
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-black leading-[1.1] mb-5">
            Get Your Compensation<br />
            <span style={{ color: '#60a5fa' }}>in 3 Simple Steps</span>
          </h1>
          <p className="text-[16px] opacity-85 max-w-[500px] mx-auto mb-8 leading-relaxed">
            From checking eligibility to money in your bank — here's exactly what happens when you file a claim with us. Takes under 2 minutes of your time.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => onNav('claim')}
              className="bg-white text-[#1e3a8a] px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl hover:bg-[#f0f9ff]"
            >
              Start Now — Free
            </button>
            <button
              onClick={() => onNav('home')}
              className="bg-transparent text-white border-2 border-white/30 px-6 py-3.5 rounded-xl text-[14px] font-semibold cursor-pointer hover:bg-white/10 transition-colors"
            >
              Check Eligibility
            </button>
          </div>
          <div className="flex justify-center gap-8 mt-14 flex-wrap">
            {[['€650', 'Max per passenger'], ['99%', 'Success rate'], ['21d', 'Avg. payout'], ['€0', 'Upfront cost']].map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="text-[1.8rem] font-black leading-none">{v}</div>
                <div className="text-[10px] opacity-60 mt-1 font-medium uppercase tracking-wider">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="max-w-[760px] mx-auto px-5 py-14">
        <div className="flex flex-col gap-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className="flex gap-6 relative pb-10 last:pb-0">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[23px] top-[52px] bottom-0 w-0.5 bg-[#e2e8f0]" />
                )}
                <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center z-10" style={{ background: s.color }}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 pt-2">
                  <div className="text-[11px] font-black text-[#94a3b8] uppercase tracking-widest mb-1">Step {s.num}</div>
                  <div className="text-[19px] font-black text-[#0f172a] mb-2">{s.title}</div>
                  <p className="text-[14px] text-[#374151] leading-relaxed mb-2">{s.desc}</p>
                  <div className="inline-flex items-center gap-1.5 bg-[#f1f5f9] border border-[#e2e8f0] rounded-xl px-3 py-1.5 text-[12px] text-[#64748b]">
                    <CheckCircle className="w-3.5 h-3.5 text-[#059669] shrink-0" /> {s.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* What qualifies */}
      <div className="bg-white border-y border-[#e2e8f0] py-14 px-5">
        <div className="max-w-[760px] mx-auto">
          <div className="text-[11px] font-black text-[#64748b] uppercase tracking-wider mb-1">Eligibility</div>
          <h2 className="text-[22px] font-black text-[#0f172a] mb-2">What Qualifies for Compensation?</h2>
          <p className="text-[14px] text-[#64748b] mb-7">You may be entitled to up to $650 if any of the following happened:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
            {ELIGIBLE.map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <span className="text-[13px] font-semibold text-[#0f172a]">{label}</span>
              </div>
            ))}
          </div>
          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded-xl px-5 py-4 text-[13px] text-[#92400e] leading-relaxed">
            <strong>Important:</strong> Technical faults and crew problems are <em>not</em> "extraordinary circumstances" — airlines use this excuse to avoid paying out, but we challenge it every time and we usually win.
          </div>
        </div>
      </div>

      {/* Fee explainer */}
      <div className="bg-[#0f2744] text-white py-14 px-5">
        <div className="max-w-[760px] mx-auto">
          <h2 className="text-[22px] font-black mb-2">Our Fee — Only If We Win</h2>
          <p className="text-[15px] opacity-75 mb-8">We operate on a strict no-win, no-fee basis. Here's exactly how it works:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'You pay upfront', value: '€0', sub: 'Nothing. Ever.', color: '#4ade80' },
              { label: 'Our success fee', value: '30%', sub: '50% if legal action needed', color: '#60a5fa' },
              { label: 'If we lose', value: '€0', sub: 'You owe us nothing', color: '#4ade80' },
            ].map(f => (
              <div key={f.label} className="bg-white/10 border border-white/20 rounded-2xl p-6 text-center">
                <div className="text-[36px] font-black mb-1" style={{ color: f.color }}>{f.value}</div>
                <div className="font-bold text-[13px] mb-1 text-white">{f.label}</div>
                <div className="text-[12px] opacity-60">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="py-14 px-5 bg-[#f8fafc] text-center">
        <div className="max-w-[520px] mx-auto">
          <h2 className="text-[24px] font-black text-[#0f172a] mb-2">Ready to Check Your Flight?</h2>
          <p className="text-[14px] text-[#64748b] mb-7">Free eligibility check. Under 2 minutes. No commitment required.</p>
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-[#0f2744] hover:bg-[#1a3a5c] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Start Now — Free <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
