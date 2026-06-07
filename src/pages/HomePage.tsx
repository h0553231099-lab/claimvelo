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

interface Props {
  onNav: (p: Page) => void;
  onCheckCompensation?: () => void;
  onPrefillClaim?: (data: { flight: string; fdate: string; dep: string; arr: string; airline: string; issue: string }) => void;
}

type DisruptionType = 'delay' | 'cancellation' | 'missed' | 'denied';
type Region = 'eu' | 'uk' | 'il';

const DISRUPTION_TYPES: { id: DisruptionType; label: string }[] = [
  { id: 'delay',        label: 'Flight Delay' },
  { id: 'cancellation', label: 'Cancellation' },
  { id: 'missed',       label: 'Missed Connection' },
  { id: 'denied',       label: 'Denied Boarding' },
];

const DISRUPTION_INFO: Record<DisruptionType, { what: string; qualify: string[]; amount: string; tip: string }> = {
  delay: {
    what: 'You qualify if your flight arrived at its final destination 3 or more hours late (EU/UK) or 8+ hours late (Israel), and the cause was within the airline\'s control.',
    qualify: [
      'Arrived at final destination 3+ hours late (EU/UK) or 8+ hours late (Israel)',
      'Delay caused by the airline, not extraordinary circumstances such as severe weather',
      'Flight departed from an EU/UK/IL airport, or operated by an EU/UK carrier into one',
    ],
    amount: 'Up to €600 / £520 per passenger depending on flight distance.',
    tip: 'Keep your boarding pass and any SMS or email alerts from the airline. Airlines must also provide meals and hotel if you are stranded overnight.',
  },
  cancellation: {
    what: 'A cancellation entitles you to cash compensation plus a full refund or re-routing, provided the airline told you with less than 14 days notice.',
    qualify: [
      'Informed of the cancellation fewer than 14 days before departure',
      'Cancellation was within the airline\'s control',
      'No acceptable re-routing was offered that arrived close to the original schedule',
    ],
    amount: 'Up to €600 / £520 per passenger, plus a full ticket refund or re-routing.',
    tip: 'Even if you boarded an alternative flight, you can still claim compensation if the cancellation notice was under 14 days.',
  },
  missed: {
    what: 'If a delay on your first flight caused you to miss a connecting flight booked on the same ticket, the total journey delay determines your entitlement.',
    qualify: [
      'Both flights were on the same booking reference',
      'Total arrival delay at final destination was 3+ hours',
      'The missed connection was caused by the airline, not a self-transfer',
    ],
    amount: 'Up to €600 per passenger based on total journey distance.',
    tip: 'Only single-booking itineraries are covered. Two separate tickets from different airlines are not.',
  },
  denied: {
    what: 'Being involuntarily bumped from an overbooked flight gives you the right to immediate compensation plus a refund or alternative routing.',
    qualify: [
      'You had a confirmed reservation and checked in on time',
      'The airline refused boarding against your will',
      'Flight operated under EU, UK, or Israeli jurisdiction',
    ],
    amount: 'Up to €600 / £520 per passenger, plus full refund or alternative flight.',
    tip: 'Do not sign any airline waiver at the gate — signing may waive your right to statutory cash compensation.',
  },
};

