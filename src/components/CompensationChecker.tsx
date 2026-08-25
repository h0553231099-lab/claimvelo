import { useState } from 'react';
import {
  X, PlaneTakeoff, PlaneLanding, Star, ArrowRight, Lock, CheckCircle2,
  Clock, Ban, Luggage, Link, Search, AlertTriangle, Users, Calendar,
  ChevronRight, Shield, Scale, Plane,
} from 'lucide-react';
import AirportInput from './AirportInput';
import {
  type Jurisdiction, type DisruptionType, type AirlineReason,
  calculateCompensation, detectJurisdiction, isWithinClaimWindow,
  formatDelay, routeDistanceKm, isExtraordinary,
  AIRLINE_REASON_OPTIONS, NOTICE_OPTIONS,
  type CompensationResult,
} from '../lib/compensation';
import { lookupFlight, type FlightLookupResult } from '../lib/supabase';

export interface CheckerPrefill {
  dep: string;
  arr: string;
  issue: string;
  fdate?: string;
  estimatedAmount: number;
  flight?: string;
  airline?: string;
  jurisdiction?: Jurisdiction;
  passengers?: number;
}

interface Props {
  onClose: () => void;
  onStartClaim: (prefill: CheckerPrefill) => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const ISSUES: { id: DisruptionType; label: string; desc: string; Icon: typeof Clock }[] = [
  { id: 'delay', label: 'Flight Delay', desc: 'Arrived 3+ hours late (EU/UK) or 8+ hours (Israel)', Icon: Clock },
  { id: 'cancelled', label: 'Cancellation', desc: 'Flight was cancelled', Icon: Ban },
  { id: 'missed', label: 'Missed Connection', desc: 'Missed a connecting flight on the same booking', Icon: Link },
  { id: 'denied', label: 'Denied Boarding', desc: 'Bumped or overbooked', Icon: Ban },
  { id: 'baggage', label: 'Baggage Problem', desc: 'Lost, damaged or delayed bag', Icon: Luggage },
];

const DELAY_OPTS = [
  { id: 'lt2', label: 'Less than 2 hours', sub: 'Below threshold — care expenses may apply', min: 90 },
  { id: '2to3', label: '2 – 3 hours', sub: 'Partial — may qualify in some cases', min: 150 },
  { id: '3to4', label: '3 – 4 hours', sub: 'Full compensation (reduced for long-haul)', min: 210 },
  { id: 'gt4', label: 'More than 4 hours', sub: 'Maximum compensation tier', min: 300 },
];

const PASSENGER_OPTS = [1, 2, 3, 4, 5, 6];

const JURISDICTION_LABELS: Record<Jurisdiction, { flag: string; name: string; symbol: string }> = {
  eu: { flag: '🇪🇺', name: 'EU261', symbol: '€' },
  uk: { flag: '🇬🇧', name: 'UK261', symbol: '£' },
  il: { flag: '🇮🇱', name: 'Israeli Law', symbol: '₪' },
  us: { flag: '🇺🇸', name: 'US DOT', symbol: '$' },
};

const STEPS = [
  { label: 'Your Route', sub: 'Where did you fly?' },
  { label: 'Disruption', sub: 'What went wrong?' },
  { label: 'Details', sub: 'Flight date & passengers' },
  { label: 'Airline Reason', sub: 'What did the airline say?' },
  { label: 'Result', sub: 'Your entitlement' },
];

export default function CompensationChecker({ onClose, onStartClaim }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Route
  const [dep, setDep] = useState('');
  const [arr, setArr] = useState('');
  const [flightNumber, setFlightNumber] = useState('');

  // Disruption
  const [issue, setIssue] = useState<DisruptionType | ''>('');
  const [delay, setDelay] = useState('');

  // Date & passengers
  const [fdate, setFdate] = useState('');
  const [passengers, setPassengers] = useState(1);

  // Cancellation-specific
  const [noticeDays, setNoticeDays] = useState<number | ''>('');
  const [offeredAlternative, setOfferedAlternative] = useState<boolean | null>(null);
  const [altArrivalDelta, setAltArrivalDelta] = useState<number | ''>('');

  // Airline reason
  const [airlineReason, setAirlineReason] = useState<AirlineReason | ''>('');

  // Live lookup
  const [liveFlight, setLiveFlight] = useState<FlightLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Result
  const [result, setResult] = useState<CompensationResult | null>(null);
  const [autoJurisdiction, setAutoJurisdiction] = useState<Jurisdiction>('eu');

  // ── Helpers ──────────────────────────────────────────────────────────────
  function extractCode(s: string): string | undefined {
    const m = s.match(/\(([A-Z]{3})\)/);
    return m?.[1] || undefined;
  }

  function depCode() { return extractCode(dep); }
  function arrCode() { return extractCode(arr); }

  function canContinue() {
    if (step === 1) return dep.trim().length > 0 && arr.trim().length > 0;
    if (step === 2) return issue.length > 0;
    if (step === 3) {
      if (!fdate) return false;
      if (issue === 'delay' && !delay) return false;
      if (issue === 'cancelled') {
        if (noticeDays === '') return false;
        if (offeredAlternative === null) return false;
        if (offeredAlternative && altArrivalDelta === '') return false;
      }
      return true;
    }
    if (step === 4) return true; // airline reason is optional
    return true;
  }

  async function tryLiveLookup() {
    const fn = flightNumber.trim();
    if (fn.length < 2 || !fdate) return;
    setLookupLoading(true);
    setLookupError('');
    setLiveFlight(null);
    try {
      const { flights, error } = await lookupFlight(fn.toUpperCase(), fdate, depCode(), arrCode());
      if (error) {
        setLookupError(error);
      } else if (flights.length > 0) {
        setLiveFlight(flights[0]);
      }
    } catch {
      setLookupError('Network error — please try again');
    }
    setLookupLoading(false);
  }

  function computeResult(): CompensationResult {
    const depC = depCode();
    const arrC = arrCode();
    const jur = detectJurisdiction(depC, arrC);
    setAutoJurisdiction(jur);

    let delayMin = 0;
    if (issue === 'delay') {
      const opt = DELAY_OPTS.find(o => o.id === delay);
      delayMin = opt?.min ?? 0;
      // If we have live data, use actual delay
      if (liveFlight && liveFlight.delayMin > 0) {
        delayMin = liveFlight.delayMin;
      }
    } else if (issue === 'missed' && liveFlight) {
      delayMin = liveFlight.delayMin;
    }

    return calculateCompensation({
      jurisdiction: jur,
      disruption: issue as DisruptionType,
      delayMin,
      depCode: depC,
      arrCode: arrC,
      passengers,
      airlineReason: airlineReason || undefined,
      noticeDays: noticeDays === '' ? undefined : noticeDays,
      offeredAlternative: offeredAlternative ?? undefined,
      altArrivalDeltaMin: altArrivalDelta === '' ? undefined : altArrivalDelta,
    });
  }

  function next() {
    if (!canContinue()) return;

    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      // Try live lookup if flight number was provided
      if (flightNumber.trim().length >= 2) {
        tryLiveLookup();
      }
      setStep(4);
    } else if (step === 4) {
      const res = computeResult();
      setResult(res);
      setStep(5);
    } else {
      setStep(s => (s + 1) as Step);
    }
  }

