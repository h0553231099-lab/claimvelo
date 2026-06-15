import { Page } from '../types';
import { Check, ArrowRight, Shield, Star, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Props { onNav: (p: Page) => void; }

const faqs = [
  { q: 'Can I claim if my flight left from Ireland?', a: 'Yes! All flights departing from Ireland are covered under EU Regulation 261/2004, regardless of the airline.' },
  { q: 'What about Ryanair flights?', a: 'Absolutely. Ryanair is fully covered under EU261, and we have extensive experience winning claims against them.' },
  { q: 'How long does it take?', a: 'Most claims are resolved in 8–12 weeks. Complex or escalated cases may take longer.' },
  { q: 'What if the airline says "extraordinary circumstances"?', a: 'Airlines frequently use this excuse unfairly. We challenge it and win in the majority of contested cases.' },
  { q: 'Do I pay anything upfront?', a: 'No. We only charge a fee if we win your claim. No win, no fee — always.' },
  { q: "What's your fee?", a: 'We charge 30% of your compensation on standard claims, or 50% if legal representation is required. You keep the remainder.' },
  { q: 'Can I claim for old flights?', a: 'Yes — in Ireland and most EU countries you can claim for flights up to 6 years ago.' },
  { q: 'Which airlines are covered?', a: 'Ryanair, Aer Lingus, British Airways, Lufthansa, Air France and all EU-registered carriers are covered.' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#e2e8f0] rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-[#f8fafc] transition-colors"
      >
        <span className="font-semibold text-[14px] text-[#0f172a] pr-4">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#64748b] shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#64748b] shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-[13px] text-[#475569] leading-relaxed border-t border-[#f1f5f9] bg-[#f8fafc]">
          {a}
        </div>
      )}
    </div>
  );
}