const COMP_TABLE = {
  eu: {
    flag: '🇪🇺',
    name: 'EU Regulation 261/2004',
    currency: 'EUR (€)',
    limit: '2–6 years (varies by country)',
    rows: [
      { range: 'Up to 1,500 km',    hours: '3+ hrs', amount: '€250' },
      { range: '1,500 – 3,500 km',  hours: '3+ hrs', amount: '€400' },
      { range: 'Over 3,500 km',     hours: '3+ hrs', amount: '€600' },
    ],
    applies: 'Flights departing any EU airport, or flights arriving in the EU operated by an EU-based airline.',
  },
  uk: {
    flag: '🇬🇧',
    name: 'UK261',
    currency: 'GBP (£)',
    limit: '6 years (England & Wales)',
    rows: [
      { range: 'Up to 1,500 km',   hours: '3+ hrs', amount: '£220' },
      { range: '1,500 – 3,500 km', hours: '3+ hrs', amount: '£350' },
      { range: 'Over 3,500 km',    hours: '4+ hrs', amount: '£520' },
    ],
    applies: 'Flights departing UK airports, or flights arriving in the UK operated by a UK-based airline. On routes over 3,500 km a 50% reduction applies if delay is between 3–4 hours.',
  },
  il: {
    flag: '🇮🇱',
    name: 'Israeli Aviation Services Law',
    currency: 'ILS (₪)',
    limit: '4 years',
    rows: [
      { range: 'Short-haul',  hours: '8+ hrs', amount: '₪1,470' },
      { range: 'Medium-haul', hours: '8+ hrs', amount: '₪2,390' },
      { range: 'Long-haul',   hours: '8+ hrs', amount: '₪3,530' },
    ],
    applies: 'Flights departing from Israeli airports. Amounts CPI-linked. Last updated: 2024.',
  },
};

const TIME_LIMITS = [
  { flag: '🇪🇺', country: 'EU (most countries)',    years: '3 years', from: 'from 2023' },
  { flag: '🇬🇧', country: 'UK (England & Wales)', years: '6 years', from: 'from 2020' },
  { flag: '🇬🇧', country: 'UK (Scotland)',         years: '5 years', from: 'from 2021' },
  { flag: '🇮🇱', country: 'Israel',                years: '4 years', from: 'from 2022' },
  { flag: '🇫🇷', country: 'France',                years: '5 years', from: 'from 2021' },
  { flag: '🇳🇱', country: 'Netherlands',           years: '3 years', from: 'from 2023' },
];

type Distance = 'short' | 'medium' | 'long';

const DISTANCE_OPTIONS: { id: Distance; label: string; range: string; amount: number }[] = [
  { id: 'short',  label: 'Short-haul',  range: 'Under 1,500 km',   amount: 250 },
  { id: 'medium', label: 'Medium-haul', range: '1,500 – 3,500 km', amount: 400 },
  { id: 'long',   label: 'Long-haul',   range: 'Over 3,500 km',    amount: 600 },
];