  function back() {
    if (step > 1) setStep(s => (s - 1) as Step);
  }

  function mappedIssue(): string {
    const map: Record<string, string> = {
      delay: 'Flight Delayed',
      cancelled: 'Flight Cancelled',
      missed: 'Missed Connecting Flight',
      denied: 'Denied Boarding',
      baggage: 'Something Else',
    };
    return map[issue as string] || 'Flight Delayed';
  }

  function issueLabel(): string {
    return ISSUES.find(i => i.id === issue)?.label || issue;
  }

  // ── Progress tracking ────────────────────────────────────────────────────
  const totalSteps = 5;
  const currentVisual = Math.min(step, totalSteps);
  const progressPct = step === 5 ? 100 : ((currentVisual - 1) / totalSteps) * 90;
  const activeSidebarIdx = Math.min(step - 1, 4);

  const claimWindow = fdate ? isWithinClaimWindow(fdate) : null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[860px] bg-white rounded-3xl shadow-2xl overflow-hidden flex"
        style={{ maxHeight: '92vh', minHeight: 540 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <div
          className="w-[260px] shrink-0 flex flex-col justify-between p-7 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #0f2744 0%, #1a3a6b 60%, #1e4db7 100%)' }}
        >
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Ccircle cx='20' cy='20' r='1.5'/%3E%3C/g%3E%3C/svg%3E\")" }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-7">
              <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
                <PlaneTakeoff className="w-4 h-4 text-white" />
              </div>
              <span className="text-[13px] font-bold tracking-wide opacity-90">ClaimVelo</span>
            </div>

            <div className="text-[16px] font-extrabold leading-snug mb-7 text-white/95">
              Check your compensation in 60 seconds
            </div>

            <div className="flex flex-col gap-4">
              {STEPS.map((s, i) => {
                const active = i === activeSidebarIdx;
                const done = i < activeSidebarIdx;
                return (
                  <div key={s.label} className="flex gap-3 items-start">
                    <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${done ? 'bg-emerald-400 text-white' : active ? 'bg-white text-[#1a3a6b]' : 'bg-white/10 text-white/30 border border-white/20'}`}>
                        {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`w-px h-7 transition-all ${done ? 'bg-emerald-400/50' : 'bg-white/15'}`} />
                      )}
                    </div>
                    <div className="pt-0.5">
                      <div className={`text-[13px] font-bold transition-all ${active ? 'text-white' : done ? 'text-emerald-300' : 'text-white/35'}`}>{s.label}</div>
                      <div className={`text-[11px] mt-0.5 transition-all ${active ? 'text-white/70' : 'text-white/25'}`}>{s.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-6 pt-5 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-[11px] text-white/80 font-semibold ml-1">4.6 / 5</span>
            </div>
            <div className="text-[10px] text-white/45">27,719 reviews · Reviews.io</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {['Forbes', 'The Times', 'USA Today'].map(m => (
                <span key={m} className="text-[8px] font-black text-white/30 uppercase tracking-widest">{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-7 pt-6 pb-4 shrink-0 border-b border-slate-100">
            <div className="flex-1 mr-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Progress</span>
                <span className="text-[11px] font-bold text-slate-400">{Math.round(progressPct)}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)' }}
                />
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer border-none transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-7 py-6">

            {/* Step 1 — airports + flight number */}
            {step === 1 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">Where did you fly?</h2>
                  <p className="text-[13px] text-slate-500">Enter your departure and arrival airports. Flight number is optional but helps us verify live data.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Departure airport</label>
                    <div className="relative">
                      <AirportInput
                        value={dep}
                        onChange={setDep}
                        placeholder="City or airport code — e.g. Paris, CDG"
                        className="!border-slate-200 !bg-slate-50 !rounded-2xl !text-[14px] !py-4 !pl-12 !pr-4 focus:!border-blue-500 focus:!bg-white !transition-all"
                      />
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-blue-50 rounded-xl flex items-center justify-center pointer-events-none">
                        <PlaneTakeoff className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Destination airport</label>
                    <div className="relative">
                      <AirportInput
                        value={arr}
                        onChange={setArr}
                        placeholder="City or airport code — e.g. Berlin, BER"
                        className="!border-slate-200 !bg-slate-50 !rounded-2xl !text-[14px] !py-4 !pl-12 !pr-4 focus:!border-blue-500 focus:!bg-white !transition-all"
                      />
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-slate-100 rounded-xl flex items-center justify-center pointer-events-none">
                        <PlaneLanding className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    </div>
                  </div>

                  {/* Optional flight number */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Flight number <span className="text-slate-400 normal-case font-normal">(optional — for live verification)</span>
                    </label>
                    <div className="relative">
                      <Plane className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={flightNumber}
                        onChange={e => setFlightNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. FR1234, BA2490"
                        maxLength={10}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-[14px] outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    {flightNumber.trim().length >= 2 && (
                      <div className="mt-2 flex items-center gap-2 text-[12px] text-blue-600">
                        <Search className="w-3.5 h-3.5" />
                        We'll look up this flight's actual delay data automatically.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — issue type */}
            {step === 2 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">What went wrong?</h2>
                  <p className="text-[13px] text-slate-500">Select the disruption that best describes your situation.</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {ISSUES.map(opt => {
                    const selected = issue === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setIssue(opt.id)}
                        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-blue-600' : 'bg-slate-100'}`}>
                          <opt.Icon className={`w-4 h-4 ${selected ? 'text-white' : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[14px] font-bold transition-all ${selected ? 'text-blue-700' : 'text-slate-800'}`}>{opt.label}</div>
                          <div className={`text-[12px] transition-all ${selected ? 'text-blue-500' : 'text-slate-400'}`}>{opt.desc}</div>
                        </div>
                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3 — date, passengers, delay/cancellation details */}
            {step === 3 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">When did it happen?</h2>
                  <p className="text-[13px] text-slate-500">You can claim for flights up to 6 years ago in most countries.</p>
                </div>

                <div className="space-y-4">
                  {/* Flight date */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Flight date</label>
                    <input
                      type="date"
                      value={fdate}
                      onChange={e => setFdate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-[14px] outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    {fdate && claimWindow && (
                      <div className={`mt-2 flex items-center gap-2 p-2.5 rounded-xl text-[12px] ${claimWindow.within ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {claimWindow.within
                          ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> Within claim window ({claimWindow.label})</>
                          : <><AlertTriangle className="w-4 h-4 shrink-0" /> Outside claim window ({claimWindow.label}) — your claim may be time-barred</>
                        }
                      </div>
                    )}
                  </div>

                  {/* Passengers */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">How many passengers are claiming?</label>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {PASSENGER_OPTS.map(n => (
                          <button
                            key={n}
                            onClick={() => setPassengers(n)}
                            className={`w-10 h-10 rounded-xl text-[14px] font-bold border-2 cursor-pointer transition-all ${passengers === n ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                          >
                            {n}
                          </button>
                        ))}
                        {passengers > 6 && (
                          <span className="flex items-center px-3 text-[14px] font-bold text-blue-700">{passengers}</span>
                        )}
                      </div>
                      {passengers <= 6 && (
                        <button
                          onClick={() => setPassengers(7)}
                          className="px-3 py-2 text-[12px] font-semibold text-blue-600 bg-transparent border-none cursor-pointer hover:underline"
                        >
                          7+
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delay duration (only for delay) */}
                  {issue === 'delay' && (
                    <div>
                      <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">How long was the delay?</label>
                      <p className="text-[11px] text-slate-400 mb-2">Measured at your final destination on arrival.</p>
                      {liveFlight && liveFlight.delayMin > 0 && (
                        <div className="mb-2 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-700">
                          <Search className="w-4 h-4 shrink-0" />
                          Live data shows: <strong>{formatDelay(liveFlight.delayMin)}</strong> actual delay — we'll use this automatically.
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2.5">
                        {DELAY_OPTS.map(opt => {
                          const selected = delay === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setDelay(opt.id)}
                              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-blue-600' : 'bg-slate-100'}`}>
                                <Clock className={`w-4 h-4 ${selected ? 'text-white' : 'text-slate-500'}`} />
                              </div>
                              <div className="flex-1">
                                <div className={`text-[14px] font-bold ${selected ? 'text-blue-700' : 'text-slate-800'}`}>{opt.label}</div>
                                <div className={`text-[12px] ${selected ? 'text-blue-500' : 'text-slate-400'}`}>{opt.sub}</div>
                              </div>
                              {selected && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cancellation details */}
                  {issue === 'cancelled' && (
                    <>
                      <div>
                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">When were you told about the cancellation?</label>
                        <div className="grid grid-cols-1 gap-2">
                          {NOTICE_OPTIONS.map(opt => {
                            const selected = noticeDays === opt.value;
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setNoticeDays(opt.value)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-blue-600' : 'border-slate-300'}`}>
                                  {selected && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                                </div>
                                <span className={`text-[13px] font-medium ${selected ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Did the airline offer you an alternative flight?</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setOfferedAlternative(true)}
                            className={`flex-1 py-3 rounded-xl border-2 text-[13px] font-semibold cursor-pointer transition-all ${offeredAlternative === true ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => { setOfferedAlternative(false); setAltArrivalDelta(''); }}
                            className={`flex-1 py-3 rounded-xl border-2 text-[13px] font-semibold cursor-pointer transition-all ${offeredAlternative === false ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                          >
                            No
                          </button>
                        </div>
                      </div>

                      {offeredAlternative && (
                        <div>
                          <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">How late did the alternative arrive vs. your original flight?</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Under 2h', val: 90 },
                              { label: '2–4 hours', val: 180 },
                              { label: 'Over 4h', val: 300 },
                            ].map(opt => {
                              const selected = altArrivalDelta === opt.val;
                              return (
                                <button
                                  key={opt.val}
                                  onClick={() => setAltArrivalDelta(opt.val)}
                                  className={`py-3 rounded-xl border-2 text-[13px] font-semibold cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 4 — airline reason */}
            {step === 4 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">What did the airline say?</h2>
                  <p className="text-[13px] text-slate-500">Did the airline give a reason for the disruption? This helps us assess your case. You can skip this step.</p>
                </div>

                {/* Live data banner */}
                {liveFlight && (
                  <div className="mb-4 flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                      <Search className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-blue-800">Live flight data found</div>
                      <div className="text-[12px] text-blue-600">
                        {liveFlight.flightNum} · {liveFlight.airline} · {liveFlight.depCode} → {liveFlight.arrCode}
                        {liveFlight.delayMin > 0 && ` · ${formatDelay(liveFlight.delayMin)} delay`}
                        {liveFlight.status === 'cancelled' && ' · Cancelled'}
                      </div>
                    </div>
                  </div>
                )}

                {lookupLoading && (
                  <div className="mb-4 flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-[13px] text-slate-500">Looking up your flight data...</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5">
                  {AIRLINE_REASON_OPTIONS.map(opt => {
                    const selected = airlineReason === opt.id;
                    const extraordinary = isExtraordinary(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setAirlineReason(opt.id)}
                        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-blue-600' : 'bg-slate-100'}`}>
                          {extraordinary ? <AlertTriangle className={`w-4 h-4 ${selected ? 'text-white' : 'text-amber-500'}`} /> : <Scale className={`w-4 h-4 ${selected ? 'text-white' : 'text-slate-500'}`} />}
                        </div>
                        <div className="flex-1">
                          <div className={`text-[14px] font-bold ${selected ? 'text-blue-700' : 'text-slate-800'}`}>{opt.label}</div>
                          {extraordinary && (
                            <div className={`text-[11px] mt-0.5 ${selected ? 'text-blue-500' : 'text-amber-500'}`}>
                              Airline may claim "extraordinary circumstances" — we challenge this
                            </div>
                          )}
                        </div>
                        {selected && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setAirlineReason('')}
                  className="mt-3 text-[12px] font-semibold text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"
                >
                  Skip this step →
                </button>
              </div>
            )}

            {/* Step 5 — result */}
            {step === 5 && result && (
              <div className="py-2">
                {!result.eligible ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      {result.blocked ? <Ban className="w-8 h-8 text-slate-400" /> : <Clock className="w-8 h-8 text-slate-400" />}
                    </div>
                    <h2 className="text-[20px] font-black text-slate-900 mb-2">
                      {result.blocked ? 'Not eligible for compensation' : 'No compensation likely'}
                    </h2>
                    <p className="text-[13px] text-slate-500 mb-4 max-w-[340px] mx-auto leading-relaxed">
                      {result.reasons[0] || 'Based on the information provided, this flight may not qualify for fixed cash compensation.'}
                    </p>

                    {/* Still show reasons */}
                    {result.reasons.length > 0 && (
                      <div className="bg-slate-50 rounded-2xl p-4 mb-4 text-left max-w-[400px] mx-auto">
                        <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Why?</div>
                        {result.reasons.map((r, i) => (
                          <div key={i} className="text-[12px] text-slate-600 mb-1.5 flex items-start gap-2">
                            <span className="text-slate-400 shrink-0">•</span> {r}
                          </div>
                        ))}
                      </div>
                    )}

                    {result.warnings.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 max-w-[400px] mx-auto text-left">
                        {result.warnings.map((w, i) => (
                          <div key={i} className="text-[12px] text-amber-700 mb-1 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[12px] text-slate-500 mb-4 max-w-[340px] mx-auto">
                      Think the data is wrong? Our team can verify your case manually — you may still have a valid claim.
                    </p>

                    <button
                      onClick={() => onStartClaim({
                        dep, arr, issue: mappedIssue(), fdate: fdate || undefined,
                        estimatedAmount: 0,
                        flight: flightNumber || undefined,
                        airline: liveFlight?.airline,
                        jurisdiction: autoJurisdiction,
                        passengers,
                      })}
                      className="px-6 py-3 bg-slate-700 text-white rounded-2xl font-bold text-[14px] border-none cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      Submit for Manual Review
                    </button>
                    <button onClick={onClose} className="ml-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-[14px] border-none cursor-pointer hover:bg-slate-200 transition-colors">
                      Close
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Amount card */}
                    <div className="rounded-3xl p-6 text-center mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f2744 0%, #1d4ed8 100%)' }}>
                      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/svg%3E\")" }} />
                      <div className="relative">
                        <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-[11px] font-bold text-white/80 mb-3 uppercase tracking-wider">
                          {JURISDICTION_LABELS[result.jurisdiction].flag} {JURISDICTION_LABELS[result.jurisdiction].name} · Estimated Compensation
                        </div>
                        <div className="flex items-start justify-center gap-1 mb-1">
                          <span className="text-[28px] font-black text-blue-300 mt-2">{result.currencySymbol}</span>
                          <span className="text-[56px] font-black text-white leading-none">{result.amountPerPassenger.toLocaleString()}</span>
                        </div>
                        {passengers > 1 && (
                          <div className="text-[15px] text-blue-200 font-semibold mb-1">
                            {result.currencySymbol}{result.totalAmount.toLocaleString()} total for {passengers} passengers
                          </div>
                        )}
                        <div className="text-[13px] text-white/60">per passenger · No win, No fee</div>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">Your claim summary</div>
                      <div className="space-y-2.5">
                        {[
                          { icon: '✈️', label: 'Route', value: `${dep} → ${arr}` },
                          { icon: '⚡', label: 'Disruption', value: issueLabel() },
                          ...(fdate ? [{ icon: '📅', label: 'Date', value: fdate }] : []),
                          ...(passengers > 1 ? [{ icon: '👥', label: 'Passengers', value: String(passengers) }] : []),
                          ...(result.distanceKm ? [{ icon: '📏', label: 'Distance', value: `${result.distanceKm.toLocaleString()} km` }] : []),
                          ...(flightNumber ? [{ icon: '🔢', label: 'Flight', value: flightNumber }] : []),
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[13px] text-slate-500">
                              <span>{row.icon}</span> {row.label}
                            </div>
                            <span className="text-[13px] font-semibold text-slate-800">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reasons */}
                    {result.reasons.length > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                        {result.reasons.map((r, i) => (
                          <div key={i} className="text-[12px] text-emerald-800 mb-1 flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" /> {r}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings (extraordinary circumstances etc.) */}
                    {result.warnings.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                        {result.warnings.map((w, i) => (
                          <div key={i} className="text-[12px] text-amber-700 mb-1 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Claim window check */}
                    {claimWindow && !claimWindow.within && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                        <div className="text-[12px] text-red-700 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          This flight may be outside the claim window ({claimWindow.label}). Our team will confirm whether you can still claim.
                        </div>
                      </div>
                    )}

                    {/* Live data note */}
                    {liveFlight && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4 text-[12px] text-blue-700">
                        <Shield className="w-4 h-4 shrink-0" />
                        Verified via live aviation data: {liveFlight.flightNum} arrived {liveFlight.delayMin > 0 ? `${formatDelay(liveFlight.delayMin)} late` : 'on time'}.
                      </div>
                    )}

                    <button
                      onClick={() => onStartClaim({
                        dep, arr, issue: mappedIssue(), fdate: fdate || undefined,
                        estimatedAmount: result.totalAmount,
                        flight: flightNumber || liveFlight?.flightNum || undefined,
                        airline: liveFlight?.airline || undefined,
                        jurisdiction: result.jurisdiction,
                        passengers,
                      })}
                      className="w-full py-4 text-white font-black text-[15px] rounded-2xl border-none cursor-pointer transition-all hover:opacity-90 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(90deg, #1d4ed8, #2563eb)' }}
                    >
                      Start My Claim <ArrowRight className="w-5 h-5" />
                    </button>
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                      <Lock className="w-3 h-3" /> No risk · Checking is completely free
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {step < 5 && (
            <div className="shrink-0 px-7 pb-6 pt-3 border-t border-slate-100 bg-white flex items-center gap-3">
              {step > 1 && (
                <button
                  onClick={back}
                  className="px-5 py-3.5 rounded-2xl font-bold text-[14px] border-2 border-slate-200 text-slate-600 hover:border-slate-300 bg-white cursor-pointer transition-all shrink-0"
                >
                  ← Back
                </button>
              )}
              <button
                onClick={next}
                disabled={!canContinue()}
                className="flex-1 py-4 rounded-2xl font-black text-[15px] border-none transition-all flex items-center justify-center gap-2"
                style={{
                  background: canContinue() ? 'linear-gradient(90deg,#1d4ed8,#2563eb)' : '#e2e8f0',
                  color: canContinue() ? 'white' : '#94a3b8',
                  cursor: canContinue() ? 'pointer' : 'not-allowed',
                }}
              >
                {step === 4 ? 'Check My Compensation' : 'Continue'}
                {canContinue() && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
