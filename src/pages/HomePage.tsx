import { useState, useEffect } from 'react';
import { Page } from '../types';
import { useLang } from '../lib/language';
import { ShieldCheck, Scale, Users, Check, X, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Testimonial {
  id: string;
  name: string;
  initials: string;
  route: string;
  text: string;
  stars: number;
  amount: string | null;
}

interface Props { onNav: (p: Page) => void; onCheckCompensation?: () => void; }

type DisruptionType = 'delay' | 'cancellation' | 'missed' | 'denied';
type Region = 'eu' | 'uk' | 'il';

const DISRUPTION_TYPES: { id: DisruptionType; label: string; icon: string }[] = [
  { id: 'delay', label: 'Flight Delay', icon: '⏱' },
  { id: 'cancellation', label: 'Cancellation', icon: '✈' },
  { id: 'missed', label: 'Missed Connection', icon: '🔗' },
  { id: 'denied', label: 'Denied Boarding', icon: '🚫' },
];

const DISRUPTION_INFO: Record<DisruptionType, { what: string; qualify: string[]; amount: string; tip: string }> = {
  delay: {
    what: 'A flight delay occurs when your aircraft departs or arrives significantly later than the scheduled time.',
    qualify: [
      'Arrived at your final destination 3+ hours late (EU/UK) or 8+ hours late (Israel)',
      'The delay was caused by the airline — not extraordinary circumstances like severe weather or air traffic control strikes',
      'Flight departed from an EU/UK/IL airport, or arrived into one on an EU/UK carrier',
    ],
    amount: 'Up to €600 / £520 per passenger depending on flight distance.',
    tip: 'Keep your boarding pass and any delay notifications. Airlines must also offer meals, refreshments, and hotel if overnight.',
  },
  cancellation: {
    what: 'A flight cancellation is when the airline removes your scheduled flight entirely, before or on the day of travel.',
    qualify: [
      'You were informed of the cancellation less than 14 days before departure',
      'The cancellation was within the airline\'s control (not extraordinary circumstances)',
      'You were not offered a comparable re-routing that arrived within 2–4 hours of original arrival',
    ],
    amount: 'Up to €600 / £520 per passenger, plus full ticket refund or re-routing.',
    tip: 'Even if you accept a replacement flight, you can still claim compensation if you were told less than 14 days in advance.',
  },
  missed: {
    what: 'A missed connection happens when a delayed or cancelled inbound flight causes you to miss a connecting flight on the same booking.',
    qualify: [
      'Both flights were on the same booking or ticket reference',
      'The delay at final destination was 3+ hours compared to original arrival time',
      'The connection was missed due to the airline\'s fault, not your own',
    ],
    amount: 'Up to €600 per passenger based on total journey distance.',
    tip: 'The key is that both flights must be on a single booking. Separately booked connections are not covered under EC 261/2004.',
  },
  denied: {
    what: 'Denied boarding (also called being "bumped") happens when an airline refuses to let you board a flight you have a valid confirmed booking for — usually due to overbooking.',
    qualify: [
      'You had a confirmed reservation and checked in on time',
      'The airline denied boarding against your will (not because you volunteered)',
      'The flight operated under EU, UK, or Israeli jurisdiction',
    ],
    amount: 'Up to €600 / £520 per passenger, plus full refund or alternative flight.',
    tip: 'If you voluntarily give up your seat in exchange for benefits, different rules apply. Only involuntary denied boarding triggers the full compensation right.',
  },
};

const COMP_TABLE = {
  eu: {
    flag: '🇪🇺',
    name: 'EU Regulation 261/2004',
    currency: 'EUR (€)',
    limit: '2–6 years (varies by country)',
    rows: [
      { range: 'Up to 1,500 km', hours: '3+ hrs', amount: '€250' },
      { range: '1,500 – 3,500 km', hours: '3+ hrs', amount: '€400' },
      { range: 'Over 3,500 km', hours: '3+ hrs', amount: '€600' },
    ],
    applies: 'Flights departing any EU airport, OR flights arriving in the EU operated by an EU-based airline.',
  },
  uk: {
    flag: '🇬🇧',
    name: 'UK261',
    currency: 'GBP (£)',
    limit: '6 years (England & Wales)',
    rows: [
      { range: 'Up to 1,500 km', hours: '3+ hrs', amount: '£220' },
      { range: '1,500 – 3,500 km', hours: '3+ hrs', amount: '£350' },
      { range: 'Over 3,500 km', hours: '3+ hrs', amount: '£520' },
    ],
    applies: 'Flights departing UK airports, OR flights arriving in the UK operated by a UK-based airline.',
  },
  il: {
    flag: '🇮🇱',
    name: 'Israeli Aviation Services Law',
    currency: 'ILS (₪)',
    limit: '4 years',
    rows: [
      { range: 'Short-haul', hours: '8+ hrs', amount: '₪1,470' },
      { range: 'Medium-haul', hours: '8+ hrs', amount: '₪2,390' },
      { range: 'Long-haul', hours: '8+ hrs', amount: '₪3,530' },
    ],
    applies: 'Flights departing from Israeli airports.',
  },
};

const TIME_LIMITS = [
  { flag: '🇪🇺', country: 'EU (most countries)', years: '3 years', from: 'from 2023' },
  { flag: '🇬🇧', country: 'UK (England & Wales)', years: '6 years', from: 'from 2020' },
  { flag: '🇬🇧', country: 'UK (Scotland)', years: '5 years', from: 'from 2021' },
  { flag: '🇮🇱', country: 'Israel', years: '4 years', from: 'from 2022' },
  { flag: '🇫🇷', country: 'France', years: '5 years', from: 'from 2021' },
  { flag: '🇳🇱', country: 'Netherlands', years: '3 years', from: 'from 2023' },
];

const COMPARE = [
  { feature: 'No upfront cost', us: true, diy: true, others: 'sometimes' },
  { feature: 'No win, no fee', us: true, diy: false, others: 'sometimes' },
  { feature: 'Commission rate', us: '30% / 50%*', diy: '0%', others: '35–50%' },
  { feature: 'Legal escalation to court', us: true, diy: false, others: 'sometimes' },
  { feature: 'EU + UK + IL + US coverage', us: true, diy: false, others: 'sometimes' },
  { feature: 'Expert aviation lawyers', us: true, diy: false, others: 'sometimes' },
  { feature: 'Real-time claim tracking', us: true, diy: false, others: 'sometimes' },
  { feature: 'Personal account manager', us: true, diy: false, others: false },
  { feature: 'Average claim time', us: '6–12 wks', diy: 'Months–years', others: '3–6 months' },
];

const SERVICES = [
  {
    title: 'Cancellation',
    desc: 'Flight cancelled with less than 14 days notice? You could claim up to €600 per passenger.',
    icon: '✈',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    title: 'Flight Delay',
    desc: 'Arrived at your destination 3+ hours late? Compensation rights apply for long delays.',
    icon: '⏱',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    title: 'Denied Boarding',
    desc: 'Bumped from your flight due to overbooking? Claim up to 400% of your ticket value.',
    icon: '🚫',
    color: '#2563eb',
    bg: '#eff6ff',
  },
];

function CellIcon({ val }: { val: boolean | string }) {
  if (val === true) return <Check className="w-4 h-4 text-[#059669] mx-auto" />;
  if (val === false) return <X className="w-4 h-4 text-[#dc2626] mx-auto" />;
  if (val === 'sometimes') return <Minus className="w-4 h-4 text-[#d97706] mx-auto" />;
  return <span className="text-[12px] font-semibold text-[#0f172a]">{val}</span>;
}

export default function HomePage({ onNav, onCheckCompensation }: Props) {
  const { t } = useLang();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [disruption, setDisruption] = useState<DisruptionType>('delay');
  const [infoOpen, setInfoOpen] = useState<DisruptionType | null>(null);
  const [region, setRegion] = useState<Region>('eu');
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    supabase
      .from('testimonials')
      .select('id, name, initials, route, text, stars, amount')
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(6)
      .then(({ data }) => { if (data) setTestimonials(data); });
  }, []);

  const comp = COMP_TABLE[region];

  return (
    <div>
      {/* HERO */}
      <div className="relative overflow-hidden text-white text-center py-20 px-5" style={{ background: 'linear-gradient(135deg,#0f2744 0%,#1e3a8a 50%,#1d4ed8)' }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative max-w-[720px] mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold mb-6 tracking-wider uppercase">
            ✈ No Win, No Fee · Free Eligibility Check
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-black leading-[1.1] mb-5">
            Delayed or Canceled Flight?<br />
            <span style={{ color: '#60a5fa' }}>Get Up to €600!</span>
          </h1>
          <p className="text-[16px] opacity-85 max-w-[480px] mx-auto mb-8 leading-relaxed">
            We fight the airlines so you don't have to. Submit in minutes — our experts handle everything.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => onNav('claim')}
              className="bg-white text-[#1e3a8a] px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl hover:bg-[#f0f9ff]"
            >
              Start Now — It's Free
            </button>
            <button
              onClick={() => onNav('how-it-works')}
              className="bg-transparent text-white border-2 border-white/30 px-6 py-3.5 rounded-xl text-[14px] font-semibold cursor-pointer hover:bg-white/10 transition-colors"
            >
              Our Process
            </button>
          </div>
          {/* Stats */}
          <div className="flex justify-center gap-8 mt-14 flex-wrap">
            {([
              ['350+', 'Airlines Covered'],
              ['30%', 'Standard Fee Only on Win'],
              ['€0', 'Upfront Cost'],
              ['6 yrs', 'Max Claim Window'],
              ['EU·UK·IL·US', 'Regulations'],
            ] as [string, string][]).map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="text-[1.8rem] font-black leading-none">{v}</div>
                <div className="text-[10px] opacity-60 mt-1 font-medium uppercase tracking-wider">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DISRUPTION SELECTOR + COMPENSATION TABLE */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[780px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Eligibility & Amounts</div>
            <h2 className="text-[clamp(1.4rem,3vw,2rem)] font-black text-[#0f172a] mb-2">What Happened To Your Flight?</h2>
            <p className="text-[13px] text-[#64748b]">Select your disruption type to see your compensation entitlement.</p>
          </div>

          {/* Disruption type buttons */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {DISRUPTION_TYPES.map(d => (
              <button
                key={d.id}
                onClick={() => setDisruption(d.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold border-2 transition-all cursor-pointer ${
                  disruption === d.id
                    ? 'bg-[#2563eb] border-[#2563eb] text-white shadow-md'
                    : 'bg-white border-[#e2e8f0] text-[#374151] hover:border-[#2563eb] hover:text-[#2563eb]'
                }`}
              >
                <span>{d.icon}</span> {d.label}
              </button>
            ))}
          </div>

          {/* See more info toggle */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setInfoOpen(prev => prev === disruption ? null : disruption)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] transition-colors cursor-pointer bg-transparent border-none"
            >
              {infoOpen === disruption ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {infoOpen === disruption ? 'Hide info' : 'See more info'}
            </button>
          </div>

          {/* Info panel */}
          {infoOpen === disruption && (() => {
            const info = DISRUPTION_INFO[disruption];
            return (
              <div className="mb-8 bg-[#f8faff] border border-[#dbeafe] rounded-2xl p-5 text-left">
                <p className="text-[13px] text-[#374151] mb-4 leading-relaxed">{info.what}</p>
                <div className="mb-4">
                  <div className="text-[11px] font-black text-[#2563eb] uppercase tracking-wider mb-2">You may qualify if</div>
                  <ul className="flex flex-col gap-2">
                    {info.qualify.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[#374151]">
                        <span className="mt-0.5 w-4 h-4 rounded-full bg-[#dbeafe] text-[#2563eb] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 bg-white border border-[#e2e8f0] rounded-xl px-4 py-3">
                    <div className="text-[10px] font-black text-[#64748b] uppercase tracking-wider mb-1">Potential amount</div>
                    <div className="text-[13px] font-bold text-[#0f172a]">{info.amount}</div>
                  </div>
                  <div className="flex-1 bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3">
                    <div className="text-[10px] font-black text-[#92400e] uppercase tracking-wider mb-1">Useful tip</div>
                    <div className="text-[13px] text-[#78350f] leading-relaxed">{info.tip}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Region tabs */}
          <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden shadow-sm">
            <div className="flex border-b border-[#e2e8f0]">
              {(['eu', 'uk', 'il'] as Region[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`flex-1 py-3.5 text-[13px] font-bold transition-colors cursor-pointer border-none ${
                    region === r
                      ? 'bg-[#2563eb] text-white'
                      : 'bg-white text-[#64748b] hover:bg-white'
                  }`}
                >
                  {COMP_TABLE[r].flag} {r.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="p-5">
              <div className="mb-4">
                <div className="font-extrabold text-[15px] text-[#0f172a] mb-0.5">{comp.name}</div>
                <div className="text-[12px] text-[#64748b]">{comp.currency} · Claim limit: {comp.limit}</div>
                <div className="text-[12px] text-[#475569] mt-1 italic">Applies to: {comp.applies}</div>
              </div>

              {/* Delay threshold badges */}
              <div className="flex gap-2 flex-wrap mb-4">
                {(['eu','uk'].includes(region)) && (
                  <>
                    <span className="bg-[#f0fdf4] text-[#059669] border border-[#bbf7d0] rounded-full px-3 py-1 text-[11px] font-bold">🇪🇺 EU — 3+ hrs</span>
                    <span className="bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] rounded-full px-3 py-1 text-[11px] font-bold">🇬🇧 UK — 3+ hrs</span>
                  </>
                )}
                {region === 'il' && (
                  <span className="bg-[#fef9c3] text-[#92400e] border border-[#fde68a] rounded-full px-3 py-1 text-[11px] font-bold">🇮🇱 Israel — 8+ hrs</span>
                )}
              </div>

              <div className="rounded-xl overflow-hidden border border-[#e2e8f0]">
                <div className="grid grid-cols-3 bg-[#f1f5f9] text-[11px] font-black text-[#475569] uppercase tracking-wider">
                  <div className="px-4 py-2.5">Distance</div>
                  <div className="px-4 py-2.5">Min. Delay</div>
                  <div className="px-4 py-2.5">Compensation</div>
                </div>
                {comp.rows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-3 border-t border-[#e2e8f0] ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}>
                    <div className="px-4 py-3 text-[13px] font-semibold text-[#0f172a]">{row.range}</div>
                    <div className="px-4 py-3 text-[13px] text-[#64748b]">{row.hours}</div>
                    <div className="px-4 py-3 text-[14px] font-black text-[#2563eb]">{row.amount}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onNav('claim')}
                className="w-full mt-4 py-3.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-black text-[14px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-lg"
              >
                Check My Eligibility — Free
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[1020px] mx-auto text-center">
          <div className="inline-block bg-[#f0fdf4] text-[#059669] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Our Process</div>
          <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-2">How to Get Compensation</h2>
          <p className="text-[14px] text-[#64748b] mb-10 max-w-[500px] mx-auto">We've streamlined the process into three simple steps. Let us handle the bureaucracy while you plan your next trip.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                n: '01',
                title: 'Submit Your Flight Claim',
                desc: "It only takes minutes to finish! That way you'll find out your preliminary eligibility — and the size of the compensation.",
                color: '#2563eb',
              },
              {
                n: '02',
                title: 'We Fight For Your Rights',
                desc: 'Our experts check your eligibility in depth, contact the airlines, and work with the authorities on your behalf.',
                color: '#0891b2',
              },
              {
                n: '03',
                title: 'Receive Your Compensation',
                desc: "Once we receive the compensation, we will transfer the money to you, minus our fee. You don't pay if we don't win.",
                color: '#059669',
              },
            ].map((s, i) => (
              <div key={s.n} className="bg-white border border-[#e2e8f0] rounded-2xl p-7 text-left relative shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-[16px] mb-4" style={{ background: s.color }}>
                  {s.n}
                </div>
                <h3 className="text-[16px] font-extrabold text-[#0f172a] mb-2">{s.title}</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed">{s.desc}</p>
                {i < 2 && <div className="absolute right-[-18px] top-1/2 -translate-y-1/2 text-[22px] text-[#bfdbfe] hidden md:block z-10">→</div>}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNav('claim')}
            className="mt-8 bg-[#2563eb] text-white px-8 py-3.5 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all hover:bg-[#1d4ed8] hover:-translate-y-0.5 hover:shadow-lg"
          >
            Check Your Flight Now
          </button>
        </div>
      </div>

      {/* FEE SECTION */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[640px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-[#fef9c3] text-[#92400e] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Total Transparency</div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-2">Our Fee: Simple & Fair</h2>
            <p className="text-[14px] text-[#64748b]">30% on standard claims. 50% only if a lawyer is needed — and only when we win. No upfront costs, no hidden charges.</p>
          </div>

          {/* Worked example */}
          <div className="bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden shadow-sm mb-6">
            <div className="px-6 py-4 bg-[#f1f5f9] border-b border-[#e2e8f0]">
              <div className="text-[12px] font-bold text-[#64748b] uppercase tracking-wider">Worked Example — EU Flight Delay</div>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[14px] text-[#374151]">Compensation from airline</span>
                <span className="text-[16px] font-black text-[#059669]">€600</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[14px] text-[#374151]">ClaimVelo fee (30%)</span>
                <span className="text-[16px] font-black text-[#dc2626]">−€180</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4 bg-[#f0fdf4]">
                <span className="text-[15px] font-extrabold text-[#0f172a]">You receive</span>
                <span className="text-[20px] font-black text-[#059669]">€420</span>
              </div>
            </div>
            <div className="px-6 py-3 bg-white border-t border-[#e2e8f0]">
              <div className="text-[11px] text-[#94a3b8] italic">* Standard claim, no legal action needed. 50% applies if a lawyer is required.</div>
            </div>
          </div>

          {/* Fee pillars */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '€0', label: 'Zero upfront cost', desc: 'You never pay anything out of pocket. We take on all the risk.' },
              { icon: '⚖', label: 'No win, no fee — guaranteed', desc: "If we don't recover compensation for you, you owe us nothing." },
              { icon: '🏛', label: 'We fight in court too', desc: 'If the airline refuses, we escalate to court or ADR — still at no extra charge.' },
              { icon: '👁', label: 'Full transparency', desc: 'You see exactly how much we recover and exactly what we deduct before the transfer.' },
            ].map(p => (
              <div key={p.label} className="bg-white border border-[#e2e8f0] rounded-xl p-4">
                <div className="text-xl mb-2">{p.icon}</div>
                <div className="text-[13px] font-extrabold text-[#0f172a] mb-1">{p.label}</div>
                <div className="text-[12px] text-[#64748b] leading-relaxed">{p.desc}</div>
              </div>
            ))}
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => onNav('claim')}
              className="bg-[#0f2744] hover:bg-[#1a3a5c] text-white px-8 py-3.5 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Start Your Free Claim
            </button>
          </div>
        </div>
      </div>

      {/* WHY CHOOSE US COMPARISON */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Why Choose Us</div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-2">How We Compare</h2>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] overflow-x-auto shadow-sm">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-[#f1f5f9]">
                  <th className="px-5 py-3.5 text-left text-[12px] font-black text-[#475569] uppercase tracking-wider">Feature</th>
                  <th className="px-4 py-3.5 text-center text-[12px] font-black text-[#2563eb] uppercase tracking-wider bg-[#eff6ff]">ClaimVelo ✦</th>
                  <th className="px-4 py-3.5 text-center text-[12px] font-black text-[#475569] uppercase tracking-wider">DIY</th>
                  <th className="px-4 py-3.5 text-center text-[12px] font-black text-[#475569] uppercase tracking-wider">Others</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.feature} className={`border-t border-[#f1f5f9] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafbfc]'}`}>
                    <td className="px-5 py-3 text-[13px] text-[#374151] font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-center bg-[#f0f9ff]"><CellIcon val={row.us} /></td>
                    <td className="px-4 py-3 text-center"><CellIcon val={row.diy} /></td>
                    <td className="px-4 py-3 text-center"><CellIcon val={row.others} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TIME LIMITS */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-[#fee2e2] text-[#dc2626] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Don't Wait — Time Is Running Out</div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-2">Claim Time Limits By Country</h2>
            <p className="text-[14px] text-[#64748b] max-w-[500px] mx-auto">Delays from years ago may still be claimable — but each day reduces your window.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {TIME_LIMITS.map(l => (
              <div key={l.country} className="bg-white border border-[#e2e8f0] rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl shrink-0">{l.flag}</span>
                <div>
                  <div className="text-[13px] font-extrabold text-[#0f172a]">{l.country}</div>
                  <div className="text-[12px] font-black text-[#2563eb]">{l.years}</div>
                  <div className="text-[11px] text-[#94a3b8]">{l.from}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SERVICES */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[1020px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-block bg-[#f0fdf4] text-[#059669] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Our Services</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-2">You May Be Eligible to Receive Up to €600</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SERVICES.map(s => (
              <div key={s.title} className="border border-[#e2e8f0] rounded-2xl p-7 hover:shadow-md transition-all hover:-translate-y-0.5 group">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4" style={{ background: s.bg }}>
                  {s.icon}
                </div>
                <h3 className="text-[16px] font-extrabold text-[#0f172a] mb-2">{s.title}</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed mb-4">{s.desc}</p>
                <button
                  onClick={() => onNav('claim')}
                  className="text-[12px] font-bold border-none bg-transparent cursor-pointer transition-colors"
                  style={{ color: s.color }}
                >
                  Check My Flight →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WHY CHOOSE US PILLARS */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[1020px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-block bg-[#fef9c3] text-[#92400e] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Why Choose ClaimVelo</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-2">The Smart Way to Claim Your Rights</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: ShieldCheck,
                title: 'No Win, No Fee',
                desc: 'Zero risk. If we don\'t succeed, you don\'t pay a single cent. We deduct our fee only from the compensation we win.',
                color: '#059669', bg: '#f0fdf4',
              },
              {
                icon: Users,
                title: '350+ Airlines',
                desc: 'We handle claims against airlines globally, regardless of where they are based or where you flew.',
                color: '#2563eb', bg: '#eff6ff',
              },
              {
                icon: Scale,
                title: 'Expert Legal Team',
                desc: 'Our legal experts know every detail of aviation law to ensure you get the maximum possible payout.',
                color: '#d97706', bg: '#fffbeb',
              },
            ].map(w => {
              const Icon = w.icon;
              return (
                <div key={w.title} className="border border-[#e2e8f0] rounded-2xl p-7 text-center bg-white hover:shadow-md transition-shadow">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: w.bg }}>
                    <Icon className="w-7 h-7" style={{ color: w.color }} />
                  </div>
                  <div className="text-[17px] font-black text-[#0f172a] mb-3">{w.title}</div>
                  <p className="text-[13px] text-[#64748b] leading-relaxed">{w.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[1020px] mx-auto text-center">
          <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Real passengers, real money</div>
          <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-8">What Our Customers Say</h2>
          {testimonials.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white border border-[#e2e8f0] rounded-2xl p-6 animate-pulse">
                  <div className="h-3 bg-[#e2e8f0] rounded w-20 mb-4" />
                  <div className="space-y-2 mb-5">
                    <div className="h-3 bg-[#e2e8f0] rounded w-full" />
                    <div className="h-3 bg-[#e2e8f0] rounded w-4/5" />
                    <div className="h-3 bg-[#e2e8f0] rounded w-3/5" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#e2e8f0] shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-3 bg-[#e2e8f0] rounded w-20" />
                      <div className="h-2.5 bg-[#e2e8f0] rounded w-28" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {testimonials.slice(0, 3).map(t => (
                <div key={t.id} className="bg-white border border-[#e2e8f0] rounded-2xl p-6 text-left hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[#f59e0b] text-sm">{'★'.repeat(t.stars)}</div>
                    {t.amount && (
                      <span className="text-[11px] font-black text-[#059669] bg-[#f0fdf4] border border-[#bbf7d0] rounded-full px-2.5 py-0.5">{t.amount} won</span>
                    )}
                  </div>
                  <p className="text-[13px] text-[#374151] italic leading-relaxed mb-4">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#eff6ff] text-[#2563eb] font-black text-[11px] flex items-center justify-center shrink-0">{t.initials}</div>
                    <div>
                      <div className="font-bold text-[13px] text-[#0f172a]">{t.name}</div>
                      <div className="text-[11px] text-[#64748b]">{t.route}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAQ */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-block bg-[#f1f5f9] text-[#475569] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">FAQ</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a]">Frequently Asked Questions</h2>
          </div>
          {[
            { q: 'How much can I claim?', a: 'Up to €600 per passenger under EU261, £520 under UK261, or ₪3,530 under Israeli law — depending on your flight distance and disruption type. These amounts are fixed by regulation and unrelated to your ticket price.' },
            { q: 'How far back can I claim?', a: 'Up to 6 years in England & Wales, 5 years in Scotland and France, 4 years in Israel, and 3 years in most EU countries. The time limit applies from the date of the disrupted flight — so older flights may still be claimable.' },
            { q: 'What is "No Win, No Fee"?', a: 'It means you never pay anything upfront or out of pocket. Our 30% standard fee (or 50% if legal action is required) is only deducted from the compensation we recover for you. If we don\'t win, you owe us absolutely nothing.' },
            { q: 'What if the airline says it was extraordinary circumstances?', a: 'Airlines frequently misuse this exemption. Technical faults, crew shortages, and many "weather" claims are not legally extraordinary. We challenge every invalid rejection — and we usually win.' },
            { q: 'How long does the process take?', a: 'Most airlines settle within 2–8 weeks. If the airline disputes the claim, escalation to authorities or court can take 3–6 months. We handle everything — you just wait for payment.' },
            { q: 'Do you take cases to court?', a: 'Yes. If an airline refuses to pay, we escalate to the relevant National Enforcement Body or small claims court. If a lawyer is needed, our fee increases to 50% — still no upfront cost, and only payable if we win.' },
            { q: 'What documents do I need?', a: 'Just your booking confirmation and flight details to start. You can upload your boarding pass and any other supporting documents via your dashboard — we\'ll guide you on exactly what\'s needed for your specific claim.' },
            { q: 'Can I claim for a flight that was cancelled last year?', a: 'Yes, as long as it falls within the applicable time limit for your route. Check the country-specific windows above — flights from 2022 and 2023 may still be within the window depending on your jurisdiction.' },
          ].map((f, i) => {
            const isOpen = openFaq === String(i);
            return (
              <div key={i} className="border border-[#e2e8f0] rounded-xl mb-2 overflow-hidden bg-white">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : String(i))}
                  className="w-full px-5 py-4 font-semibold text-[13px] cursor-pointer flex justify-between items-center gap-3 bg-transparent border-none text-left hover:bg-white transition-colors text-[#0f172a]"
                >
                  <span>{f.q}</span>
                  <span className={`text-[#64748b] text-xl shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}>+</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-[13px] text-[#64748b] leading-relaxed border-t border-[#f1f5f9] pt-3">{f.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA BANNER */}
      <div className="py-16 px-5 text-white text-center" style={{ background: 'linear-gradient(135deg,#0f2744,#1d4ed8)' }}>
        <h2 className="text-[clamp(1.5rem,3vw,2.4rem)] font-black mb-3">Ready to Claim What's Yours?</h2>
        <p className="text-[15px] opacity-80 mb-8 max-w-[420px] mx-auto">Free check, no commitment. Thousands of passengers already paid.</p>
        <button
          onClick={() => onNav('claim')}
          className="bg-white text-[#1e3a8a] px-9 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer hover:bg-[#f0f9ff] transition-all hover:-translate-y-0.5 hover:shadow-xl"
        >
          Start Now — It's Free
        </button>
      </div>

      {/* FOOTER */}
      <footer className="bg-[#0f172a] text-[#94a3b8] py-10 px-5 text-center">
        <div className="font-black text-[16px] text-white mb-1">Claim<span className="text-[#60a5fa]">Velo</span></div>
        <div className="text-[12px] mb-4 opacity-70">Fighting for passenger rights worldwide</div>
        <div className="flex gap-5 justify-center flex-wrap mb-5">
          <button onClick={() => onNav('about')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">About</button>
          <button onClick={() => onNav('privacy')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Privacy Policy</button>
          <a href="mailto:support@claimvelo.com" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">support@claimvelo.com</a>
          <a href="tel:+13477688926" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">347 768 8926</a>
          <button onClick={() => onNav('how-it-works')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">How It Works</button>
          <button onClick={() => onNav('fees')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">Our Fees</button>
        </div>
        <div className="text-[11px] border-t border-[#1e293b] pt-4 opacity-60">
          © 2025 ClaimVelo · Passenger Rights Specialists · No Win, No Fee
        </div>
      </footer>
    </div>
  );
}
