import { Page } from '../types';
import { Check, ArrowRight, Shield, Star, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Props { onNav: (p: Page) => void; }

const faqs = [
  { q: 'Does UK261 apply to all UK flights?', a: 'UK261 covers three categories: any flight departing from a UK airport (on any airline), any flight arriving in the UK operated by a UK or EU airline, and any flight arriving in the EU operated by a UK airline.' },
  { q: 'Can I still claim after Brexit?', a: 'Yes. Following Brexit, the UK transposed EU Regulation 261/2004 directly into domestic law as UK261. Your rights are essentially identical — compensation amounts are fixed in pounds sterling rather than euros.' },
  { q: 'What compensation can I claim for a delayed flight from the UK?', a: 'Under UK261: £220 for flights under 1,500 km, £350 for 1,500–3,500 km, £260 for flights over 3,500 km with a 3–4 hour arrival delay, and £520 for flights over 3,500 km with a 4+ hour arrival delay. Compensation is based on the arrival delay at the final destination.' },
  { q: 'How far back can I claim for a flight from the UK?', a: 'In England and Wales you have 6 years, in Scotland 5 years, from the date of the disrupted flight. Flights from 2020 onward are likely still within the claim window.' },
  { q: 'Can I claim against British Airways, EasyJet or Jet2?', a: 'Absolutely. All UK-registered carriers are fully subject to UK261. We have extensive experience winning claims against British Airways, EasyJet, Jet2, TUI, Virgin Atlantic, and all other UK airlines.' },
  { q: 'What if the airline blames the delay on extraordinary circumstances?', a: "This is the most common airline defence. Under UK261, extraordinary circumstances are narrowly defined — technical faults, crew shortages, and most operational issues don't qualify. We challenge this excuse in the majority of cases and succeed." },
  { q: 'Do I pay anything upfront?', a: 'No. We only charge a fee if we win your claim. Our standard success fee is 30% of the amount recovered, or 50% if legal representation is required.' },
  { q: 'If my delay is 5 hours or more, can I get a full refund?', a: 'Yes. If your delay reaches 5 hours or more, you have the right to choose not to travel and request a full refund of the unused portion of your ticket in the original form of payment, within 7 days.' },
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

const UK_AIRLINES = [
  { name: 'British Airways', code: 'BA' },
  { name: 'EasyJet', code: 'U2' },
  { name: 'Jet2', code: 'LS' },
  { name: 'TUI Airways', code: 'BY' },
  { name: 'Virgin Atlantic', code: 'VS' },
  { name: 'Ryanair', code: 'FR' },
  { name: 'Wizz Air', code: 'W6' },
  { name: 'Loganair', code: 'LM' },
];

const UK_AIRPORTS = [
  { name: 'London Heathrow', code: 'LHR' },
  { name: 'London Gatwick', code: 'LGW' },
  { name: 'Manchester', code: 'MAN' },
  { name: 'Birmingham', code: 'BHX' },
  { name: 'Edinburgh', code: 'EDI' },
  { name: 'Bristol', code: 'BRS' },
  { name: 'Glasgow', code: 'GLA' },
  { name: 'London Stansted', code: 'STN' },
];

export default function UKPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-white">

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] text-white px-5 py-16 text-center">
        <div className="max-w-[660px] mx-auto">
          <div className="inline-block bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-widest mb-6">
            United Kingdom — UK261 Specialists
          </div>
          <h1 className="text-[2.2rem] font-black tracking-tight leading-[1.15] mb-4">
            Delayed or Cancelled Flight from the UK?<br />
            <span className="text-[#fbbf24]">Claim Up to £520 Compensation</span>
          </h1>
          <p className="text-[15px] text-blue-100 mb-8 leading-relaxed">
            British Airways, EasyJet, Jet2 &amp; all UK airlines covered.<br />
            Free eligibility check in 2 minutes — no win, no fee.
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
            Check My UK Claim Now <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-4 text-[12px] text-blue-200">Delayed 3+ hours or cancelled with less than 14 days' notice? You may be owed up to £520 per passenger under UK Air Passenger Rights Regulations.</p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-[#0f172a] px-5 py-6 border-t border-white/5">
        <div className="max-w-[700px] mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { val: '£520', label: 'Max per passenger' },
            { val: '6 yrs', label: 'Claim window (E&W)' },
            { val: '30%', label: 'Success fee only' },
            { val: '2 min', label: 'To check eligibility' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[1.6rem] font-black text-white leading-none">{s.val}</div>
              <div className="text-[11px] text-[#94a3b8] mt-1 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Compensation Table */}
      <section className="bg-[#f8fafc] px-5 py-14">
        <div className="max-w-[580px] mx-auto text-center">
          <h2 className="text-[22px] font-black text-[#0f172a] mb-2">UK261 Compensation Rates</h2>
          <p className="text-[13px] text-[#64748b] mb-8">Fixed statutory amounts set by UK law — airlines must pay regardless of ticket price.</p>
          <div className="rounded-2xl border border-[#e2e8f0] overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-[#0f172a] text-white text-[11px] font-bold uppercase tracking-wider">
              <div className="px-4 py-3 text-left">Distance</div>
              <div className="px-4 py-3 text-center">Delay</div>
              <div className="px-4 py-3 text-right">Compensation</div>
            </div>
            {[
              { dist: 'Under 1,500 km', example: 'e.g. London–Amsterdam', delay: '3+ hrs', amount: '£220' },
              { dist: '1,500–3,500 km', example: 'e.g. London–Egypt', delay: '3+ hrs', amount: '£350' },
              { dist: 'Over 3,500 km', example: 'e.g. London–New York', delay: '3–4 hrs', amount: '£260' },
              { dist: 'Over 3,500 km', example: 'e.g. London–New York', delay: '4+ hrs', amount: '£520' },
            ].map((row, i) => (
              <div key={i} className={`grid grid-cols-3 border-t border-[#e2e8f0] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}`}>
                <div className="px-4 py-4 text-left">
                  <div className="font-semibold text-[13px] text-[#0f172a]">{row.dist}</div>
                  <div className="text-[11px] text-[#94a3b8]">{row.example}</div>
                </div>
                <div className="px-4 py-4 flex items-center justify-center">
                  <span className="text-[12px] text-[#64748b] font-medium">{row.delay}</span>
                </div>
                <div className="px-4 py-4 flex items-center justify-end">
                  <span className="text-[20px] font-black text-[#059669]">{row.amount}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[#64748b]">Compensation is based on the arrival delay at the final destination. Extraordinary circumstances may exclude payment.</p>
        </div>
      </section>

      {/* Which flights qualify */}
      <section className="bg-white px-5 py-14">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Which UK Flights Are Covered?</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-8">UK Air Passenger Rights Regulations (UK261) apply to three categories of flight.</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              { n: '1', title: 'Departing UK', desc: 'Any flight departing from a UK airport — Heathrow, Gatwick, Manchester, Edinburgh, Birmingham, Bristol, or any other UK airport — regardless of which airline you flew.' },
              { n: '2', title: 'Arriving in UK', desc: 'Flights arriving at a UK airport operated by a UK-registered carrier (e.g. British Airways, EasyJet, Jet2, Virgin Atlantic) or an EU-registered carrier.' },
              { n: '3', title: 'UK to EU', desc: 'Flights arriving at an EU airport operated by a UK-registered carrier. This category ensures UK travellers flying to Europe on UK airlines retain full protection.' },
            ].map(c => (
              <div key={c.n} className="bg-[#f8fafc] rounded-2xl border border-[#e2e8f0] p-5">
                <div className="w-9 h-9 rounded-full bg-[#0f172a] text-white font-black text-[15px] flex items-center justify-center mb-3">{c.n}</div>
                <div className="font-bold text-[14px] text-[#0f172a] mb-2">{c.title}</div>
                <div className="text-[12px] text-[#64748b] leading-relaxed">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UK Airlines */}
      <section className="bg-[#f8fafc] px-5 py-14">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Airlines We Claim Against</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-8">We handle claims against every major UK and EU airline operating from UK airports.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {UK_AIRLINES.map(a => (
              <div key={a.code} className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-4 text-center hover:shadow-md transition-shadow">
                <div className="text-[11px] font-black text-[#64748b] uppercase tracking-wider mb-1">{a.code}</div>
                <div className="font-bold text-[13px] text-[#0f172a]">{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UK Airports */}
      <section className="bg-white px-5 py-14">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Major UK Airports Covered</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-8">Claims accepted for disruptions at all UK airports.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {UK_AIRPORTS.map(a => (
              <div key={a.code} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-4 text-center">
                <div className="text-[15px] font-black text-[#2563eb] mb-1">{a.code}</div>
                <div className="text-[12px] text-[#0f172a] font-semibold">{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why ClaimVelo */}
      <section className="bg-[#f8fafc] px-5 py-14">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] font-black text-[#0f172a] text-center mb-2">Why UK Passengers Choose ClaimVelo</h2>
          <p className="text-[13px] text-[#64748b] text-center mb-8">Specialists in UK261 — not a generic claims portal.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: <Check className="w-5 h-5 text-[#2563eb]" />, title: 'UK261 Legal Expertise', desc: 'Our aviation law team knows UK261 in full detail, including post-Brexit nuances that generic claims services miss.' },
              { icon: <Shield className="w-5 h-5 text-[#2563eb]" />, title: 'No Win, No Fee — Always', desc: 'Zero upfront cost. You pay our 30% success fee only when we recover your compensation.' },
              { icon: <Star className="w-5 h-5 text-[#2563eb]" />, title: '6-Year Claim Window', desc: 'Under English law you have 6 years. Flights from 2020 onward may still be claimable — it costs nothing to check.' },
              { icon: <Clock className="w-5 h-5 text-[#2563eb]" />, title: 'Fast & Fully Managed', desc: 'We handle every step from the initial demand to payment. Most UK claims settle within 8–12 weeks.' },
            ].map((b, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-xl border border-[#e2e8f0] bg-white">
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
          <h2 className="text-[22px] font-black text-[#0f172a] mb-2">How to Claim UK Flight Compensation</h2>
          <p className="text-[13px] text-[#64748b] mb-10">Three steps. Under 2 minutes of your time.</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { n: '1', title: 'Check Eligibility', desc: 'Enter your flight number and date. We instantly confirm whether you qualify under UK261.' },
              { n: '2', title: 'We Handle Everything', desc: 'Our UK261 specialists draft the legal demand, handle airline correspondence, and fight every rejection.' },
              { n: '3', title: 'Receive Your Money', desc: 'Once the airline pays, we transfer your share directly to your UK bank account.' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-[#e2e8f0] text-center">
                <div className="w-10 h-10 rounded-full bg-[#0f172a] text-white font-black text-[16px] flex items-center justify-center mx-auto mb-4">{s.n}</div>
                <div className="font-bold text-[15px] text-[#0f172a] mb-2">{s.title}</div>
                <div className="text-[13px] text-[#64748b] leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* British Airways Banner */}
      <section className="bg-[#00215b] text-white px-5 py-14">
        <div className="max-w-[640px] mx-auto text-center">
          <h2 className="text-[22px] font-black mb-3">Claiming Against British Airways?</h2>
          <p className="text-[14px] text-blue-200 mb-8">
            British Airways is one of the most claimed-against airlines under UK261. We have deep experience winning BA claims — including technical fault cases where BA cites "extraordinary circumstances."
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {[
              'Flight delayed over 3 hours',
              'Last-minute cancellation (under 14 days)',
              'Denied boarding (overbooked)',
              'Missed connection on same booking',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 text-[13px] text-left">
                <Check className="w-4 h-4 text-[#34d399] shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold text-[14px] px-7 py-3.5 rounded-xl transition-colors"
          >
            Claim Against British Airways <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="bg-[#0f172a] px-5 py-10">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[18px] font-black text-white text-center mb-7">Trusted by UK Passengers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { top: 'UK261 Compliant', bot: 'Post-Brexit Law' },
              { top: 'GDPR Compliant', bot: '& Secure' },
              { top: 'No Win', bot: 'No Fee — Ever' },
              { top: '6-Year', bot: 'Claim Window (E&W)' },
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
          <p className="text-[13px] text-[#64748b] text-center mb-8">Everything you need to know about UK flight compensation claims.</p>
          {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] text-white px-5 py-16 text-center">
        <div className="max-w-[540px] mx-auto">
          <h2 className="text-[24px] font-black mb-3">Check Your UK Flight Claim — Free</h2>
          <p className="text-[14px] text-blue-100 mb-7 leading-relaxed">
            Thousands of UK passengers are owed compensation under UK261 but never claim. It takes 2 minutes and costs nothing to check.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            {['Free to check', '2 minutes to apply', 'Up to £520 per passenger'].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px] text-blue-100 justify-center">
                <Check className="w-4 h-4 text-white" /> {t}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNav('claim')}
            className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold text-[15px] px-8 py-4 rounded-xl transition-colors shadow-lg"
          >
            Start Your UK Claim Now <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-4 text-[12px] text-blue-200">No risk. No upfront cost. Just the compensation you are owed.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-[#94a3b8] py-10 px-5 text-center border-t border-white/5">
        <div className="font-black text-[16px] text-white mb-1">Claim<span className="text-[#60a5fa]">Velo</span> United Kingdom</div>
        <div className="text-[12px] mb-4 opacity-70">Helping UK passengers claim UK261 flight compensation</div>
        <div className="flex gap-5 justify-center flex-wrap mb-5">
          <a href="mailto:info@claimvelo.com" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">info@claimvelo.com</a>
          <button onClick={() => onNav('privacy')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Privacy Policy</button>
          <button onClick={() => onNav('how-it-works')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">How It Works</button>
          <button onClick={() => onNav('fees')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Our Fees</button>
        </div>
        <div className="text-[11px] border-t border-[#1e293b] pt-4 opacity-60">
          © {new Date().getFullYear()} ClaimVelo Ltd. · Regulated under UK Air Passenger Rights Regulations (UK261)
        </div>
      </footer>

    </div>
  );
}
