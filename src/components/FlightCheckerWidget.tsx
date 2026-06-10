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
  | { kind: 'eligible'; flight: FlightLookupResult; amount: number; currency: string; distanceKm: number | null }
  | { kind: 'not_eligible'; flight: FlightLookupResult; reason: string }
  | { kind: 'not_found'; flightNum: string; date: string }
  | { kind: 'error'; message: string };

// IATA → [lat, lon] for major airports (haversine distance calc)
const AIRPORT_COORDS: Record<string, [number, number]> = {
  LHR:[51.477,-0.461],LGW:[51.148,-0.190],LTN:[51.874,-0.368],STN:[51.885,0.235],LCY:[51.505,0.055],
  MAN:[53.354,-2.275],EDI:[55.950,-3.373],BHX:[52.453,-1.748],GLA:[55.872,-4.433],BRS:[51.382,-2.719],
  CDG:[49.009,2.548],ORY:[48.724,2.380],NCE:[43.658,7.215],LYS:[45.726,5.081],MRS:[43.435,5.215],
  AMS:[52.308,4.764],BRU:[50.902,4.484],LGG:[50.637,5.443],
  FRA:[50.033,8.570],MUC:[48.354,11.786],BER:[52.366,13.503],DUS:[51.289,6.767],HAM:[53.630,10.006],
  STR:[48.690,9.222],CGN:[50.866,7.143],NUE:[49.499,11.078],HAJ:[52.461,9.685],
  MAD:[40.472,-3.561],BCN:[41.297,2.078],PMI:[39.551,2.739],AGP:[36.675,-4.499],ALC:[38.282,-0.558],
  VLC:[39.489,-0.481],BIO:[43.301,-2.911],SVQ:[37.418,-5.893],
  FCO:[41.800,12.239],MXP:[45.630,8.723],LIN:[45.445,9.277],VCE:[45.505,12.352],NAP:[40.886,14.291],
  BGY:[45.669,9.704],PSA:[43.683,10.393],BLQ:[44.535,11.289],CTA:[37.467,15.066],
  LIS:[38.781,-9.136],OPO:[41.248,-8.681],FAO:[37.014,-7.966],
  ZRH:[47.458,8.548],GVA:[46.238,6.109],BSL:[47.590,7.530],
  VIE:[48.110,16.570],SZG:[47.793,13.004],GRZ:[46.991,15.440],
  PRG:[50.100,14.260],BRQ:[49.151,16.695],
  WAW:[52.165,20.967],KRK:[50.077,19.785],WRO:[51.102,16.885],KTW:[50.474,19.080],
  BUD:[47.433,19.261],
  OTP:[44.572,26.102],CLJ:[46.785,23.686],
  SOF:[42.696,23.411],VAR:[43.232,27.825],
  ATH:[37.936,23.944],SKG:[40.520,22.971],HER:[35.340,25.181],
  IST:[40.976,28.814],SAW:[40.898,29.309],AYT:[36.899,30.800],ADB:[38.292,27.157],ESB:[40.128,32.995],
  SVO:[55.973,37.415],DME:[55.408,37.906],LED:[59.800,30.262],VKO:[55.591,37.261],
  ARN:[59.651,17.919],GOT:[57.669,12.300],BMA:[59.354,17.947],
  CPH:[55.618,12.656],AAL:[57.093,9.849],
  OSL:[60.194,11.100],BGO:[60.294,5.218],
  HEL:[60.317,24.963],TMP:[61.414,23.604],
  RIX:[56.924,23.971],TLL:[59.413,24.833],VNO:[54.634,25.285],
  DUB:[53.421,-6.270],SNN:[52.702,-8.925],ORK:[51.841,-8.491],
  KEF:[63.985,-22.606],
  TXL:[52.554,13.291],SXF:[52.380,13.522],
  LPA:[27.931,-15.387],TFS:[28.045,-16.572],ACE:[28.945,-13.605],FUE:[28.300,-13.864],
  HRG:[27.178,33.799],SSH:[27.977,34.395],CAI:[30.122,31.405],
  DXB:[25.253,55.364],AUH:[24.433,54.651],SHJ:[25.328,55.517],DOH:[25.273,51.608],
  KWI:[29.227,47.969],BAH:[26.270,50.634],MCT:[23.594,58.285],
  DEL:[28.556,77.100],BOM:[19.089,72.868],BLR:[13.199,77.706],MAA:[12.990,80.169],
  HYD:[17.231,78.430],CCU:[22.655,88.447],COK:[10.152,76.401],
  BKK:[13.681,100.747],DMK:[13.913,100.606],HKT:[8.113,98.316],
  SIN:[1.359,103.989],KUL:[2.745,101.710],CGK:[-6.127,106.655],
  HKG:[22.308,113.915],PEK:[40.080,116.585],PVG:[31.143,121.805],CAN:[23.392,113.299],
  ICN:[37.469,126.451],GMP:[37.558,126.791],
  NRT:[35.765,140.386],HND:[35.549,139.780],KIX:[34.426,135.244],NGO:[34.858,136.805],
  SYD:[-33.946,151.177],MEL:[-37.673,144.843],BNE:[-27.384,153.118],PER:[-31.940,115.967],
  JNB:[-26.134,28.242],CPT:[-33.965,18.602],
  YYZ:[43.677,-79.631],YVR:[49.194,-123.184],YUL:[45.470,-73.741],YYC:[51.131,-114.010],
  JFK:[40.640,-73.779],LAX:[33.943,-118.408],ORD:[41.978,-87.905],ATL:[33.640,-84.427],
  DFW:[32.896,-97.038],DEN:[39.856,-104.674],SFO:[37.619,-122.375],LAS:[36.080,-115.152],
  SEA:[47.449,-122.309],PHX:[33.436,-112.008],EWR:[40.693,-74.169],MIA:[25.796,-80.287],
  BOS:[42.365,-71.010],MSP:[44.882,-93.222],IAD:[38.944,-77.456],CLT:[35.214,-80.943],
  DTW:[42.212,-83.353],MCO:[28.430,-81.309],PHL:[39.873,-75.241],SAN:[32.734,-117.190],
  TPA:[27.976,-82.533],PDX:[45.589,-122.593],STL:[38.748,-90.370],BNA:[36.124,-86.678],
  MXP:[45.630,8.723],GRU:[-23.432,-46.469],GIG:[-22.808,-43.244],EZE:[-34.822,-58.536],
  BOG:[4.700,-74.147],LIM:[-12.022,-77.114],SCL:[-33.393,-70.786],
  MEX:[19.436,-99.072],CUN:[21.037,-86.877],GDL:[20.521,-103.311],MTY:[25.775,-100.107],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeDistanceKm(depCode: string, arrCode: string): number | null {
  const dep = AIRPORT_COORDS[depCode?.toUpperCase()];
  const arr = AIRPORT_COORDS[arrCode?.toUpperCase()];
  if (!dep || !arr) return null;
  return haversineKm(dep[0], dep[1], arr[0], arr[1]);
}

function compensationAmount(delayMin: number, depCode?: string, arrCode?: string): { amount: number; currency: string; distanceKm: number | null } | null {
  if (delayMin < 180) return null;
  const distanceKm = depCode && arrCode ? routeDistanceKm(depCode, arrCode) : null;
  if (distanceKm === null) {
    // Unknown distance — show max possible
    return { amount: 600, currency: '€', distanceKm: null };
  }
  let amount: number;
  if (distanceKm <= 1500) {
    amount = 250;
  } else if (distanceKm <= 3500) {
    amount = 400;
  } else {
    // Over 3500 km: €300 for 3-4h delay, €600 for 4h+
    amount = delayMin >= 240 ? 600 : 300;
  }
  return { amount, currency: '€', distanceKm: Math.round(distanceKm) };
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
      setModal({ kind: 'eligible', flight, amount: 600, currency: '€', distanceKm: null });
      return;
    }

    const comp = compensationAmount(flight.delayMin, flight.depCode, flight.arrCode);
    if (comp) {
      setModal({ kind: 'eligible', flight, amount: comp.amount, currency: comp.currency, distanceKm: comp.distanceKm });
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
                    {modal.distanceKm && (
                      <DetailRow icon="📏" label="Route Distance" value={`${modal.distanceKm.toLocaleString()} km`} />
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
