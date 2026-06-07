import { useState, useEffect } from 'react';
import { Page } from '../types';
import { useLang } from '../lib/language';
import { ShieldCheck, Scale, Users, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ClaimModal from '../components/ClaimModal';
import FlightCheckerWidget from '../components/FlightCheckerWidget';

interface Testimonial {
  id: string;
  name: string;
  initials: string;
  route: string;
  text: string;
  stars: number;
  amount: string | null;
}

interface Props { onNav: (p: Page) => void; onCheckCompensation?: () => void; onPrefillClaim?: (data: { flight: string; fdate: string; dep: string; arr: string; airline: string; issue: string }) => void; }

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
    desc: 'Bumped from your flight due to overbooking? You may be entitled to up to €600 / £520 per passenger.',
    icon: '🚫',
    color: '#2563eb',
    bg: '#eff6ff',
  },
];

type Distance = 'short' | 'medium' | 'long';

const DISTANCE_OPTIONS: { id: Distance; label: string; range: string; amount: number }[] = [
  { id: 'short',  label: 'Short-haul',  range: 'Under 1,500 km',      amount: 250 },
  { id: 'medium', label: 'Medium-haul', range: '1,500 – 3,500 km',    amount: 400 },
  { id: 'long',   label: 'Long-haul',   range: 'Over 3,500 km',       amount: 600 },
];

