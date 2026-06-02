import { useState, useEffect } from 'react';
import { Page } from '../types';
import { useLang } from '../lib/language';
import { ShieldCheck, Scale, Users, Check, X, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ClaimModal from '../components/ClaimModal';

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
  const [modalOpen, setModalOpen] = useState(false);

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
      <ClaimModal open={modalOpen} onClose={() => setModalOpen(false)} />
      {/* HERO */}
      <div className="relative overflow-hidden text-white text-center py-20 px-5" style={{ background: 'linear-gradient(135deg,#0f2744 0%,#1e3a8a 50%,#1d4ed8)' }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative max-w-[720px] mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold mb-6 tracking-wider uppercase">
            ✈ {t('hero.badge')}
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-black leading-[1.1] mb-5">
            {t('hero.title1')}<br />
            <span style={{ color: '#60a5fa' }}>{t('hero.title2')}</span>
          </h1>
          <p className="text-[16px] opacity-85 max-w-[480px] mx-auto mb-8 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => onNav('claim')}
              className="bg-[#16a34a] hover:bg-[#15803d] text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl text-[14px] sm:text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl shadow-lg shadow-green-900/30"
            >
              {t('hero.cta')}
            </button>
            <button
              onClick={() => onNav('how-it-works')}
              className="bg-transparent text-white border-2 border-white/30 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl text-[13px] sm:text-[14px] font-semibold cursor-pointer hover:bg-white/10 transition-colors"
            >
              {t('hero.how')}
            </button>
          </div>
          {/* Stats */}
          <div className="flex justify-center gap-5 sm:gap-8 mt-10 sm:mt-14 flex-wrap">
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
                    <div className="text-[13px] text-[#431407] leading-relaxed">{info.tip}</div>
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
                <div className="grid grid-cols-3 bg-[#f1f5f9] text-[10px] sm:text-[11px] font-black text-[#475569] uppercase tracking-wider">
                  <div className="px-3 sm:px-4 py-2.5">Distance</div>
                  <div className="px-3 sm:px-4 py-2.5">Min. Delay</div>
                  <div className="px-3 sm:px-4 py-2.5">Compensation</div>
                </div>
                {comp.rows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-3 border-t border-[#e2e8f0] ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}>
                    <div className="px-3 sm:px-4 py-3 text-[11px] sm:text-[13px] font-semibold text-[#0f172a]">{row.range}</div>
                    <div className="px-3 sm:px-4 py-3 text-[11px] sm:text-[13px] text-[#64748b]">{row.hours}</div>
                    <div className="px-3 sm:px-4 py-3 text-[12px] sm:text-[14px] font-black text-[#2563eb]">{row.amount}</div>
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
          <div className="inline-block bg-[#f0fdf4] text-[#059669] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">{t('home.process.badge')}</div>
          <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-2">{t('home.process.title')}</h2>
          <p className="text-[14px] text-[#64748b] mb-10 max-w-[500px] mx-auto">{t('home.process.sub')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              { n: '01', title: t('home.process.s1.title'), desc: t('home.process.s1.desc'), color: '#2563eb' },
              { n: '02', title: t('home.process.s2.title'), desc: t('home.process.s2.desc'), color: '#0891b2' },
              { n: '03', title: t('home.process.s3.title'), desc: t('home.process.s3.desc'), color: '#059669' },
            ]).map((s, i) => (
              <div key={s.n} className="bg-white border border-[#e2e8f0] rounded-2xl p-7 text-left relative shadow-sm hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
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
            {t('home.process.btn')}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div key={l.country} className="bg-white border border-[#e2e8f0] rounded-xl p-4 flex items-center gap-3 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
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
              <div key={s.title} className="border border-[#e2e8f0] rounded-2xl p-7 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 group">
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
                <div key={w.title} className="border border-[#e2e8f0] rounded-2xl p-7 text-center bg-white hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
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
              {testimonials.slice(0, 3).map(rev => (
                <div key={rev.id} className="bg-white border border-[#e2e8f0] rounded-2xl p-6 text-left hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[#f59e0b] text-sm">{'★'.repeat(rev.stars)}</div>
                    {rev.amount && (
                      <span className="text-[11px] font-black text-[#059669] bg-[#f0fdf4] border border-[#bbf7d0] rounded-full px-2.5 py-0.5">{rev.amount} {t('home.reviews.won')}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-[#374151] italic leading-relaxed mb-4">"{rev.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#eff6ff] text-[#2563eb] font-black text-[11px] flex items-center justify-center shrink-0">{rev.initials}</div>
                    <div>
                      <div className="font-bold text-[13px] text-[#0f172a]">{rev.name}</div>
                      <div className="text-[11px] text-[#64748b]">{rev.route}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEO CONTENT — 5 TOPIC SECTIONS */}
      <div className="bg-white py-4 px-5">
        <div className="max-w-[820px] mx-auto space-y-0">

          {/* ── FLIGHT DELAY ── */}
          <section className="py-14 border-b border-[#f1f5f9]">
            <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">EU261 · UK261 · Israeli Law</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-[#0f172a] leading-tight mb-4">
              Flight Delay Compensation:<br className="hidden sm:block" /> How to Claim Your Cash
            </h2>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-4">
              A flight delay can ruin a long-planned vacation, cause missed business opportunities, and leave you stranded at an airport terminal for hours. However, aviation regulations ensure that airlines pay for your lost time.
            </p>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-6">
              Depending on your itinerary and airline, you are legally protected by <strong>EU Regulation 261/2004</strong>, <strong>UK261</strong>, or the <strong>Israeli Aviation Services Law</strong>. These consumer-focused frameworks allow delayed passengers to claim direct cash payouts regardless of the original ticket price.
            </p>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { val: '€250', label: 'Minimum cash payout (short-haul)' },
                { val: '€600', label: 'Maximum cash payout per ticket' },
                { val: '6 yrs', label: 'Claim back up to 6 years' },
              ].map(s => (
                <div key={s.label} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 text-center">
                  <div className="text-[1.6rem] font-black text-[#2563eb] leading-none mb-1">{s.val}</div>
                  <div className="text-[11px] text-[#64748b] leading-snug">{s.label}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setModalOpen(true)} className="mb-8 inline-block bg-[#16a34a] hover:bg-[#15803d] hover:scale-[1.03] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all shadow-lg shadow-green-900/20">
              Check My Delay Claim Now →
            </button>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">When Are You Eligible for Flight Delay Compensation?</h3>
            <p className="text-[13px] text-[#374151] leading-relaxed mb-3">
              Your entitlement to a cash payout is determined by the <strong>total arrival delay at your final destination</strong>, not the departure delay at the gate.
            </p>
            <ul className="space-y-2 mb-6">
              {[
                <><strong>Delays of 3+ Hours (EU/UK Flights):</strong> If you land at your final destination 3 hours or more behind schedule on an eligible EU/UK flight, you are entitled to a fixed cash payout ranging from <strong>€250 to €600</strong>.</>,
                <><strong>Delays of 8+ Hours (Israeli Flights):</strong> Under Israeli law, a delay stretching past 8 hours triggers mandatory compensation ranging from <strong>₪1,390 to ₪3,340</strong> per passenger.</>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#dbeafe] text-[#2563eb] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">Your Right to Food, Care, and Hotels at the Airport</h3>
            <p className="text-[13px] text-[#374151] leading-relaxed mb-3">
              Airlines cannot abandon you during an extended delay. Once your delay crosses the 2-hour mark, the operating carrier must provide the following <strong>Right to Care</strong> amenities free of charge:
            </p>
            <ul className="space-y-2 mb-3">
              {[
                'Food and Beverage Vouchers — scaled appropriately to the length of your wait time.',
                'Complimentary Communication — access to two free phone calls, faxes, or internet access.',
                'Hotel Accommodations — if your flight is delayed overnight, the airline must pay for a hotel room and provide complimentary airport-to-hotel transport.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#f0fdf4] text-[#059669] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4 text-[13px] text-[#431407] leading-relaxed">
              <strong>Important:</strong> If the airline refuses to provide vouchers and you pay out of pocket, <strong>keep every itemized receipt</strong>. We will claim these back for you alongside your fixed cash compensation.
            </div>
          </section>

          {/* ── CANCELLATION ── */}
          <section className="py-14 border-b border-[#f1f5f9]">
            <div className="inline-block bg-[#fee2e2] text-[#dc2626] text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Refund + Cash Payout</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-[#0f172a] leading-tight mb-4">
              Flight Cancellation Compensation:<br className="hidden sm:block" /> Get Your Cash Refund
            </h2>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-4">
              When a carrier cancels a flight you are legally entitled to <strong>two separate things</strong>: a solution to get you to your destination (or your money back), and an extra cash payout for the severe disruption.
            </p>

            <button onClick={() => setModalOpen(true)} className="mb-8 inline-block bg-[#dc2626] hover:bg-[#b91c1c] hover:scale-[1.03] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all shadow-lg shadow-red-900/20">
              Claim My Cancelled Flight Cash →
            </button>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">The Dual Rights: Refund vs. Rerouting</h3>
            <p className="text-[13px] text-[#374151] leading-relaxed mb-3">If your flight is cancelled the airline must immediately offer you a clear choice:</p>
            <ul className="space-y-2 mb-6">
              {[
                <><strong>A Full Ticket Refund</strong> — a complete cash reimbursement of the unused ticket cost within 7–21 days.</>,
                <><strong>Alternative Transport</strong> — rerouting to your final destination on the next available flight, even on a rival airline.</>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#fee2e2] text-[#dc2626] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">When Does the Cash Payout Trigger?</h3>
            <p className="text-[13px] text-[#374151] leading-relaxed mb-3">
              You are entitled to fixed statutory compensation if the airline notified you of the cancellation <strong>less than 14 days before departure</strong>:
            </p>
            <div className="rounded-xl overflow-hidden border border-[#e2e8f0] mb-4">
              <div className="grid grid-cols-3 bg-[#f1f5f9] text-[10px] font-black text-[#475569] uppercase tracking-wider">
                <div className="px-4 py-2.5">Route type</div>
                <div className="px-4 py-2.5">Distance</div>
                <div className="px-4 py-2.5">Compensation</div>
              </div>
              {[
                ['Short-haul', 'Under 1,500 km', '€250 / ₪1,390'],
                ['Medium-haul', '1,500 – 3,500 km', '€400 / ₪2,220'],
                ['Long-haul', 'Over 3,500 km', '€600 / ₪3,340'],
              ].map(([type, dist, comp], i) => (
                <div key={i} className="grid grid-cols-3 border-t border-[#e2e8f0] bg-white">
                  <div className="px-4 py-3 text-[12px] font-semibold text-[#0f172a]">{type}</div>
                  <div className="px-4 py-3 text-[12px] text-[#64748b]">{dist}</div>
                  <div className="px-4 py-3 text-[13px] font-black text-[#dc2626]">{comp}</div>
                </div>
              ))}
            </div>
            <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-xl p-4 text-[13px] text-[#431407] leading-relaxed">
              <strong>Voucher warning:</strong> Airlines push travel vouchers because they often expire unused. Once you accept a voucher you may waive your right to a cash claim. We advise <strong>declining vouchers</strong>.
            </div>
          </section>

          {/* ── MISSED CONNECTION ── */}
          <section className="py-14 border-b border-[#f1f5f9]">
            <div className="inline-block bg-[#f0fdf4] text-[#059669] text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Single Booking Rule</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-[#0f172a] leading-tight mb-4">
              Missed Connecting Flight Compensation:<br className="hidden sm:block" /> Your Legal Rights
            </h2>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-4">
              If your first flight suffers a minor delay it can trigger a domino effect — causing you to miss your long-haul connection and leaving you stranded at a foreign transit airport. If the entire journey is on one booking reference, the law treats it as a single disrupted experience.
            </p>

            <button onClick={() => setModalOpen(true)} className="mb-8 inline-block bg-[#059669] hover:bg-[#047857] hover:scale-[1.03] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all shadow-lg shadow-green-900/20">
              Check My Connection Eligibility →
            </button>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">The Golden Rule: One Booking Reference (PNR)</h3>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {[
                { title: 'Single Ticket ✓', desc: 'The airline is legally responsible for your entire journey. A delay on leg one that causes you to miss leg two means free rebooking plus compensation.', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
                { title: 'Self-Transfer ✗', desc: 'Two separate tickets bought on different sites are unprotected. If you miss the second flight you must buy a new ticket yourself.', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
              ].map(c => (
                <div key={c.title} className="rounded-xl p-4 border" style={{ background: c.bg, borderColor: c.border }}>
                  <div className="text-[13px] font-extrabold mb-1" style={{ color: c.color }}>{c.title}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: c.color === '#059669' ? '#166534' : '#991b1b' }}>{c.desc}</div>
                </div>
              ))}
            </div>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">How Your Payout Is Calculated</h3>
            <p className="text-[13px] text-[#374151] leading-relaxed mb-3">
              Compensation is evaluated based on the <strong>final arrival delay at your ultimate destination</strong>. A 20-minute delay on a short hop that causes you to miss a transatlantic connection — resulting in a 5-hour delay overall — entitles you to a payout based on the total long-haul distance (up to <strong>€600 / ₪3,340</strong> per traveler).
            </p>
          </section>

          {/* ── DENIED BOARDING ── */}
          <section className="py-14 border-b border-[#f1f5f9]">
            <div className="inline-block bg-[#fef9c3] text-[#92400e] text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Overbooking / Bumping</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-[#0f172a] leading-tight mb-4">
              Denied Boarding Compensation:<br className="hidden sm:block" /> What to Do If You're Bumped
            </h2>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-4">
              Airlines routinely oversell tickets. When everyone shows up on time and the aircraft runs out of seats, airlines look to "bump" passengers. If you are denied boarding <strong>against your will</strong> despite checking in on time, international laws require <strong>immediate, substantial cash compensation right at the gate</strong>.
            </p>

            <button onClick={() => setModalOpen(true)} className="mb-8 inline-block bg-[#d97706] hover:bg-[#b45309] hover:scale-[1.03] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all shadow-lg shadow-amber-900/20">
              Claim Involuntary Bumping Payout →
            </button>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">Involuntary vs. Voluntary Bumping</h3>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {[
                { title: 'Voluntary Bumping', desc: 'If you sign the airline\'s waiver form you surrender your right to statutory cash compensation under EU261 or Israeli law.', bad: true },
                { title: 'Involuntary Bumping ✓', desc: 'If you refuse to step down but the airline denies you access anyway, you keep your full statutory rights — up to €600 / ₪3,340 plus an alternative flight.', bad: false },
              ].map(c => (
                <div key={c.title} className={`rounded-xl p-4 border ${c.bad ? 'bg-[#fef2f2] border-[#fecaca]' : 'bg-[#f0fdf4] border-[#bbf7d0]'}`}>
                  <div className={`text-[13px] font-extrabold mb-1 ${c.bad ? 'text-[#dc2626]' : 'text-[#059669]'}`}>{c.title}</div>
                  <div className={`text-[12px] leading-relaxed ${c.bad ? 'text-[#991b1b]' : 'text-[#166534]'}`}>{c.desc}</div>
                </div>
              ))}
            </div>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">Immediate Steps to Take at the Gate</h3>
            <ul className="space-y-2">
              {[
                <><strong>Get It in Writing</strong> — ask the gate agent for a written statement that you were denied boarding due to overbooking.</>,
                <><strong>Keep Your Boarding Pass</strong> — your physical ticket or digital boarding pass is your core proof of check-in compliance.</>,
                <><strong>Demand Immediate Cash</strong> — under several jurisdictions you can request your compensation directly at the service desk before leaving the airport.</>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#fef9c3] text-[#92400e] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── UK261 ── */}
          <section className="py-14">
            <div className="inline-block bg-[#e0f2fe] text-[#0369a1] text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Post-Brexit UK Law</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-[#0f172a] leading-tight mb-4">
              UK261 Regulation: Passenger<br className="hidden sm:block" /> Compensation for UK Flights
            </h2>
            <p className="text-[14px] text-[#374151] leading-relaxed mb-4">
              Following Brexit the British Government transitioned EU passenger protections directly into domestic UK law — known as <strong>The Air Passenger Rights Regulations (UK261)</strong>. If you experienced a disruption traveling to or from London Heathrow, Gatwick, Luton, Manchester, or any other UK airport, ClaimVelo can help you claim up to <strong>£520</strong> per ticket.
            </p>

            <button onClick={() => setModalOpen(true)} className="mb-8 inline-block bg-[#0369a1] hover:bg-[#075985] hover:scale-[1.03] text-white px-8 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all shadow-lg shadow-sky-900/20">
              Check My UK261 Flight Claim →
            </button>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">Which Flights Fall Under UK261?</h3>
            <ul className="space-y-2 mb-6">
              {[
                'Any flight departing from a UK airport — regardless of the airline\'s nationality.',
                'Any flight landing at a UK airport operated by a UK-based carrier (e.g. British Airways, EasyJet).',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#e0f2fe] text-[#0369a1] flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>

            <h3 className="text-[1.15rem] font-black text-[#0f172a] mb-3">UK261 Compensation Rates (in GBP £)</h3>
            <div className="rounded-xl overflow-hidden border border-[#e2e8f0] mb-4">
              <div className="grid grid-cols-3 bg-[#f1f5f9] text-[10px] font-black text-[#475569] uppercase tracking-wider">
                <div className="px-4 py-2.5">Distance</div>
                <div className="px-4 py-2.5">Min. Delay</div>
                <div className="px-4 py-2.5">Compensation</div>
              </div>
              {[
                ['Under 1,500 km', '3+ hrs', '£220'],
                ['1,500 – 3,500 km', '3+ hrs', '£350'],
                ['Over 3,500 km', '3+ hrs', '£520'],
              ].map(([dist, delay, comp], i) => (
                <div key={i} className="grid grid-cols-3 border-t border-[#e2e8f0] bg-white">
                  <div className="px-4 py-3 text-[12px] font-semibold text-[#0f172a]">{dist}</div>
                  <div className="px-4 py-3 text-[12px] text-[#64748b]">{delay}</div>
                  <div className="px-4 py-3 text-[13px] font-black text-[#0369a1]">{comp}</div>
                </div>
              ))}
            </div>
            <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl p-4 text-[13px] text-[#0c4a6e] leading-relaxed">
              <strong>Note on EU carriers:</strong> If you fly from Tel Aviv to London on an EU-based carrier like Wizz Air or Lufthansa, your flight is protected by <strong>EU261</strong> instead of UK261. The financial protections are identical but the legal filing path differs — ClaimVelo handles both.
            </div>
          </section>

        </div>
      </div>

      {/* FAQ */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-block bg-[#f1f5f9] text-[#475569] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">{t('faq.badge')}</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a]">{t('faq.title')}</h2>
          </div>
          {([
            { q: t('faq.q1'), a: t('faq.a1') },
            { q: t('faq.q2'), a: t('faq.a2') },
            { q: t('faq.q3'), a: t('faq.a3') },
            { q: t('faq.q4'), a: t('faq.a4') },
            { q: t('faq.q5'), a: t('faq.a5') },
            { q: t('faq.q6'), a: t('faq.a6') },
            { q: t('faq.q7'), a: t('faq.a7') },
            { q: t('faq.q8'), a: t('faq.a8') },
          ] as { q: string; a: string }[]).map((f, i) => {
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
        <h2 className="text-[clamp(1.5rem,3vw,2.4rem)] font-black mb-3">{t('cta.title')}</h2>
        <p className="text-[15px] opacity-80 mb-8 max-w-[420px] mx-auto">{t('cta.sub')}</p>
        <button
          onClick={() => onNav('claim')}
          className="bg-[#16a34a] hover:bg-[#15803d] text-white px-9 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl shadow-lg shadow-green-900/30"
        >
          {t('cta.btn')}
        </button>
      </div>

      {/* FOOTER */}
      <footer className="bg-[#0f172a] text-[#94a3b8] py-10 px-5 text-center">
        <div className="font-black text-[16px] text-white mb-1">Claim<span className="text-[#60a5fa]">Velo</span></div>
        <div className="text-[12px] mb-4 opacity-70">{t('home.footer.tagline')}</div>
        <div className="flex gap-5 justify-center flex-wrap mb-5">
          <button onClick={() => onNav('about')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.about')}</button>
          <button onClick={() => onNav('privacy')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.privacy')}</button>
          <a href="mailto:support@claimvelo.com" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">support@claimvelo.com</a>
          <a href="tel:+13477688926" className="text-[#94a3b8] no-underline text-xs hover:text-white transition-colors">347 768 8926</a>
          <button onClick={() => onNav('how-it-works')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.how')}</button>
          <button onClick={() => onNav('fees')} className="text-[#94a3b8] text-xs bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.fees')}</button>
        </div>
        <div className="text-[11px] border-t border-[#1e293b] pt-4 opacity-60">
          {t('home.footer.copy')}
        </div>
      </footer>
    </div>
  );
}
