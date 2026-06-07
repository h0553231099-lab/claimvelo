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
    onPrefillClaim?.({ flight: fn, fdate: dt, dep: '', arr: '', airline: '', issue: 'Flight Delayed' });
    onNav('claim');
    setModal({ kind: 'idle' });
  }

  const isLoading = modal.kind === 'loading';
  const canCheck = flightNum.trim().length >= 2 && date.length > 0;

  return (
    <>
      {/* ── INLINE WIDGET ── */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 w-full max-w-[560px] shadow-sm">
        <p className="text-[11px] font-bold text-[#475569] uppercase tracking-widest mb-3">Quick flight check</p>
        <div className="flex flex-col sm:flex-row gap-2.5">

          {/* Flight number */}
          <div className="relative flex-1">
            <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={flightNum}
              onChange={e => setFlightNum(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              placeholder="e.g. BA2490"
              maxLength={10}
              className="w-full pl-9 pr-3 py-3 bg-white border border-[#cbd5e1] rounded-xl text-[13px] font-semibold text-[#0f172a] placeholder:text-[#94a3b8] placeholder:font-normal outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#dbeafe] transition-all"
            />
          </div>

          {/* Date */}
          <div className="relative sm:w-[155px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={today}
              className="w-full pl-9 pr-2 py-3 bg-white border border-[#cbd5e1] rounded-xl text-[13px] font-semibold text-[#0f172a] outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#dbeafe] transition-all [color-scheme:light]"
            />
          </div>

          {/* CTA */}
          <button
            onClick={handleCheck}
            disabled={!canCheck || isLoading}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold border-none cursor-pointer transition-all whitespace-nowrap ${
              canCheck && !isLoading
                ? 'bg-[#1d4ed8] hover:bg-[#1e40af] text-white shadow-sm hover:-translate-y-px'
                : 'bg-[#f1f5f9] text-[#94a3b8] cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-[#93c5fd] border-t-[#1d4ed8] rounded-full animate-spin" />
            ) : (
              <><Search className="w-3.5 h-3.5" /> Check Now</>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-[#94a3b8]">
          <Lock className="w-3 h-3" /> Free · No personal data required
        </div>
      </div>

      {/* ── RESULT MODAL ── */}
      {modal.kind !== 'idle' && modal.kind !== 'loading' && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center p-4"
          onClick={() => setModal({ kind: 'idle' })}
        >
          <div className="absolute inset-0 bg-[#0f172a]/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[460px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setModal({ kind: 'idle' })}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#f1f5f9] hover:bg-[#e2e8f0] flex items-center justify-center border-none cursor-pointer transition-colors z-10"
            >
              <X className="w-4 h-4 text-[#64748b]" />
            </button>

            {/* ELIGIBLE */}
            {modal.kind === 'eligible' && (
              <>
                <div className="px-6 pt-8 pb-6 text-center bg-[#f0fdf4] border-b border-[#bbf7d0]">
                  <div className="w-12 h-12 rounded-full bg-[#dcfce7] border border-[#bbf7d0] flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-6 h-6 text-[#16a34a]" />
                  </div>
                  <p className="text-[11px] font-bold text-[#16a34a] uppercase tracking-widest mb-2">Estimated entitlement</p>
                  <div className="flex items-start justify-center gap-1 mb-1">
                    <span className="text-[20px] font-black text-[#166534] mt-2">{modal.currency}</span>
                    <span className="text-[52px] font-black text-[#0f172a] leading-none">{modal.amount.toLocaleString()}</span>
                  </div>
                  <p className="text-[13px] text-[#64748b]">Per passenger · No win, no fee</p>
                </div>

                <div className="px-6 py-5">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 mb-4 space-y-2.5">
                    <p className="text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1">Flight details</p>
                    <DetailRow label="Flight" value={`${modal.flight.flightNum} · ${modal.flight.airline}`} />
                    {modal.flight.depCode && modal.flight.arrCode && (
                      <DetailRow label="Route" value={`${modal.flight.depCode} → ${modal.flight.arrCode}`} />
                    )}
                    <DetailRow label="Date" value={modal.flight.date} />
                    {modal.flight.status === 'cancelled' ? (
                      <DetailRow label="Status" value="Cancelled" valueClass="text-[#dc2626] font-bold" />
                    ) : (
                      <DetailRow label="Delay" value={`${formatDelay(modal.flight.delayMin)} late`} valueClass="text-[#d97706] font-bold" />
                    )}
                  </div>

                  <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-3 mb-5 text-[13px] text-[#166534] leading-relaxed">
                    {modal.flight.status === 'cancelled'
                      ? 'Your flight was cancelled. Under EU261/UK261 you are entitled to cash compensation plus a full refund or re-routing.'
                      : `Your flight arrived ${formatDelay(modal.flight.delayMin)} late — above the 3-hour threshold. You are likely entitled to statutory compensation.`}
                  </div>

                  <button
                    onClick={() => handleStartClaim(modal.flight)}
                    className="w-full py-4 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-[15px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    Start My Claim <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#94a3b8]">
                    <Lock className="w-3 h-3" /> Free to start · We only charge if you win
                  </div>
                </div>
              </>
            )}

            {/* NOT ELIGIBLE */}
            {modal.kind === 'not_eligible' && (
              <>
                <div className="px-6 pt-8 pb-6 text-center bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <div className="w-12 h-12 rounded-full bg-[#e2e8f0] flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-6 h-6 text-[#475569]" />
                  </div>
                  <p className="text-[18px] font-bold text-[#0f172a] mb-1">Flight doesn't qualify</p>
                  <p className="text-[13px] text-[#64748b]">Based on the delay recorded</p>
                </div>

                <div className="px-6 py-5">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 mb-4 space-y-2.5">
                    <DetailRow label="Flight" value={`${modal.flight.flightNum} · ${modal.flight.airline}`} />
                    <DetailRow label="Date" value={modal.flight.date} />
                    <DetailRow
                      label="Recorded delay"
                      value={modal.flight.delayMin > 0 ? formatDelay(modal.flight.delayMin) : 'On time'}
                    />
                  </div>

                  <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl px-4 py-3 mb-5 text-[13px] text-[#92400e] leading-relaxed">
                    <strong>Why?</strong> {modal.reason}
                  </div>

                  <p className="text-[12px] text-[#64748b] mb-4 text-center">
                    Think the data is wrong? Submit your claim anyway — our team will verify it.
                  </p>

                  <button
                    onClick={handleManualClaim}
                    className="w-full py-3.5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-[14px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-md flex items-center justify-center gap-2"
                  >
                    Submit Claim Anyway <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* NOT FOUND */}
            {modal.kind === 'not_found' && (
              <>
                <div className="px-6 pt-8 pb-6 text-center bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <div className="w-12 h-12 rounded-full bg-[#dbeafe] flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-6 h-6 text-[#1d4ed8]" />
                  </div>
                  <p className="text-[18px] font-bold text-[#0f172a] mb-1">Flight not found</p>
                  <p className="text-[13px] text-[#64748b]">No live data for this flight</p>
                </div>

                <div className="px-6 py-5">
                  <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-5 text-[13px] text-[#1e40af] leading-relaxed">
                    We couldn't find data for <strong>{modal.flightNum}</strong> on <strong>{modal.date}</strong>.
                    This can happen with older flights or if the flight number changed. You can still submit your claim — our team will verify it.
                  </div>

                  <button
                    onClick={handleManualClaim}
                    className="w-full py-4 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-[15px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-md flex items-center justify-center gap-2"
                  >
                    Continue With My Claim <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#94a3b8]">
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
  label,
  value,
  valueClass = 'text-[#0f172a]',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-[#64748b] shrink-0">{label}</span>
      <span className={`text-[13px] font-semibold text-right ${valueClass}`}>{value}</span>
    </div>
  );
}