export default function IrelandPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-white">

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1e3a8a] to-[#2563eb] text-white px-5 py-16 text-center">
        <div className="max-w-[640px] mx-auto">
          <div className="inline-block bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-widest mb-6">
            Ireland — EU261 Specialists
          </div>
          <h1 className="text-[2.2rem] font-black tracking-tight leading-[1.15] mb-4">
            Delayed Flight From Ireland?<br />
            <span className="text-[#fbbf24]">Claim €250–€600 Compensation</span>
          </h1>
          <p className="text-[15px] text-blue-100 mb-8 leading-relaxed">
            Ryanair, Aer Lingus & all EU airlines covered.<br />Free eligibility check in 2 minutes — no win, no fee.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8">
            <div className="flex items-center gap-2 text-[13px] text-blue-100"><Check className="w-4 h-4 text-[#34d399]" /> No win, no fee</div>
            <div className="flex items-center gap-2 text-[13px] text-blue-100"><Check className="w-4 h-4 text-[#34d399]" /> 100% risk free</div>
            <div className="flex items-center gap-2 text-[13px] text-blue-100"><Check className="w-4 h-4 text-[#34d399]" /> 2 minutes to apply</div>
          </div>
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold text-[15px] px-8 py-4 rounded-xl transition-colors shadow-lg"
          >
            Check Your Claim Now <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-4 text-[12px] text-blue-200">Flights delayed 3+ hours or cancelled? You may be owed up to €600 per passenger under EU Regulation 261/2004.</p>
        </div>
      </section>

      {/* Compensation Table */}
      <section className="bg-[#f8fafc] px-5 py-14">
        <div className="max-w-[560px] mx-auto text-center">
          <h2 className="text-[22px] font-black text-[#0f172a] mb-2">How Much Can You Claim?</h2>
          <p className="text-[13px] text-[#64748b] mb-8">Set by EU law — airlines must pay these fixed amounts.</p>
          <div className="rounded-2xl border border-[#e2e8f0] overflow-hidden shadow-sm">
            <div className="grid grid-cols-2 bg-[#1e3a8a] text-white text-[12px] font-bold uppercase tracking-wider">
              <div className="px-5 py-3 text-left">Flight Distance</div>
              <div className="px-5 py-3 text-right">Compensation</div>
            </div>
            {[
              { dist: 'Up to 1,500 km', example: 'e.g. Dublin–London', amount: '€250' },
              { dist: '1,500–3,500 km', example: 'e.g. Dublin–Spain', amount: '€400' },
              { dist: 'Over 3,500 km', example: 'e.g. Dublin–USA', amount: '€600' },
            ].map((row, i) => (
              <div key={i} className={`grid grid-cols-2 border-t border-[#e2e8f0] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}`}>
                <div className="px-5 py-4">
                  <div className="font-semibold text-[14px] text-[#0f172a]">{row.dist}</div>
                  <div className="text-[12px] text-[#94a3b8]">{row.example}</div>
                </div>
                <div className="px-5 py-4 flex items-center justify-end">
                  <span className="text-[22px] font-black text-[#059669]">{row.amount}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-[#64748b]">Most Irish short-haul flights qualify for €250–€400 per passenger.</p>
        </div>
      </section>

      {/* Why ClaimVelo */}
      <section className="bg-white px-5 py-14">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Trusted by Irish Passengers</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-10">We specialise in Irish airlines and know exactly how to win.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: <Check className="w-5 h-5 text-[#2563eb]" />, title: 'Ryanair & Aer Lingus Experts', desc: "We know Irish airlines inside-out and handle their specific processes daily." },
              { icon: <Shield className="w-5 h-5 text-[#2563eb]" />, title: 'No Win, No Fee — Guaranteed', desc: "Zero upfront cost. You only pay when we successfully win your compensation." },
              { icon: <Star className="w-5 h-5 text-[#2563eb]" />, title: 'Proven Results', desc: "Strong track record of successful Irish claims with above-average payouts." },
              { icon: <Clock className="w-5 h-5 text-[#2563eb]" />, title: 'Fast & Fully Managed', desc: "We handle everything from submission to payment. You just wait." },
            ].map((b, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc]">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-[#eff6ff] flex items-center justify-center">{b.icon}</div>
                <div>
                  <div className="font-bold text-[14px] text-[#0f172a] mb-1">{b.title}</div>
                  <div className="text-[13px] text-[#64748b] leading-relaxed">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-[#eff6ff] px-5 py-14">
        <div className="max-w-[700px] mx-auto text-center">
          <h2 className="text-[22px] font-black text-[#0f172a] mb-2">Simple 3-Step Process</h2>
          <p className="text-[13px] text-[#64748b] mb-10">No forms to struggle with. No jargon. No stress.</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { n: '1', title: 'Check Eligibility', desc: 'Fill in your flight details. We tell you instantly if you can claim — takes 2 minutes.' },
              { n: '2', title: 'We Handle It', desc: 'Our team contacts the airline, manages paperwork and fights on your behalf.' },
              { n: '3', title: 'Get Paid', desc: 'Receive €250–€600 directly to your bank account once the airline pays.' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-[#e2e8f0] text-center">
                <div className="w-10 h-10 rounded-full bg-[#2563eb] text-white font-black text-[16px] flex items-center justify-center mx-auto mb-4">{s.n}</div>
                <div className="font-bold text-[15px] text-[#0f172a] mb-2">{s.title}</div>
                <div className="text-[13px] text-[#64748b] leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ryanair Banner */}
      <section className="bg-[#073590] text-white px-5 py-14">
        <div className="max-w-[640px] mx-auto">
          <h2 className="text-[22px] font-black text-center mb-3">Claiming Against Ryanair?</h2>
          <p className="text-[14px] text-blue-200 text-center mb-8">
            Ryanair is Ireland's largest airline — and one of the most claimed-against in Europe. We have extensive experience winning Ryanair claims.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {[
              'Flight delayed over 3 hours',
              'Last-minute cancellation',
              'Denied boarding (overbooked)',
              'Missed connection due to Ryanair delay',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 text-[13px]">
                <Check className="w-4 h-4 text-[#34d399] shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <div className="text-center">
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold text-[14px] px-7 py-3.5 rounded-xl transition-colors"
            >
              Claim from Ryanair Now <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="bg-[#1e3a8a] px-5 py-10">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[18px] font-black text-white text-center mb-7">Trusted & Regulated</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { top: 'EU Regulation', bot: '261/2004 Compliant' },
              { top: 'Fully Licensed', bot: 'Legal Team' },
              { top: 'GDPR Compliant', bot: '& Secure' },
              { top: '4.8/5 Rating', bot: 'From Irish Passengers' },
            ].map((b, i) => (
              <div key={i} className="bg-white/10 rounded-xl px-4 py-4 text-center border border-white/10">
                <div className="text-[13px] font-bold text-white">{b.top}</div>
                <div className="text-[11px] text-blue-200 mt-0.5">{b.bot}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#f8fafc] px-5 py-14">
        <div className="max-w-[640px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Frequently Asked Questions</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-8">Everything you need to know about claiming from Ireland.</p>
          {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-[#059669] to-[#10b981] text-white px-5 py-16 text-center">
        <div className="max-w-[540px] mx-auto">
          <h2 className="text-[24px] font-black mb-3">Don't Leave Money on the Table</h2>
          <p className="text-[14px] text-green-100 mb-7 leading-relaxed">
            Thousands of Irish passengers are owed compensation but never claim it. It costs nothing to check.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            {['Free to check', '2 minutes to apply', 'Up to €600 waiting'].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px] text-green-100 justify-center">
                <Check className="w-4 h-4 text-white" /> {t}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-white text-[#059669] font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-green-50 transition-colors shadow-lg"
          >
            Start Your Claim Now <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-4 text-[12px] text-green-200">No risk. No upfront cost. Just the compensation you deserve.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-[#94a3b8] py-10 px-5 text-center">
        <div className="font-black text-[16px] text-white mb-1">Claim<span className="text-[#60a5fa]">Velo</span> Ireland</div>
        <div className="text-[12px] mb-4 opacity-70">Helping Irish passengers claim EU flight compensation</div>
        <div className="flex gap-5 justify-center flex-wrap mb-5">
          <a href="mailto:info@claimvelo.com" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">info@claimvelo.com</a>
          <button onClick={() => onNav('privacy')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Privacy Policy</button>
          <button onClick={() => onNav('how-it-works')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">How It Works</button>
          <button onClick={() => onNav('fees')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Our Fees</button>
        </div>
        <div className="text-[11px] border-t border-[#1e293b] pt-4 opacity-60">
          © {new Date().getFullYear()} ClaimVelo Ltd. · 1265 55th St, Brooklyn, NY 11219 · Regulated under EU Regulation 261/2004
        </div>
      </footer>

    </div>
  );
}
