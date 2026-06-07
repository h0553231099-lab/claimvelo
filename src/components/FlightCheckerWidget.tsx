import { useState, useRef } from 'react';
import { Plane, Calendar, Search, X, CheckCircle2, AlertTriangle, ArrowRight, Lock, Clock } from 'lucide-react';
import { lookupFlight, type FlightLookupResult } from '../lib/supabase';
import type { Page } from '../types';

interface Props {
  onNav: (p: Page) => void;
  onPrefillClaim?: (data: { flight: string; fdate: string; dep: string; arr: string; airline: string; issue: string }) => void;
}

type ModalState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'eligible'; flight: FlightLookupResult; amount: number; currency: string }
  | { kind: 'not_eligible'; flight: FlightLookupResult; reason: string }
  | { kind: 'not_found'; flightNum: string; date: string }
  | { kind: 'error'; message: string };

function compensationAmount(delayMin: number): { amount: number; currency: string } | null {
  if (delayMin < 180) return null;
  // Simplified EU261 estimate — we don't know distance so show max possible
  return { amount: 600, currency: '€' };
}

function formatDelay(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export default function FlightCheckerWidget({ onNav, onPrefillClaim }: Props) {
  const [flightNum, setFlightNum] = useState('');
  const [date, setDate] = useState('');
  const [modal, setModal] = useState<ModalState>({ kind: 'idle' });

  const today = new Date().toISOString().split('T')[0];
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCheck() {
    const fn = flightNum.trim().toUpperCase();
    const dt = date.trim();
    if (!fn || !dt) {
      inputRef.current?.focus();
      return;
    }

    setModal({ kind: 'loading' });

    const { flights, error } = await lookupFlight(fn, dt);

    if (error || !flights.length) {
      setModal({ kind: 'not_found', flightNum: fn, date: dt });
      return;
    }

    const flight = flights[0];

    // Cancelled flight — always eligible
    if (flight.status === 'cancelled') {
      setModal({ kind: 'eligible', flight, amount: 600, currency: '€' });
      return;
    }

    const comp = compensationAmount(flight.delayMin);
    if (comp) {
      setModal({ kind: 'eligible', flight, amount: comp.amount, currency: comp.currency });
    } else {
      const reason =
        flight.delayMin > 0
          ? `Your flight arrived ${formatDelay(flight.delayMin)} late — below the 3-hour threshold required by EU261/UK261.`
          : 'No significant delay was recorded for this flight on the date you entered.';
      setModal({ kind: 'not_eligible', flight, reason });
    }
  }

  function handleStartClaim(flight: FlightLookupResult) {
    onPrefillClaim?.({
      flight: flight.flightNum,
      fdate: flight.date,
      dep: flight.depCode || flight.depAirport,
      arr: flight.arrCode || flight.arrAirport,
      airline: flight.airline,
      issue: flight.status === 'cancelled' ? 'Flight Cancelled' : 'Flight Delayed',
    });
    onNav('claim');
    setModal({ kind: 'idle' });
  }

  function handleManualClaim() {
    const fn = flightNum.trim().toUpperCase();
    const dt = date.trim();
    onPrefillClaim?.({
      flight: fn,
      fdate: dt,
      dep: '',
      arr: '',
      airline: '',
      issue: 'Flight Delayed',
    });
    onNav('claim');
    setModal({ kind: 'idle' });
  }

  const isLoading = modal.kind === 'loading';
  const canCheck = flightNum.trim().length >= 2 && date.length > 0;

  return (
    <>
      {/* ── INLINE WIDGET ── */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 sm:p-5 w-full max-w-[540px]">
        <div className="text-[11px] font-bold text-white/60 uppercase tracking-widest mb-3">Quick Flight Check</div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Flight number */}
          <div className="relative flex-1">
            <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={flightNum}
              onChange={e => setFlightNum(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              placeholder="Flight No. e.g. FR1234"
              maxLength={10}
              className="w-full pl-9 pr-3 py-3 bg-white/15 border border-white/25 rounded-xl text-[13px] font-semibold text-white placeholder:text-white/40 outline-none focus:border-white/60 focus:bg-white/20 transition-all"
            />
          </div>

          {/* Date */}
          <div className="relative sm:w-[160px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={today}
              className="w-full pl-9 pr-2 py-3 bg-white/15 border border-white/25 rounded-xl text-[13px] font-semibold text-white outline-none focus:border-white/60 focus:bg-white/20 transition-all [color-scheme:dark]"
            />
          </div>

          {/* CTA */}
          <button
            onClick={handleCheck}
            disabled={!canCheck || isLoading}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-black border-none cursor-pointer transition-all whitespace-nowrap ${
              canCheck && !isLoading
                ? 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-lg shadow-green-900/40 hover:-translate-y-px'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Search className="w-3.5 h-3.5" /> Check Now</>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-white/40">
          <Lock className="w-3 h-3" /> Free check · No personal data required
        </div>
      </div>

      {/* ── RESULT MODAL ── */}
      {modal.kind !== 'idle' && modal.kind !== 'loading' && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center p-4"
          onClick={() => setModal({ kind: 'idle' })}
        >
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[460px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setModal({ kind: 'idle' })}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center border-none cursor-pointer transition-colors z-10"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            {/* ELIGIBLE */}
            {modal.kind === 'eligible' && (
              <>
                <div className="px-6 pt-7 pb-5 text-center" style={{ background: 'linear-gradient(135deg,#052e16,#14532d)' }}>
                  <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-300" />
                  </div>
                  <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest mb-2">
                    You May Be Entitled To
                  </div>
                  <div className="flex items-start justify-center gap-1 mb-1">
                    <span className="text-[22px] font-black text-emerald-300 mt-1.5">{modal.currency}</span>
                    <span className="text-[56px] font-black text-white leading-none">{modal.amount.toLocaleString()}</span>
                  </div>
                  <div className="text-[13px] text-white/60">Per passenger · No win, no fee</div>
                </div>

                <div className="px-6 py-5">
                  {/* Flight summary */}
                  <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2.5">
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1">Flight Details</div>
                    <DetailRow icon="✈️" label="Flight" value={`${modal.flight.flightNum} · ${modal.flight.airline}`} />
                    {modal.flight.depCode && modal.flight.arrCode && (
                      <DetailRow icon="🗺️" label="Route" value={`${modal.flight.depCode} → ${modal.flight.arrCode}`} />
                    )}
                    <DetailRow icon="📅" label="Date" value={modal.flight.date} />
                    {modal.flight.status === 'cancelled' ? (
                      <DetailRow icon="🚫" label="Status" value="Cancelled" valueClass="text-red-600 font-black" />
                    ) : (
                      <DetailRow
                        icon="⏱️"
                        label="Delay"
                        value={`${formatDelay(modal.flight.delayMin)} late`}
                        valueClass="text-amber-600 font-black"
                      />
                    )}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 text-[13px] text-emerald-800 leading-relaxed">
                    {modal.flight.status === 'cancelled'
                      ? 'Your flight was cancelled. Under EU261/UK261 you are entitled to cash compensation plus a full refund or alternative routing.'
                      : `Your flight arrived ${formatDelay(modal.flight.delayMin)} late — above the 3-hour threshold. You are likely entitled to statutory compensation.`}
                  </div>

                  <button
                    onClick={() => handleStartClaim(modal.flight)}
                    className="w-full py-4 bg-[#16a34a] hover:bg-[#15803d] text-white font-black text-[15px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    Start My Claim <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <Lock className="w-3 h-3" /> Free to start · We only charge if you win
                  </div>
                </div>
              </>
            )}

            {/* NOT ELIGIBLE */}
            {modal.kind === 'not_eligible' && (
              <>
                <div className="px-6 pt-7 pb-5 text-center bg-slate-700">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-7 h-7 text-slate-300" />
                  </div>
                  <div className="text-[18px] font-black text-white mb-1">Flight Doesn't Qualify</div>
                  <div className="text-[13px] text-slate-400">Based on the delay recorded</div>
                </div>

                <div className="px-6 py-5">
                  <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2.5">
                    <DetailRow icon="✈️" label="Flight" value={`${modal.flight.flightNum} · ${modal.flight.airline}`} />
                    <DetailRow icon="📅" label="Date" value={modal.flight.date} />
                    <DetailRow
                      icon="⏱️"
                      label="Recorded Delay"
                      value={modal.flight.delayMin > 0 ? formatDelay(modal.flight.delayMin) : 'On time'}
                      valueClass="text-slate-700"
                    />
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-[13px] text-amber-800 leading-relaxed">
                    <strong>Why?</strong> {modal.reason}
                  </div>

                  <p className="text-[12px] text-slate-500 mb-4 text-center">
                    Think the data is wrong? You can still submit your claim manually — our team will verify it.
                  </p>

                  <button
                    onClick={handleManualClaim}
                    className="w-full py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white font-black text-[14px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    Submit Claim Manually <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* NOT FOUND */}
            {modal.kind === 'not_found' && (
              <>
                <div className="px-6 pt-7 pb-5 text-center bg-[#1e3a8a]">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle className="w-7 h-7 text-blue-200" />
                  </div>
                  <div className="text-[18px] font-black text-white mb-1">Flight Not Found</div>
                  <div className="text-[13px] text-blue-200/70">We couldn't find data for this flight</div>
                </div>

                <div className="px-6 py-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-[13px] text-blue-800 leading-relaxed">
                    We couldn't find live data for <strong>{modal.flightNum}</strong> on <strong>{modal.date}</strong>.
                    This can happen with older flights or if the flight number has changed.
                    You can still submit your claim — our team will look it up manually.
                  </div>

                  <button
                    onClick={handleManualClaim}
                    className="w-full py-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-black text-[15px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    Continue With My Claim <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <Lock className="w-3 h-3" /> No risk · Free to start
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  valueClass = 'text-slate-800',
}: {
  icon: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[13px] text-slate-500 shrink-0">
        <span>{icon}</span> {label}
      </div>
      <span className={`text-[13px] font-semibold text-right ${valueClass}`}>{value}</span>
    </div>
  );
}