function CompensationCalculator({ onNav }: { onNav: (p: Page) => void }) {
  const [hours, setHours] = useState(4);
  const [distance, setDistance] = useState<Distance>('medium');

  const eligible = hours >= 3;
  const opt = DISTANCE_OPTIONS.find(o => o.id === distance)!;
  const amount = eligible ? opt.amount : 0;
  const sliderPct = (hours / 12) * 100;

  return (
    <div className="bg-white/[0.06] border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-sm">
      {/* Hours slider */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-white/70 uppercase tracking-wider">Hours Delayed</span>
          <span
            className="text-[18px] font-black px-3 py-0.5 rounded-lg transition-all"
            style={{
              background: hours < 3 ? 'rgba(220,38,38,0.2)' : 'rgba(22,163,74,0.2)',
              color: hours < 3 ? '#fca5a5' : '#86efac',
            }}
          >
            {hours < 12 ? `${hours}h` : '12h+'}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="w-full h-3 rounded-full outline-none cursor-pointer"
            style={{
              appearance: 'none',
              background: `linear-gradient(to right, ${hours < 3 ? '#ef4444' : '#22c55e'} 0%, ${hours < 3 ? '#ef4444' : '#22c55e'} ${sliderPct}%, rgba(255,255,255,0.12) ${sliderPct}%, rgba(255,255,255,0.12) 100%)`,
            }}
          />
          {/* Tick marks */}
          <div className="flex justify-between mt-1.5 px-0.5">
            {[0, 3, 6, 9, 12].map(h => (
              <div key={h} className="flex flex-col items-center gap-0.5">
                <div className={`text-[10px] font-bold transition-colors ${hours === h ? 'text-white' : 'text-white/30'}`}>{h === 12 ? '12+' : `${h}h`}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 text-center">
          <span className="text-[11px] font-semibold" style={{ color: hours < 3 ? '#fca5a5' : '#86efac' }}>
            {hours < 3
              ? 'EU261/UK261 requires 3+ hours — slide right'
              : hours < 8
              ? 'Eligible under EU261 / UK261'
              : 'Eligible under EU261, UK261 & Israeli Law'}
          </span>
        </div>
      </div>

      {/* Distance selector */}
      <div className="mb-7">
        <div className="text-[13px] font-bold text-white/70 uppercase tracking-wider mb-3">Flight Distance</div>
        <div className="grid grid-cols-3 gap-2">
          {DISTANCE_OPTIONS.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setDistance(o.id)}
              className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 cursor-pointer transition-all text-center ${
                distance === o.id
                  ? 'border-[#38bdf8] bg-[#38bdf8]/10 shadow-lg shadow-sky-900/40'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <span className={`text-[13px] font-black transition-colors ${distance === o.id ? 'text-[#38bdf8]' : 'text-white/80'}`}>{o.label}</span>
              <span className="text-[10px] text-white/40 leading-tight">{o.range}</span>
              <span className={`text-[13px] font-black mt-0.5 transition-colors ${distance === o.id ? 'text-white' : 'text-white/50'}`}>€{o.amount}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Result */}
      <div
        className="rounded-2xl p-5 text-center transition-all duration-500"
        style={{
          background: eligible
            ? 'linear-gradient(135deg, rgba(22,163,74,0.15) 0%, rgba(5,150,105,0.15) 100%)'
            : 'rgba(220,38,38,0.08)',
          border: eligible ? '2px solid rgba(22,163,74,0.35)' : '2px solid rgba(220,38,38,0.25)',
        }}
      >
        {eligible ? (
          <>
            <div className="text-[12px] font-bold text-emerald-400 uppercase tracking-widest mb-2">You could be owed</div>
            <div className="flex items-start justify-center gap-1 mb-1">
              <span className="text-[24px] font-black text-emerald-300 mt-2">€</span>
              <span className="text-[64px] font-black text-white leading-none tabular-nums transition-all duration-300">{amount.toLocaleString()}</span>
            </div>
            <div className="text-[12px] text-white/50 mb-5">per passenger · no win, no fee</div>
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-[#16a34a] hover:bg-[#15803d] text-white px-7 py-3.5 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl shadow-lg shadow-green-900/40"
            >
              Claim Now <ArrowRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <div className="text-[32px] mb-2">⚠️</div>
            <div className="text-[15px] font-black text-red-300 mb-1">Delays under 3 hours usually don't qualify</div>
            <div className="text-[12px] text-white/50 mb-4">EU261 and UK261 require at least 3 hours of arrival delay. Slide to 3h or more to see your entitlement.</div>
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white/80 px-6 py-3 rounded-xl text-[13px] font-semibold border border-white/15 cursor-pointer transition-all"
            >
              Still not sure? Submit your claim
            </button>
          </>
        )}
      </div>

      {/* Fine print */}
      <div className="mt-4 text-center text-[11px] text-white/30">
        Estimate based on EU Regulation 261/2004 fixed amounts. Actual compensation may vary.
      </div>
    </div>
  );
}

export default function HomePage({ onNav, onCheckCompensation, onPrefillClaim }: Props) {
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

      {/* FULL-WIDTH HEADER IMAGE */}
      <div className="relative w-full overflow-hidden" style={{ height: 'clamp(180px, 28vw, 340px)' }}>
        <img
          src="https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=1600"
          alt="Airport terminal with aircraft at gate"
          className="w-full h-full object-cover object-center"
          loading="eager"
        />
        {/* Dark gradient overlay — bottom fades into hero */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(12,31,63,0.65) 75%, #0c1f3f 100%)' }} />
        {/* Top-left branding strip */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white/20 rounded-lg backdrop-blur-sm flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </div>
            <span className="text-white font-black text-[15px] tracking-tight drop-shadow">Claim<span className="text-[#38bdf8]">Velo</span></span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-black/30 backdrop-blur-sm border border-white/20 rounded-full px-3.5 py-1.5 text-[11px] font-bold text-white/90 uppercase tracking-wider">
            ✈ No Win, No Fee · Free Eligibility Check
          </div>
        </div>
      </div>

      {/* HERO */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0c1f3f 0%,#0f2744 40%,#1a3a6e 100%)' }}>
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

        <div className="relative max-w-[1140px] mx-auto px-5 py-14 sm:py-20">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

            {/* LEFT: Copy */}
            <div className="flex-1 text-white text-center lg:text-left">
              {/* Top badge */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-[11px] font-bold mb-6 tracking-widest uppercase">
                ✈ {t('hero.badge')}
              </div>

              <h1 className="text-[clamp(2rem,4.5vw,3.2rem)] font-black leading-[1.1] mb-5">
                {t('hero.title1')}<br />
                <span className="text-[#38bdf8]">{t('hero.title2')}</span>
              </h1>

              <p className="text-[15px] sm:text-[16px] leading-relaxed opacity-85 mb-8 max-w-[500px] mx-auto lg:mx-0">
                Claim up to <strong>€600 per passenger</strong> under EU261, UK261 or Israeli Law.
                Free check. No win, no fee. Takes 2 minutes.
              </p>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-2.5 justify-center lg:justify-start mb-8">
                {[
                  { icon: '✅', label: '94% Success Rate' },
                  { icon: '🔒', label: '100% Secure' },
                  { icon: '⚡', label: 'Free Eligibility Check' },
                ].map(b => (
                  <span
                    key={b.label}
                    className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm"
                  >
                    <span>{b.icon}</span> {b.label}
                  </span>
                ))}
              </div>

              {/* CTA buttons */}
              <div className="flex gap-3 flex-wrap justify-center lg:justify-start">
                <button
                  onClick={() => onNav('claim')}
                  className="bg-[#16a34a] hover:bg-[#15803d] text-white px-7 py-4 rounded-xl text-[15px] font-black border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl shadow-lg shadow-green-900/40"
                >
                  Check If I'm Entitled – It's Free →
                </button>
                <button
                  onClick={() => onNav('how-it-works')}
                  className="bg-transparent text-white border-2 border-white/30 px-5 py-3.5 rounded-xl text-[13px] font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                >
                  {t('hero.how')}
                </button>
              </div>

              {/* Quick flight checker */}
              <div className="mt-7">
                <FlightCheckerWidget onNav={onNav} onPrefillClaim={onPrefillClaim} />
              </div>

              {/* Stats row */}
              <div className="flex gap-5 sm:gap-8 mt-10 flex-wrap justify-center lg:justify-start">
                {([
                  ['350+', 'Airlines Covered'],
                  ['30%', 'Standard Fee'],
                  ['€0', 'Upfront Cost'],
                  ['EU·UK·IL', 'Laws Covered'],
                ] as [string, string][]).map(([v, l]) => (
                  <div key={l} className="text-center lg:text-left">
                    <div className="text-[1.6rem] font-black leading-none text-white">{v}</div>
                    <div className="text-[10px] opacity-55 mt-1 font-medium uppercase tracking-wider">{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: Emotional image */}
            <div className="w-full lg:w-[460px] shrink-0">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
                <img
                  src="https://images.pexels.com/photos/2026324/pexels-photo-2026324.jpeg?auto=compress&cs=tinysrgb&w=900"
                  alt="Frustrated passenger waiting at airport with delayed flight board"
                  className="w-full h-[300px] sm:h-[380px] lg:h-[440px] object-cover object-center"
                  loading="eager"
                />
                {/* Overlay gradient for readability */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,25,50,0.55) 0%, transparent 50%)' }} />
                {/* Floating compensation badge */}
                <div className="absolute bottom-5 left-5 right-5">
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#dcfce7] flex items-center justify-center shrink-0 text-lg">💰</div>
                    <div>
                      <div className="text-[13px] font-black text-[#0f172a]">You could be owed up to €600</div>
                      <div className="text-[11px] text-[#64748b]">Per passenger · No win, no fee</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* COMPENSATION CALCULATOR */}
      <div className="py-14 px-5" style={{ background: 'linear-gradient(180deg, #0f2744 0%, #0c1f3f 100%)' }}>
        <div className="max-w-[680px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-white/10 border border-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Interactive Calculator</div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-white mb-2">How Much Are You Owed?</h2>
            <p className="text-[14px] text-white/60 max-w-[400px] mx-auto">Slide to your delay length and select your route distance for an instant estimate.</p>
          </div>
          <CompensationCalculator onNav={onNav} />
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

              {/* Legal notes */}
              {region === 'uk' && (
                <div className="mt-4 bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3 text-[12px] text-[#92400e] leading-relaxed">
                  <strong>UK261 long-haul note:</strong> If you accepted a re-routing offer that arrived within 4 hours of the original schedule, the airline may reduce long-haul (3,500+ km) compensation by 50% to £260. Full amounts apply when no acceptable alternative was offered.
                </div>
              )}
              {region === 'il' && (
                <div className="mt-4 bg-[#fef9c3] border border-[#fde68a] rounded-xl px-4 py-3 text-[12px] text-[#92400e] leading-relaxed">
                  <strong>Israeli law disclaimer:</strong> Compensation amounts are set by the Israeli Aviation Services Law (2012) and are subject to periodic adjustment. Rates shown are indicative — actual amounts may vary. Last reviewed: January 2025.
                </div>
              )}
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

      {/* WHAT YOU GET */}
      <div className="py-16 px-5 bg-white">
        <div className="max-w-[780px] mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Why Choose Us</div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-2">What You Get With ClaimVelo</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: '€0',
                title: 'No upfront cost — ever',
                desc: 'You pay nothing to start. We cover all costs of pursuing your claim, including any legal fees.',
              },
              {
                icon: '30%',
                title: '30% fee, only when we win',
                desc: 'Our standard commission is 30% of what we recover. If we don\'t win, you owe us nothing.',
              },
              {
                icon: '⚖',
                title: 'Legal escalation included',
                desc: 'If the airline refuses, we escalate to court or an ADR body. No extra charge — that\'s our commitment.',
              },
            ].map(item => (
              <div key={item.title} className="bg-white border border-[#e2e8f0] rounded-2xl p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <div className="text-[2rem] font-black text-[#2563eb] mb-3 leading-none">{item.icon}</div>
                <div className="text-[15px] font-extrabold text-[#0f172a] mb-2">{item.title}</div>
                <p className="text-[13px] text-[#64748b] leading-relaxed">{item.desc}</p>
              </div>
            ))}
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

      {/* TESTIMONIALS — only shown when real data exists */}
      {testimonials.length > 0 && (
        <div className="py-16 px-5 bg-white">
          <div className="max-w-[1020px] mx-auto text-center">
            <div className="inline-block bg-[#eff6ff] text-[#2563eb] text-[11px] font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">Real passengers, real money</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-8">Verified Customer Reviews</h2>
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
          </div>
        </div>
      )}

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
