import { useState, useEffect } from 'react';
import { X, Plane, Calendar, MapPin, Clock, User, Mail, Phone, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import AirportInput from './AirportInput';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void;
}

interface FormData {
  flightNumber: string;
  flightDate: string;
  departure: string;
  destination: string;
  delayDuration: string;
  fullName: string;
  email: string;
  phone: string;
}

const DELAY_OPTIONS = [
  { value: '2-3h', label: '2–3 hours', sub: 'May qualify depending on route' },
  { value: '3-8h', label: '3–8 hours', sub: 'Eligible under EU261 / UK261' },
  { value: '8h+', label: '8+ hours', sub: 'Eligible under Israeli law' },
  { value: 'cancelled', label: 'Flight Cancelled', sub: 'Full cancellation compensation' },
];

const STEPS = ['Flight Details', 'Route', 'Delay', 'Your Details'];

export default function ClaimModal({ open, onClose, onSubmitSuccess }: Props) {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    flightNumber: '',
    flightDate: '',
    departure: '',
    destination: '',
    delayDuration: '',
    fullName: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    if (open) {
      setStep(0);
      setSubmitted(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function canAdvance() {
    if (step === 0) return form.flightNumber.trim().length >= 2 && form.flightDate.length > 0;
    if (step === 1) return form.departure.trim().length >= 2 && form.destination.trim().length >= 2;
    if (step === 2) return form.delayDuration.length > 0;
    if (step === 3) return form.fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email);
    return false;
  }

  async function handleSubmit() {
    if (!canAdvance()) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 900));
    setSubmitting(false);
    setSubmitted(true);
    onSubmitSuccess?.();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-[520px] sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-5 border-b border-[#f1f5f9]" style={{ background: 'linear-gradient(135deg,#0f2744,#1e3a8a)' }}>
          <div>
            <div className="text-[11px] font-bold text-blue-200 uppercase tracking-widest mb-0.5">Free Eligibility Check</div>
            <div className="text-[17px] font-black text-white">Calculate My Cash Payout</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center border-none cursor-pointer transition-colors shrink-0">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Progress */}
        {!submitted && (
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center gap-1.5 mb-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1.5 w-full rounded-full transition-all duration-300 ${i <= step ? 'bg-[#2563eb]' : 'bg-[#e2e8f0]'}`} />
                </div>
              ))}
            </div>
            <div className="text-[11px] text-[#64748b] font-semibold">
              Step {step + 1} of {STEPS.length} — <span className="text-[#0f172a]">{STEPS[step]}</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {submitted ? (
            <div className="flex flex-col items-center text-center py-6 gap-4">
              <div className="w-16 h-16 rounded-full bg-[#f0fdf4] flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-[#059669]" />
              </div>
              <div>
                <div className="text-[20px] font-black text-[#0f172a] mb-2">You're in the queue!</div>
                <p className="text-[14px] text-[#64748b] leading-relaxed max-w-[340px]">
                  Our team will review your flight details and contact you within <strong className="text-[#0f172a]">24 hours</strong> with your compensation estimate.
                </p>
              </div>
              <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl px-5 py-4 text-[13px] text-[#0c4a6e] text-left w-full">
                <div className="font-black mb-1 text-[#0369a1]">What happens next?</div>
                <ul className="space-y-1.5">
                  {[
                    'We check your flight against airline & regulation databases',
                    'We send a personalised compensation estimate by email',
                    'No win, no fee — you only pay if we win',
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#059669] font-black shrink-0">✓</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={onClose} className="mt-2 bg-[#0f2744] hover:bg-[#1a3a5c] text-white px-8 py-3 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all">
                Close
              </button>
            </div>
          ) : (
            <>
              {/* STEP 0 — Flight Details */}
              {step === 0 && (
                <div className="space-y-4">
                  <div className="text-[13px] text-[#64748b] mb-2">Enter your flight information so we can look up the disruption record.</div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Flight Number</label>
                    <div className="relative">
                      <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                      <input
                        type="text"
                        value={form.flightNumber}
                        onChange={e => set('flightNumber', e.target.value.toUpperCase())}
                        placeholder="e.g. BA2490"
                        className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Flight Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                      <input
                        type="date"
                        value={form.flightDate}
                        onChange={e => set('flightDate', e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 1 — Route */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-[13px] text-[#64748b] mb-2">Where did you fly from and to?</div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Departure Airport</label>
                    <AirportInput
                      value={form.departure}
                      onChange={val => set('departure', val)}
                      placeholder="City or airport code"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Destination Airport</label>
                    <AirportInput
                      value={form.destination}
                      onChange={val => set('destination', val)}
                      placeholder="City or airport code"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2 — Delay */}
              {step === 2 && (
                <div className="space-y-3">
                  <div className="text-[13px] text-[#64748b] mb-2">How long was the final arrival delay at your destination?</div>
                  {DELAY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('delayDuration', opt.value)}
                      className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 text-left cursor-pointer transition-all duration-200 ${
                        form.delayDuration === opt.value
                          ? 'border-[#2563eb] bg-[#eff6ff] shadow-md'
                          : 'border-[#e2e8f0] bg-white hover:border-[#93c5fd] hover:bg-[#f8faff] hover:shadow-sm'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${form.delayDuration === opt.value ? 'bg-[#2563eb]' : 'bg-[#f1f5f9]'}`}>
                        <Clock className={`w-5 h-5 ${form.delayDuration === opt.value ? 'text-white' : 'text-[#64748b]'}`} />
                      </div>
                      <div>
                        <div className={`text-[14px] font-extrabold ${form.delayDuration === opt.value ? 'text-[#1d4ed8]' : 'text-[#0f172a]'}`}>{opt.label}</div>
                        <div className="text-[12px] text-[#64748b]">{opt.sub}</div>
                      </div>
                      {form.delayDuration === opt.value && (
                        <CheckCircle className="w-5 h-5 text-[#2563eb] ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* STEP 3 — Contact */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="text-[13px] text-[#64748b] mb-2">Almost done — enter your contact details so we can send your compensation estimate.</div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                      <input
                        type="text"
                        value={form.fullName}
                        onChange={e => set('fullName', e.target.value)}
                        placeholder="e.g. Sarah Johnson"
                        className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => set('email', e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-black text-[#0f172a] uppercase tracking-wider mb-1.5">Phone Number <span className="text-[#94a3b8] normal-case font-normal">(optional)</span></label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={e => set('phone', e.target.value)}
                        placeholder="+1 555 000 0000"
                        className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-[#94a3b8] leading-relaxed">
                    By submitting, you agree to our Privacy Policy. We never share your data with third parties.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer nav */}
        {!submitted && (
          <div className="px-6 py-4 border-t border-[#f1f5f9] flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#e2e8f0] text-[13px] font-bold text-[#374151] hover:border-[#cbd5e1] bg-white cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              onClick={step < 3 ? () => setStep(s => s + 1) : handleSubmit}
              disabled={!canAdvance() || submitting}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-black border-none cursor-pointer transition-all duration-200 ${
                canAdvance() && !submitting
                  ? step < 3
                    ? 'bg-[#2563eb] hover:bg-[#1d4ed8] hover:-translate-y-px hover:shadow-lg text-white'
                    : 'bg-[#16a34a] hover:bg-[#15803d] hover:-translate-y-px hover:shadow-lg text-white shadow-md shadow-green-900/20'
                  : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Calculating…
                </span>
              ) : step < 3 ? (
                <><span>Continue</span><ChevronRight className="w-4 h-4" /></>
              ) : (
                'Calculate My Cash Payout'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
