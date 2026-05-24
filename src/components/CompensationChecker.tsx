import { useState } from 'react';
import { X, PlaneTakeoff, PlaneLanding, Euro, Star, ArrowRight, Lock, CheckCircle2, Clock, Ban, Luggage, Link } from 'lucide-react';
import AirportInput from './AirportInput';

export interface CheckerPrefill {
  dep: string;
  arr: string;
  issue: string;
  fdate?: string;
  estimatedAmount: number;
}

interface Props {
  onClose: () => void;
  onStartClaim: (prefill: CheckerPrefill) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const ISSUES = [
  { id: 'delay', label: 'Flight Delay', desc: 'Arrived 3+ hours late', Icon: Clock },
  { id: 'cancelled', label: 'Cancellation', desc: 'Flight was cancelled', Icon: Ban },
  { id: 'missed', label: 'Missed Connection', desc: 'Missed a connecting flight', Icon: Link },
  { id: 'denied', label: 'Denied Boarding', desc: 'Bumped or overbooked', Icon: Ban },
  { id: 'baggage', label: 'Baggage Problem', desc: 'Lost, damaged or delayed bag', Icon: Luggage },
];

const DELAY_OPTS = [
  { id: 'lt2', label: 'Less than 2 hours', sub: 'Not eligible for compensation' },
  { id: '2to3', label: '2 – 3 hours', sub: 'Partial compensation may apply' },
  { id: '3to4', label: '3 – 4 hours', sub: 'Full short-haul compensation' },
  { id: 'gt4', label: 'More than 4 hours', sub: 'Maximum compensation tier' },
];

const STEPS = [
  { label: 'Your Route', sub: 'Where did you fly?' },
  { label: 'Disruption', sub: 'What went wrong?' },
  { label: 'Flight Date', sub: 'When did it happen?' },
  { label: 'Result', sub: 'Your entitlement' },
];

export default function CompensationChecker({ onClose, onStartClaim }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [dep, setDep] = useState('');
  const [arr, setArr] = useState('');
  const [issue, setIssue] = useState('');
  const [delay, setDelay] = useState('');
  const [fdate, setFdate] = useState('');
  const [result, setResult] = useState<number | null>(null);

  function canContinue() {
    if (step === 1) return dep.trim().length > 0 && arr.trim().length > 0;
    if (step === 2) return issue.length > 0;
    if (step === 3) return issue !== 'delay' || delay.length > 0;
    if (step === 4) return fdate.length > 0;
    return true;
  }

  function next() {
    if (!canContinue()) return;
    if (step === 2 && issue !== 'delay') {
      const amt = calcCompensation();
      setResult(amt);
      setStep(4);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      const amt = calcCompensation();
      setResult(amt);
      setStep(5);
    } else {
      setStep(s => (s + 1) as Step);
    }
  }

  function calcCompensation() {
    if (issue === 'baggage') return 1400;
    if (issue === 'denied') return 4700;
    if (issue === 'delay') {
      if (delay === 'lt2') return 0;
      if (delay === '2to3') return 300;
      if (delay === '3to4') return 600;
      return 700;
    }
    return 600;
  }

  function issueLabel() {
    return ISSUES.find(i => i.id === issue)?.label || issue;
  }

  function mappedIssue() {
    const map: Record<string, string> = {
      delay: 'Flight Delayed',
      cancelled: 'Flight Cancelled',
      missed: 'Missed Connecting Flight',
      denied: 'Denied Boarding',
      baggage: 'Something Else',
    };
    return map[issue] || issue;
  }

  const totalSteps = issue === 'delay' ? 4 : 3;
  const currentVisual = step === 1 ? 1 : step === 2 ? 2 : step === 3 && issue === 'delay' ? 3 : step === 4 ? (issue === 'delay' ? 4 : 3) : totalSteps;
  const progressPct = step === 5 ? 100 : (currentVisual / totalSteps) * 90;

  const activeSidebarIdx = step <= 2 ? 0 : step === 3 ? 1 : step === 4 ? 2 : 3;

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
          {/* subtle pattern */}
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

            {/* Step 1 — airports */}
            {step === 1 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">Where did you fly?</h2>
                  <p className="text-[13px] text-slate-500">Enter your departure and arrival airports to start.</p>
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

            {/* Step 3 — delay duration */}
            {step === 3 && issue === 'delay' && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">How long was the delay?</h2>
                  <p className="text-[13px] text-slate-500">Measured at your final destination on arrival.</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {DELAY_OPTS.map(opt => {
                    const selected = delay === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setDelay(opt.id)}
                        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-blue-600' : 'bg-slate-100'}`}>
                          <Clock className={`w-4 h-4 ${selected ? 'text-white' : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1">
                          <div className={`text-[14px] font-bold ${selected ? 'text-blue-700' : 'text-slate-800'}`}>{opt.label}</div>
                          <div className={`text-[12px] ${selected ? 'text-blue-500' : 'text-slate-400'}`}>{opt.sub}</div>
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

            {/* Step 4 — flight date */}
            {step === 4 && step !== 5 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-[22px] font-black text-slate-900 mb-1">When did it happen?</h2>
                  <p className="text-[13px] text-slate-500">You can claim for flights up to 6 years ago in most countries.</p>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Flight date</label>
                  <input
                    type="date"
                    value={fdate}
                    onChange={e => setFdate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-[14px] outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                  <div className="mt-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <span className="text-amber-500 text-sm">⚠️</span>
                    <p className="text-[12px] text-amber-700">Claim windows: EU 3 yrs · UK 6 yrs · Israel 4 yrs · France 5 yrs</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5 — result */}
            {step === 5 && (
              <div className="py-2">
                {result === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <X className="w-8 h-8 text-slate-400" />
                    </div>
                    <h2 className="text-[20px] font-black text-slate-900 mb-2">No compensation for this delay</h2>
                    <p className="text-[13px] text-slate-500 mb-6 max-w-[320px] mx-auto leading-relaxed">
                      Delays under 2 hours don't qualify under EC 261/2004. If you have a different issue, try checking again.
                    </p>
                    <button onClick={onClose} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-[14px] border-none cursor-pointer hover:bg-slate-200 transition-colors">Close</button>
                  </div>
                ) : (
                  <div>
                    {/* Amount card */}
                    <div className="rounded-3xl p-6 text-center mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f2744 0%, #1d4ed8 100%)' }}>
                      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/svg%3E\")" }} />
                      <div className="relative">
                        <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-[11px] font-bold text-white/80 mb-3 uppercase tracking-wider">
                          Estimated Compensation
                        </div>
                        <div className="flex items-start justify-center gap-1 mb-1">
                          <span className="text-[28px] font-black text-blue-300 mt-2">€</span>
                          <span className="text-[56px] font-black text-white leading-none">{result?.toLocaleString()}</span>
                        </div>
                        <div className="text-[13px] text-white/60">per passenger · No win, No fee</div>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">Your claim summary</div>
                      <div className="space-y-2.5">
                        {[
                          { icon: '✈️', label: 'Route', value: `${dep} → ${arr}` },
                          { icon: '⚡', label: 'Disruption', value: issueLabel() },
                          ...(fdate ? [{ icon: '📅', label: 'Date', value: fdate }] : []),
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

                    <button
                      onClick={() => onStartClaim({
                        dep,
                        arr,
                        issue: mappedIssue(),
                        fdate: fdate || undefined,
                        estimatedAmount: result ?? 600,
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
            <div className="shrink-0 px-7 pb-6 pt-3 border-t border-slate-100 bg-white">
              <button
                onClick={next}
                disabled={!canContinue()}
                className="w-full py-4 rounded-2xl font-black text-[15px] border-none transition-all flex items-center justify-center gap-2"
                style={{
                  background: canContinue() ? 'linear-gradient(90deg,#1d4ed8,#2563eb)' : '#e2e8f0',
                  color: canContinue() ? 'white' : '#94a3b8',
                  cursor: canContinue() ? 'pointer' : 'not-allowed',
                }}
              >
                Continue {canContinue() && <ArrowRight className="w-4 h-4" />}
              </button>
              <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <Lock className="w-3 h-3" /> No risk · Checking is completely free
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