function CompensationCalculator({ onNav }: { onNav: (p: Page) => void }) {
  const [hours, setHours] = useState(4);
  const [distance, setDistance] = useState<Distance>('medium');

  const eligible = hours >= 3;
  const opt = DISTANCE_OPTIONS.find(o => o.id === distance)!;
  const amount = eligible ? opt.amount : 0;
  const sliderPct = (hours / 12) * 100;

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 shadow-sm">
      {/* Hours slider */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-bold text-[#475569] uppercase tracking-wider">Hours Delayed</span>
          <span
            className="text-[15px] font-bold px-3 py-1 rounded-lg transition-all"
            style={{
              background: hours < 3 ? '#fef2f2' : '#f0fdf4',
              color:      hours < 3 ? '#dc2626' : '#16a34a',
            }}
          >
            {hours < 12 ? `${hours}h` : '12h+'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          className="w-full h-2 rounded-full outline-none cursor-pointer"
          style={{
            appearance: 'none',
            background: `linear-gradient(to right, ${hours < 3 ? '#dc2626' : '#1d4ed8'} 0%, ${hours < 3 ? '#dc2626' : '#1d4ed8'} ${sliderPct}%, #e2e8f0 ${sliderPct}%, #e2e8f0 100%)`,
          }}
        />
        <div className="flex justify-between mt-2 px-0.5">
          {[0, 3, 6, 9, 12].map(h => (
            <span key={h} className={`text-[10px] font-semibold transition-colors ${hours === h ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
              {h === 12 ? '12+' : `${h}h`}
            </span>
          ))}
        </div>
        <p className="mt-2 text-center text-[12px] font-medium" style={{ color: hours < 3 ? '#dc2626' : '#16a34a' }}>
          {hours < 3 ? 'EU261 / UK261 require at least 3 hours — slide right' : hours < 8 ? 'Eligible under EU261 and UK261' : 'Eligible under EU261, UK261 and Israeli Law'}
        </p>
      </div>

      {/* Distance selector */}
      <div className="mb-8">
        <p className="text-[12px] font-bold text-[#475569] uppercase tracking-wider mb-3">Flight Distance</p>
        <div className="grid grid-cols-3 gap-2">
          {DISTANCE_OPTIONS.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setDistance(o.id)}
              className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 cursor-pointer transition-all text-center ${
                distance === o.id
                  ? 'border-[#1d4ed8] bg-[#eff6ff]'
                  : 'border-[#e2e8f0] bg-white hover:border-[#93c5fd]'
              }`}
            >
              <span className={`text-[12px] font-bold ${distance === o.id ? 'text-[#1d4ed8]' : 'text-[#374151]'}`}>{o.label}</span>
              <span className="text-[10px] text-[#94a3b8] leading-tight">{o.range}</span>
              <span className={`text-[13px] font-black mt-0.5 ${distance === o.id ? 'text-[#1d4ed8]' : 'text-[#475569]'}`}>€{o.amount}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Result */}
      <div
        className="rounded-xl p-5 text-center transition-all duration-300 border"
        style={{
          background: eligible ? '#f0fdf4' : '#fef2f2',
          borderColor: eligible ? '#bbf7d0' : '#fecaca',
        }}
      >
        {eligible ? (
          <>
            <p className="text-[11px] font-bold text-[#166534] uppercase tracking-widest mb-2">Estimated entitlement</p>
            <div className="flex items-start justify-center gap-1 mb-1">
              <span className="text-[20px] font-black text-[#166534] mt-2">€</span>
              <span className="text-[56px] font-black text-[#0f172a] leading-none tabular-nums transition-all duration-300">{amount.toLocaleString()}</span>
            </div>
            <p className="text-[12px] text-[#64748b] mb-5">per passenger · no win, no fee</p>
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-7 py-3.5 rounded-xl text-[14px] font-bold border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg shadow-sm"
            >
              Start Your Claim <ArrowRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold text-[#dc2626] mb-1">Delays under 3 hours generally don't qualify</p>
            <p className="text-[12px] text-[#64748b] mb-4">EU261 and UK261 require at least 3 hours of arrival delay.</p>
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-white border border-[#e2e8f0] hover:border-[#cbd5e1] text-[#374151] px-6 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all"
            >
              Not sure? Submit your claim anyway
            </button>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-[#94a3b8]">
        Based on EU Regulation 261/2004 fixed amounts. Actual compensation depends on route distance and circumstances.
      </p>
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
    <div className="bg-white">
      <ClaimModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e2e8f0]">
        <div className="max-w-[1100px] mx-auto px-6 py-16 sm:py-24">
          <div className="flex flex-col lg:flex-row items-start gap-12 lg:gap-20">

            {/* LEFT */}
            <div className="flex-1 min-w-0">
              <div className="inline-block text-[11px] font-semibold text-[#1d4ed8] bg-[#eff6ff] border border-[#bfdbfe] rounded-full px-3.5 py-1 mb-6 tracking-wide uppercase">
                EU261 · UK261 · Israeli Law
              </div>

              <h1 className="text-[clamp(2.2rem,5vw,3.4rem)] font-black text-[#0f172a] leading-[1.08] tracking-tight mb-5">
                Your flight was delayed.<br />
                <span className="text-[#1d4ed8]">Get up to €600 back.</span>
              </h1>

              <p className="text-[16px] sm:text-[17px] text-[#475569] leading-relaxed mb-8 max-w-[480px]">
                Airlines owe delayed passengers a fixed cash payment under EU law.
                We handle the entire claim — no paperwork, no legal fees unless we win.
              </p>

              <button
                onClick={() => onNav('claim')}
                className="inline-flex items-center gap-2.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-7 py-4 rounded-xl text-[15px] font-bold border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg shadow-md shadow-blue-900/20"
              >
                Check Eligibility — It's Free <ArrowRight className="w-5 h-5" />
              </button>

              <p className="mt-3 text-[12px] text-[#94a3b8]">No win, no fee. Takes about 2 minutes.</p>

              {/* Flight checker */}
              <div className="mt-10">
                <FlightCheckerWidget onNav={onNav} onPrefillClaim={onPrefillClaim} />
              </div>

              {/* Stats row */}
              <div className="flex gap-8 mt-10 flex-wrap">
                {([
                  ['€600',     'Max per passenger'],
                  ['350+',     'Airlines covered'],
                  ['30%',      'Commission if we win'],
                  ['€0',       'Upfront cost'],
                ] as [string, string][]).map(([v, l]) => (
                  <div key={l}>
                    <div className="text-[1.5rem] font-black text-[#0f172a] leading-none">{v}</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1 font-medium">{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: image */}
            <div className="w-full lg:w-[440px] shrink-0">
              <div className="relative rounded-2xl overflow-hidden border border-[#e2e8f0] shadow-xl shadow-slate-200/60">
                <img
                  src="https://images.pexels.com/photos/2026324/pexels-photo-2026324.jpeg?auto=compress&cs=tinysrgb&w=900"
                  alt="Passenger waiting at airport with delayed flight"
                  className="w-full h-[300px] sm:h-[360px] lg:h-[420px] object-cover object-center"
                  loading="eager"
                />
                {/* Floating card */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-white rounded-xl px-4 py-3 shadow-xl border border-[#e2e8f0] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#dbeafe] flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-[#1d4ed8]" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-[#0f172a]">Protected under EU261/2004</div>
                      <div className="text-[11px] text-[#64748b]">Fixed statutory amounts — no negotiation required</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <div className="bg-[#f8fafc] py-20 px-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">{t('home.process.badge')}</p>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-black text-[#0f172a] mb-3">{t('home.process.title')}</h2>
            <p className="text-[15px] text-[#64748b] max-w-[460px] mx-auto">{t('home.process.sub')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              { n: '1', title: t('home.process.s1.title'), desc: t('home.process.s1.desc') },
              { n: '2', title: t('home.process.s2.title'), desc: t('home.process.s2.desc') },
              { n: '3', title: t('home.process.s3.title'), desc: t('home.process.s3.desc') },
            ]).map((s, i) => (
              <div key={s.n} className="bg-white border border-[#e2e8f0] rounded-2xl p-7 relative hover:shadow-lg transition-shadow duration-300">
                <div className="w-10 h-10 rounded-full bg-[#1d4ed8] text-white font-black text-[15px] flex items-center justify-center mb-5">
                  {s.n}
                </div>
                <h3 className="text-[15px] font-bold text-[#0f172a] mb-2">{s.title}</h3>
                <p className="text-[13px] text-[#64748b] leading-relaxed">{s.desc}</p>
                {i < 2 && (
                  <div className="absolute right-[-14px] top-1/2 -translate-y-1/2 text-[#cbd5e1] hidden md:block z-10">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-8 py-3.5 rounded-xl text-[14px] font-bold border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              {t('home.process.btn')} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── COMPENSATION CALCULATOR ────────────────────────────────────── */}
      <div className="bg-white py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[620px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">Compensation Calculator</p>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-black text-[#0f172a] mb-3">How much are you owed?</h2>
            <p className="text-[15px] text-[#64748b] max-w-[400px] mx-auto">Select your delay length and route type for an instant estimate.</p>
          </div>
          <CompensationCalculator onNav={onNav} />
        </div>
      </div>

      {/* ── DISRUPTION SELECTOR + COMP TABLE ──────────────────────────── */}
      <div className="bg-[#f8fafc] py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[740px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">Eligibility & Amounts</p>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-3">What happened to your flight?</h2>
            <p className="text-[14px] text-[#64748b]">Select your situation to see the compensation you're entitled to.</p>
          </div>

          {/* Disruption tabs */}
          <div className="flex gap-2 flex-wrap justify-center mb-5">
            {DISRUPTION_TYPES.map(d => (
              <button
                key={d.id}
                onClick={() => setDisruption(d.id)}
                className={`px-4 py-2.5 rounded-lg text-[13px] font-semibold border transition-all cursor-pointer ${
                  disruption === d.id
                    ? 'bg-[#1d4ed8] border-[#1d4ed8] text-white shadow-sm'
                    : 'bg-white border-[#e2e8f0] text-[#374151] hover:border-[#93c5fd]'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Info toggle */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setInfoOpen(prev => prev === disruption ? null : disruption)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1d4ed8] hover:text-[#1e40af] transition-colors cursor-pointer bg-transparent border-none"
            >
              {infoOpen === disruption ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {infoOpen === disruption ? 'Hide details' : 'See eligibility details'}
            </button>
          </div>

          {/* Info panel */}
          {infoOpen === disruption && (() => {
            const info = DISRUPTION_INFO[disruption];
            return (
              <div className="mb-8 bg-white border border-[#e2e8f0] rounded-2xl p-6 text-left shadow-sm">
                <p className="text-[13px] text-[#374151] mb-5 leading-relaxed">{info.what}</p>
                <div className="mb-5">
                  <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-wider mb-3">You may qualify if</p>
                  <ul className="flex flex-col gap-2.5">
                    {info.qualify.map((q, i) => (
                      <li key={i} className="flex items-start gap-3 text-[13px] text-[#374151]">
                        <span className="mt-0.5 w-5 h-5 rounded-full bg-[#dbeafe] text-[#1d4ed8] flex items-center justify-center shrink-0 text-[10px] font-bold">{i + 1}</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">Potential amount</p>
                    <p className="text-[13px] font-semibold text-[#0f172a]">{info.amount}</p>
                  </div>
                  <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-[#92400e] uppercase tracking-wider mb-1">Practical tip</p>
                    <p className="text-[13px] text-[#431407] leading-relaxed">{info.tip}</p>
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
                  className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors cursor-pointer border-none ${
                    region === r ? 'bg-[#1d4ed8] text-white' : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
                  }`}
                >
                  {COMP_TABLE[r].flag} {r.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="p-5">
              <div className="mb-4">
                <p className="font-bold text-[15px] text-[#0f172a] mb-0.5">{comp.name}</p>
                <p className="text-[12px] text-[#64748b]">{comp.currency} · Claim limit: {comp.limit}</p>
                <p className="text-[12px] text-[#64748b] mt-1">{comp.applies}</p>
              </div>

              <div className="rounded-xl overflow-hidden border border-[#e2e8f0]">
                <div className="grid grid-cols-3 bg-[#f1f5f9] text-[10px] sm:text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                  <div className="px-4 py-2.5">Distance</div>
                  <div className="px-4 py-2.5">Min. Delay</div>
                  <div className="px-4 py-2.5">Compensation</div>
                </div>
                {comp.rows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-3 border-t border-[#e2e8f0] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafbfc]'}`}>
                    <div className="px-4 py-3 text-[12px] sm:text-[13px] font-semibold text-[#0f172a]">{row.range}</div>
                    <div className="px-4 py-3 text-[12px] sm:text-[13px] text-[#64748b]">{row.hours}</div>
                    <div className="px-4 py-3 text-[13px] sm:text-[14px] font-bold text-[#1d4ed8]">{row.amount}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onNav('claim')}
                className="w-full mt-4 py-3.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-[14px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-md"
              >
                Check My Eligibility — Free
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEES ──────────────────────────────────────────────────────── */}
      <div className="bg-white py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[600px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-3">Simple, transparent fees</h2>
            <p className="text-[14px] text-[#64748b]">30% on standard claims. 50% only if a lawyer is required — and only when we win.</p>
          </div>

          <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-sm mb-6">
            <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0]">
              <p className="text-[12px] font-bold text-[#475569] uppercase tracking-wider">Example — EU long-haul delay</p>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[14px] text-[#374151]">Compensation from airline</span>
                <span className="text-[15px] font-bold text-[#059669]">€600</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[14px] text-[#374151]">ClaimVelo fee (30%)</span>
                <span className="text-[15px] font-bold text-[#dc2626]">−€180</span>
              </div>
              <div className="flex items-center justify-between px-6 py-5 bg-[#f0fdf4]">
                <span className="text-[15px] font-bold text-[#0f172a]">You receive</span>
                <span className="text-[20px] font-black text-[#059669]">€420</span>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-[#e2e8f0]">
              <p className="text-[11px] text-[#94a3b8]">Standard claim with no court action needed. The 50% rate applies only if legal proceedings are required.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Zero upfront cost',       desc: 'You pay nothing to start. All costs are borne by us until we recover your compensation.' },
              { label: 'No win, no fee',           desc: "If we don't win, you owe us nothing. We only charge when money lands in your account." },
              { label: 'Court escalation included', desc: 'If the airline refuses, we escalate to court or ADR at no extra charge.' },
              { label: 'Full transparency',        desc: 'You see exactly how much we recover and exactly what we deduct before any transfer.' },
            ].map(p => (
              <div key={p.label} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4">
                <p className="text-[13px] font-bold text-[#0f172a] mb-1">{p.label}</p>
                <p className="text-[12px] text-[#64748b] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <button
              onClick={() => onNav('claim')}
              className="inline-flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-8 py-3.5 rounded-xl text-[14px] font-bold border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Start Your Free Claim <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── WHY CLAIMVELO ─────────────────────────────────────────────── */}
      <div className="bg-[#f8fafc] py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">Why ClaimVelo</p>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a] mb-3">Built for passengers, not airlines</h2>
            <p className="text-[14px] text-[#64748b] max-w-[420px] mx-auto">We handle the legal work. You get paid. That's the deal.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                Icon: ShieldCheck,
                title: 'No win, no fee',
                desc: "If we don't recover compensation, you pay nothing. We carry all the risk.",
                color: '#059669',
              },
              {
                Icon: Users,
                title: '350+ airlines covered',
                desc: 'We handle claims against any airline, regardless of country or alliance.',
                color: '#1d4ed8',
              },
              {
                Icon: Scale,
                title: 'Specialist legal team',
                desc: 'Our aviation lawyers know every tactic airlines use to reject claims — and how to counter them.',
                color: '#d97706',
              },
            ].map(({ Icon, title, desc, color }) => (
              <div key={title} className="bg-white border border-[#e2e8f0] rounded-2xl p-7 text-center hover:shadow-lg transition-shadow duration-300">
                <div className="w-12 h-12 rounded-xl border border-[#e2e8f0] flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-6 h-6" style={{ color }} />
                </div>
                <p className="text-[16px] font-bold text-[#0f172a] mb-2">{title}</p>
                <p className="text-[13px] text-[#64748b] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TIME LIMITS ───────────────────────────────────────────────── */}
      <div className="bg-white py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold text-[#dc2626] uppercase tracking-widest mb-3">Time-sensitive</p>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-black text-[#0f172a] mb-3">Claim time limits by country</h2>
            <p className="text-[14px] text-[#64748b] max-w-[460px] mx-auto">Flights from several years ago may still be claimable, but the window closes every day.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TIME_LIMITS.map(l => (
              <div key={l.country} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow duration-300">
                <span className="text-2xl shrink-0">{l.flag}</span>
                <div>
                  <p className="text-[13px] font-bold text-[#0f172a]">{l.country}</p>
                  <p className="text-[12px] font-semibold text-[#1d4ed8]">{l.years}</p>
                  <p className="text-[11px] text-[#94a3b8]">{l.from}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TESTIMONIALS (only when real data) ────────────────────────── */}
      {testimonials.length > 0 && (
        <div className="bg-[#f8fafc] py-20 px-6 border-t border-[#e2e8f0]">
          <div className="max-w-[1000px] mx-auto">
            <div className="text-center mb-10">
              <p className="text-[11px] font-bold text-[#1d4ed8] uppercase tracking-widest mb-3">Verified reviews</p>
              <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black text-[#0f172a]">What passengers say</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {testimonials.slice(0, 3).map(rev => (
                <div key={rev.id} className="bg-white border border-[#e2e8f0] rounded-2xl p-6 text-left hover:shadow-lg transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[#f59e0b] text-sm tracking-tight">{'★'.repeat(rev.stars)}</div>
                    {rev.amount && (
                      <span className="text-[11px] font-bold text-[#059669] bg-[#f0fdf4] border border-[#bbf7d0] rounded-full px-2.5 py-0.5">{rev.amount} {t('home.reviews.won')}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-[#374151] leading-relaxed mb-4">"{rev.text}"</p>
                  <div className="flex items-center gap-3 pt-3 border-t border-[#f1f5f9]">
                    <div className="w-8 h-8 rounded-full bg-[#dbeafe] text-[#1d4ed8] font-bold text-[11px] flex items-center justify-center shrink-0">{rev.initials}</div>
                    <div>
                      <p className="font-semibold text-[13px] text-[#0f172a]">{rev.name}</p>
                      <p className="text-[11px] text-[#64748b]">{rev.route}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <div className="bg-white py-20 px-6 border-t border-[#e2e8f0]">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold text-[#475569] uppercase tracking-widest mb-3">{t('faq.badge')}</p>
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
              <div key={i} className="border-b border-[#e2e8f0] last:border-0">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : String(i))}
                  className="w-full px-0 py-5 font-semibold text-[14px] cursor-pointer flex justify-between items-center gap-4 bg-transparent border-none text-left text-[#0f172a] hover:text-[#1d4ed8] transition-colors"
                >
                  <span>{f.q}</span>
                  <span className={`text-[#94a3b8] text-lg shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}>+</span>
                </button>
                {isOpen && (
                  <div className="pb-5 text-[14px] text-[#64748b] leading-relaxed">{f.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CTA BANNER ────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] py-20 px-6 text-center">
        <h2 className="text-[clamp(1.5rem,3vw,2.4rem)] font-black text-white mb-4">{t('cta.title')}</h2>
        <p className="text-[15px] text-[#94a3b8] mb-8 max-w-[400px] mx-auto">{t('cta.sub')}</p>
        <button
          onClick={() => onNav('claim')}
          className="inline-flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-9 py-4 rounded-xl text-[15px] font-bold border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl shadow-lg shadow-blue-900/30"
        >
          {t('cta.btn')} <ArrowRight className="w-5 h-5" />
        </button>
        <p className="mt-3 text-[12px] text-[#475569]">No win, no fee. Free to start.</p>
      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="bg-[#0f172a] border-t border-[#1e293b] text-[#64748b] py-10 px-6 text-center">
        <div className="font-black text-[16px] text-white mb-1">Claim<span className="text-[#60a5fa]">Velo</span></div>
        <div className="text-[12px] mb-5 opacity-70">{t('home.footer.tagline')}</div>
        <div className="flex gap-5 justify-center flex-wrap mb-5 text-[12px]">
          <button onClick={() => onNav('about')}      className="text-[#64748b] bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.about')}</button>
          <button onClick={() => onNav('privacy')}    className="text-[#64748b] bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.privacy')}</button>
          <a href="mailto:support@claimvelo.com"       className="text-[#64748b] no-underline hover:text-white transition-colors">support@claimvelo.com</a>
          <button onClick={() => onNav('how-it-works')} className="text-[#64748b] bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.how')}</button>
          <button onClick={() => onNav('fees')}       className="text-[#64748b] bg-transparent border-none cursor-pointer hover:text-white transition-colors">{t('home.footer.fees')}</button>
        </div>
        <div className="text-[11px] border-t border-[#1e293b] pt-5 opacity-50">
          {t('home.footer.copy')}
        </div>
      </footer>
    </div>
  );
}
