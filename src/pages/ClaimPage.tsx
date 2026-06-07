import { useState, useRef, useEffect } from 'react';
import { Page } from '../types';
import { supabase, sendClaimEmail, insertNotification, AI_URL, AI_HEADERS } from '../lib/supabase';
import { Plane, ArrowRight, ArrowLeft, Check, AlertTriangle, X, Upload, FileText, Image, Trash2 } from 'lucide-react';
import AirportInput from '../components/AirportInput';
import { CheckerPrefill } from '../components/CompensationChecker';

interface Props { onNav: (p: Page) => void; prefill?: CheckerPrefill; }

const TOTAL_STEPS = 4;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type DisruptionType = 'delayed' | 'cancelled' | 'denied' | 'missed';
type DocKey = 'boarding' | 'passport';
type AirlineProvided = 'refund' | 'voucher' | 'meal_voucher' | 'hotel' | 'other';

const DISRUPTION_OPTIONS: { id: DisruptionType; icon: string; label: string }[] = [
  { id: 'delayed',   icon: '⏱',  label: 'Delayed' },
  { id: 'cancelled', icon: '✖',  label: 'Cancelled' },
  { id: 'denied',    icon: '🚫', label: 'Denied Boarding' },
  { id: 'missed',    icon: '🔗', label: 'Missed Connection' },
];

function validateEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validatePhone(v: string) { return /^\+?[\d\s\-().]{7,20}$/.test(v.trim()); }

function delayLabel(val: number): string {
  if (val === 0) return "Not sure";
  if (val >= 13) return "12+ hours";
  return `~${val} hour${val === 1 ? '' : 's'}`;
}

function delayEligibilityText(val: number, type: DisruptionType | ''): { text: string; color: string } | null {
  if (type !== 'delayed') return null;
  if (val === 0) return { text: 'Tell us your delay length so we can check eligibility.', color: '#64748b' };
  if (val < 3) return { text: 'Under 3 hours — typically not eligible under EU261/UK261.', color: '#dc2626' };
  if (val < 8) return { text: 'Potentially eligible under EU261/UK261 (3h+ threshold).', color: '#16a34a' };
  return { text: 'Potentially eligible under EU261, UK261 & Israeli Law (8h+ threshold).', color: '#16a34a' };
}

export default function ClaimPage({ onNav, prefill }: Props) {
  const [step, setStep] = useState(1);

  // ── STEP 1 ─────────────────────────────────────────────────────────────────
  const [flightNumber, setFlightNumber] = useState(prefill?.flight || '');
  const [dep, setDep] = useState(prefill?.dep || '');
  const [arr, setArr] = useState(prefill?.arr || '');
  const [flightDate, setFlightDate] = useState(prefill?.fdate || '');
  const [disruption, setDisruption] = useState<DisruptionType | ''>(() => {
    const issue = prefill?.issue || '';
    if (issue.toLowerCase().includes('cancel')) return 'cancelled';
    if (issue.toLowerCase().includes('denied')) return 'denied';
    if (issue.toLowerCase().includes('missed') || issue.toLowerCase().includes('connect')) return 'missed';
    if (issue.toLowerCase().includes('delay')) return 'delayed';
    return '';
  });
  const [delayHours, setDelayHours] = useState(0);

  // ── STEP 2 ─────────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [additionalPassengers, setAdditionalPassengers] = useState<string[]>(['']);
  const [bookingRef, setBookingRef] = useState('');

  // ── STEP 3: Airline response ────────────────────────────────────────────────
  const [airlineGaveAnything, setAirlineGaveAnything] = useState<boolean | null>(null);
  const [airlineTypes, setAirlineTypes] = useState<AirlineProvided[]>([]);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundCurrency, setRefundCurrency] = useState('EUR');
  const [refundDate, setRefundDate] = useState('');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherCurrency, setVoucherCurrency] = useState('EUR');
  const [voucherExpires, setVoucherExpires] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherSigned, setVoucherSigned] = useState<'yes' | 'no' | 'not_sure' | ''>('');
  const [careDescription, setCareDescription] = useState('');

  // ── STEP 4 ─────────────────────────────────────────────────────────────────
  const [uploadedFiles, setUploadedFiles] = useState<Record<DocKey, File | null>>({ boarding: null, passport: null });
  const [fileErrors, setFileErrors] = useState<Record<DocKey, string>>({ boarding: '', passport: '' });
  const [dragOver, setDragOver] = useState<DocKey | null>(null);
  const boardingInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const docInputRefs: Record<DocKey, React.RefObject<HTMLInputElement>> = {
    boarding: boardingInputRef, passport: passportInputRef,
  };
  const [loaChecked, setLoaChecked] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [sigValidError, setSigValidError] = useState('');
  const sigDataRef = useRef('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const strokeCount = useRef(0);
  const totalDist = useRef(0);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ flightNum?: string; date?: string; dep?: string; arr?: string; airline?: string; passengerName?: string } | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [claimRef, setClaimRef] = useState('');

  const agentCode = new URLSearchParams(window.location.search).get('agent')?.toUpperCase() || '';

  // Canvas init on every render after step 3 mounts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.dataset.init) return;
    canvas.dataset.init = '1';
    const w = canvas.offsetWidth || 560;
    canvas.width = w;
    canvas.height = 200;
    initCtx(canvas);
  });

  function initCtx(c: HTMLCanvasElement) {
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0d1b2a'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  }

  function getPos(e: MouseEvent | TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const sc = c.width / r.width;
    if ('touches' in e) return { x: (e.touches[0].clientX - r.left) * sc, y: (e.touches[0].clientY - r.top) * sc };
    return { x: (e.clientX - r.left) * sc, y: (e.clientY - r.top) * sc };
  }

  function addDistance(p: { x: number; y: number }) {
    if (lastPoint.current) {
      const dx = p.x - lastPoint.current.x; const dy = p.y - lastPoint.current.y;
      totalDist.current += Math.sqrt(dx * dx + dy * dy);
    }
    lastPoint.current = p;
  }

  function isSigValid() { return strokeCount.current >= 2 || totalDist.current >= 150; }

  function onMD(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true; strokeCount.current += 1; lastPoint.current = null;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    applyCtxStyle(ctx); const p = getPos(e.nativeEvent, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); lastPoint.current = p;
  }
  function onMM(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    const p = getPos(e.nativeEvent, c); addDistance(p); ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasSig(true); setSigValidError('');
  }
  function onTS(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault(); drawing.current = true; strokeCount.current += 1; lastPoint.current = null;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    applyCtxStyle(ctx); const p = getPos(e.nativeEvent, c); ctx.beginPath(); ctx.moveTo(p.x, p.y); lastPoint.current = p;
  }
  function onTM(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    const p = getPos(e.nativeEvent, c); addDistance(p); ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasSig(true); setSigValidError('');
  }
  function applyCtxStyle(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#0d1b2a'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  }
  function endStroke() { drawing.current = false; lastPoint.current = null; saveSig(); }

  function clearSig() {
    const c = canvasRef.current; if (!c) return;
    c.dataset.init = ''; c.height = 200; const w = c.offsetWidth || 560; c.width = w; initCtx(c);
    setHasSig(false); setSigValidError(''); sigDataRef.current = '';
    strokeCount.current = 0; totalDist.current = 0; lastPoint.current = null;
  }

  function saveSig() {
    const c = canvasRef.current; if (!c) return;
    const off = document.createElement('canvas'); off.width = c.width || 560; off.height = c.height || 200;
    const ctx = off.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(c, 0, 0); sigDataRef.current = off.toDataURL('image/png');
  }

  function handleFileSelect(key: DocKey, file: File) {
    const extOk = /\.(pdf|jpg|jpeg|png)$/i.test(file.name);
    if (!ALLOWED_MIME.includes(file.type) || !extOk) {
      setFileErrors(e => ({ ...e, [key]: 'Only PDF, JPEG, or PNG files are allowed.' })); return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileErrors(e => ({ ...e, [key]: 'File exceeds 10 MB limit.' })); return;
    }
    setFileErrors(e => ({ ...e, [key]: '' }));
    setUploadedFiles(f => ({ ...f, [key]: file }));
    if (key === 'boarding') parseBoardingPass(file);
  }

  function handleFileInputChange(key: DocKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) handleFileSelect(key, file); e.target.value = '';
  }

  function handleDrop(key: DocKey, e: React.DragEvent) {
    e.preventDefault(); setDragOver(null); const file = e.dataTransfer.files?.[0]; if (file) handleFileSelect(key, file);
  }

  function removeFile(key: DocKey) {
    setUploadedFiles(f => ({ ...f, [key]: null })); setFileErrors(e => ({ ...e, [key]: '' }));
    if (key === 'boarding') setOcrResult(null);
  }

  function formatBytes(b: number) {
    return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  async function parseBoardingPass(file: File) {
    setOcrLoading(true); setOcrResult(null);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch(AI_URL, {
        method: 'POST', headers: AI_HEADERS,
        body: JSON.stringify({
          max_tokens: 400,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
            { type: 'text', text: 'Extract from this boarding pass. Return ONLY JSON: {"flightNum":"BA117","date":"YYYY-MM-DD","dep":"LHR","arr":"JFK","airline":"British Airways","passengerName":"SMITH JOHN"}. Use null if not found.' },
          ]}],
        }),
      });
      const data = await res.json();
      const text: string = data?.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setOcrResult(parsed);
        if (parsed.flightNum && !flightNumber) setFlightNumber(parsed.flightNum);
        if (parsed.date && !flightDate) setFlightDate(parsed.date);
        if (parsed.dep && !dep) setDep(parsed.dep);
        if (parsed.arr && !arr) setArr(parsed.arr);
        if (parsed.passengerName && !fullName) setFullName(parsed.passengerName.replace(/([A-Z]+)\s([A-Z]+)/, '$2 $1'));
      }
    } catch { /* silent */ }
    setOcrLoading(false);
  }

  function goNext() { window.scrollTo(0, 0); setStep(s => s + 1); }
  function goBack() { window.scrollTo(0, 0); setStep(s => Math.max(1, s - 1)); }

  async function submitClaim() {
    if (!hasSig || !isSigValid()) {
      const msg = 'Your signature is required on the Letter of Authority. Please sign clearly with your finger or mouse.';
      setSigValidError(msg);
      canvasWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    const ref = 'CLM-' + Date.now().toString().slice(-6);
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Passenger';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Duplicate check
    if (flightNumber.trim()) {
      const { data: existing } = await supabase
        .from('claims')
        .select('claim_ref')
        .eq('flight_number', flightNumber.trim())
        .eq('flight_date', flightDate)
        .eq('email', email)
        .maybeSingle();
      if (existing) {
        alert(`A claim for this flight has already been submitted under reference ${existing.claim_ref}`);
        setSubmitting(false);
        return;
      }
    }

    const issueLabel = disruption === 'delayed' ? 'Flight Delayed'
      : disruption === 'cancelled' ? 'Flight Cancelled'
      : disruption === 'denied' ? 'Denied Boarding'
      : disruption === 'missed' ? 'Missed Connecting Flight'
      : 'Flight Disruption';

    const additionalNames = additionalPassengers.filter(n => n.trim()).join(', ');

    const airlineDetails: Record<string, unknown> = {};
    if (airlineGaveAnything && airlineTypes.length > 0) {
      if (airlineTypes.includes('refund') && refundAmount) {
        airlineDetails.refund = { amount: parseFloat(refundAmount) || 0, currency: refundCurrency, date: refundDate || null };
      }
      if (airlineTypes.includes('voucher')) {
        airlineDetails.voucher = {
          amount: parseFloat(voucherAmount) || 0, currency: voucherCurrency,
          expires: voucherExpires || null, code: voucherCode.trim() || null,
          signed_or_accepted_terms: voucherSigned || 'not_sure',
        };
      }
      if (airlineTypes.includes('meal_voucher') || airlineTypes.includes('hotel')) {
        airlineDetails.care = { description: careDescription.trim() || null, proof_urls: [] };
      }
    }
    const reviewRequired = !!airlineGaveAnything && (
      airlineTypes.includes('refund') || (airlineTypes.includes('voucher') && voucherSigned === 'yes')
    );

    const { error } = await supabase.from('claims').insert({
      claim_ref: ref,
      passenger_first_name: firstName,
      passenger_last_name: lastName,
      email,
      phone,
      address: '',
      country: '',
      flight_number: flightNumber.trim(),
      flight_date: flightDate || null,
      departure: dep,
      arrival: arr,
      airline: prefill?.airline || '',
      issue_type: issueLabel,
      airline_reason: '',
      status: 'Untouched',
      amount: '€600',
      agent: agentCode || '—',
      loa_signed: hasSig && loaChecked,
      signature_data: sigDataRef.current,
      prior_comp_type: airlineTypes.length > 0 ? airlineTypes.join(', ') : null,
      prior_signed: voucherSigned || null,
      review_required: reviewRequired,
      airline_provided_anything: !!airlineGaveAnything,
      airline_provided_types: airlineTypes,
      airline_provided_details: airlineDetails,
      passengers_count: passengerCount,
      additional_passengers: additionalNames,
      booking_reference: bookingRef.trim(),
      delay_hours: disruption === 'delayed' ? (delayHours >= 13 ? 12.5 : delayHours) : 0,
    });

    if (!error) {
      const { data: newClaim } = await supabase.from('claims').select('id').eq('claim_ref', ref).maybeSingle();

      if (newClaim?.id) {
        const filesToUpload: { key: string; file: File; label: string }[] = [];
        if (uploadedFiles.boarding) filesToUpload.push({ key: 'boarding', file: uploadedFiles.boarding, label: 'Boarding Pass / Ticket' });
        if (uploadedFiles.passport) filesToUpload.push({ key: 'passport', file: uploadedFiles.passport, label: 'Passport / ID' });

        for (const { file, label } of filesToUpload) {
          const storagePath = `claim-files/${newClaim.id}/${Date.now()}-${file.name}`;
          const { error: storageErr } = await supabase.storage.from('claim-files').upload(storagePath, file, { upsert: false });
          await supabase.from('claim_files').insert({
            claim_id: newClaim.id, file_name: file.name, file_size: file.size, file_type: file.type,
            storage_path: storageErr ? '' : storagePath, note: label,
          });
        }
      }

      setClaimRef(ref);
      setSubmitted(true);
      insertNotification({
        type: 'new_claim', claim_ref: ref,
        message: `New claim from ${fullName.trim()} — ${issueLabel} ${dep && arr ? `${dep} → ${arr}` : ''}`.trim(),
      });
      if (email) {
        sendClaimEmail({
          type: 'claim_submitted', to: email, passengerName: fullName.trim(),
          claimRef: ref, airline: prefill?.airline || '',
          route: dep && arr ? `${dep} → ${arr}` : undefined, amount: '€600',
        });
      }
    } else {
      alert('Submission failed. Please try again.');
    }
    setSubmitting(false);
  }

  // ── Can-advance guards ──────────────────────────────────────────────────────
  function canAdvanceStep1() {
    return (dep.trim().length >= 2 && arr.trim().length >= 2) && flightDate.length > 0 && disruption !== '';
  }

  function canAdvanceStep2() {
    return fullName.trim().length >= 2 && validateEmail(email) && validatePhone(phone);
  }

  // ── SUCCESS ─────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-xl p-10 text-center">
          <div className="w-16 h-16 bg-[#16a34a] rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="w-8 h-8 text-white" />
          </div>
          <div className="text-[26px] font-extrabold text-[#0f172a] mb-2">Claim Submitted!</div>
          <div className="text-[14px] text-[#64748b] mb-7">We've received your claim and our team will start working on it right away.</div>
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-2xl p-6 mb-7">
            <div className="text-[11px] font-bold text-[#16a34a] uppercase tracking-wider mb-2">Your Claim Reference</div>
            <div className="text-[34px] font-black text-[#16a34a] tracking-widest">{claimRef}</div>
            <div className="text-[12px] text-[#64748b] mt-1">{email ? `Confirmation sent to ${email}` : 'Keep this reference safe'}</div>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => onNav('dashboard')} className="px-6 py-2.5 bg-[#0f2744] text-white rounded-xl text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1a3a5c]">Track My Claim</button>
            <button onClick={() => onNav('home')} className="px-6 py-2.5 bg-white border-2 border-[#e2e8f0] text-[#374151] rounded-xl text-[13px] font-semibold cursor-pointer hover:border-[#94a3b8]">Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  // ── SIDEBAR STAGES ──────────────────────────────────────────────────────────
  const stages = [
    { label: 'Flight Details',     sub: 'Route, date & disruption' },
    { label: 'Your Details',       sub: 'Passengers & contact' },
    { label: "Airline's Response", sub: 'What they offered you' },
    { label: 'Sign & Submit',      sub: 'Documents & authorization' },
  ];
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen flex" style={{ background: '#f1f5f9' }}>
      {/* Sidebar */}
      <div
        className="hidden md:flex w-[260px] shrink-0 flex-col justify-between p-7 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0f2744 0%, #1a3a6b 60%, #1e4db7 100%)', minHeight: '100vh' }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Ccircle cx='20' cy='20' r='1.5'/%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative">
          <button onClick={() => onNav('home')} className="flex items-center gap-2 mb-8 border-none bg-transparent cursor-pointer p-0">
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="text-[14px] font-bold tracking-wide text-white/90">ClaimVelo</span>
          </button>
          <div className="text-[15px] font-extrabold leading-snug mb-7 text-white/95">Submit your flight compensation claim</div>
          <div className="flex flex-col gap-4">
            {stages.map((stage, i) => {
              const done = i < step - 1;
              const active = i === step - 1;
              return (
                <div key={stage.label} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${done ? 'bg-emerald-400 text-white' : active ? 'bg-white text-[#1a3a6b]' : 'bg-white/10 text-white/30 border border-white/20'}`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    {i < stages.length - 1 && (
                      <div className={`w-px h-8 transition-all ${done ? 'bg-emerald-400/50' : 'bg-white/15'}`} />
                    )}
                  </div>
                  <div className="pt-0.5">
                    <div className={`text-[13px] font-bold transition-all ${active ? 'text-white' : done ? 'text-emerald-300' : 'text-white/35'}`}>{stage.label}</div>
                    <div className={`text-[11px] mt-0.5 transition-all ${active ? 'text-white/70' : 'text-white/25'}`}>{stage.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Trust signals */}
        <div className="relative mt-6 pt-5 border-t border-white/10 space-y-2">
          {['No win, no fee — ever', '30% fee only on success', '350+ airlines covered'].map(t => (
            <div key={t} className="flex items-center gap-2 text-[11px] text-white/50">
              <Check className="w-3 h-3 text-emerald-400 shrink-0" /> {t}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Progress header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => onNav('home')} className="md:hidden flex items-center gap-2 border-none bg-transparent cursor-pointer mr-2">
            <div className="w-7 h-7 bg-[#0f2744] rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step {step} of {TOTAL_STEPS} — <span className="text-[#0f172a]">{stages[step - 1].label}</span></span>
              <span className="text-[11px] font-bold text-slate-400">{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#1d4ed8,#3b82f6)' }} />
            </div>
          </div>
          <button onClick={() => onNav('home')} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center border-none cursor-pointer transition-colors shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-4 sm:py-8 md:px-10 md:py-10">
          <div className="max-w-[680px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="p-5 sm:p-7 md:p-10">

              {/* ── STEP 1: Flight Details ─────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <h2 className="text-[22px] font-extrabold text-[#0f172a] mb-1">Flight Details</h2>
                  <p className="text-[13px] text-[#64748b] mb-6">Tell us about the flight that was disrupted.</p>

                  {prefill && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f0f4ff] border border-[#c7d0ff] rounded-xl mb-5 text-[12px] text-[#1e40af] font-semibold">
                      <Check className="w-4 h-4 shrink-0" /> Pre-filled from your quick check
                    </div>
                  )}

                  <div className="flex flex-col gap-5">
                    {/* Flight number */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Flight Number <span className="text-[#94a3b8] font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none" />
                        <input
                          value={flightNumber}
                          onChange={e => setFlightNumber(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                          placeholder="e.g. BA2490, FR1234"
                          maxLength={8}
                          className="w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Route */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                          Departure Airport <span className="text-[#dc2626]">*</span>
                        </label>
                        <AirportInput value={dep} onChange={setDep} placeholder="City or airport code" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                          Arrival Airport <span className="text-[#dc2626]">*</span>
                        </label>
                        <AirportInput value={arr} onChange={setArr} placeholder="City or airport code" />
                      </div>
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Date of Flight <span className="text-[#dc2626]">*</span>
                      </label>
                      <input
                        type="date"
                        value={flightDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={e => setFlightDate(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-xl text-[14px] outline-none transition-colors bg-white"
                      />
                    </div>

                    {/* Disruption type */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-2">
                        What happened? <span className="text-[#dc2626]">*</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {DISRUPTION_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDisruption(opt.id)}
                            className={`flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border-2 cursor-pointer transition-all text-center ${
                              disruption === opt.id
                                ? 'border-[#2563eb] bg-[#eff6ff] shadow-md'
                                : 'border-[#e2e8f0] bg-white hover:border-[#2563eb] hover:bg-[#f8fbff]'
                            }`}
                          >
                            <span className="text-xl leading-none">{opt.icon}</span>
                            <span className={`text-[11px] font-bold leading-tight ${disruption === opt.id ? 'text-[#1d4ed8]' : 'text-[#374151]'}`}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Delay slider — only for delayed */}
                    {disruption === 'delayed' && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[12px] font-semibold text-[#374151]">How long was the delay?</label>
                          <span
                            className="text-[13px] font-black px-2.5 py-0.5 rounded-full"
                            style={{
                              background: delayHours === 0 ? '#f1f5f9' : delayHours < 3 ? '#fef2f2' : '#f0fdf4',
                              color: delayHours === 0 ? '#64748b' : delayHours < 3 ? '#dc2626' : '#16a34a',
                            }}
                          >
                            {delayLabel(delayHours)}
                          </span>
                        </div>
                        <div className="relative py-2">
                          <input
                            type="range"
                            min={0}
                            max={13}
                            step={1}
                            value={delayHours}
                            onChange={e => setDelayHours(Number(e.target.value))}
                            className="w-full h-2 rounded-full outline-none cursor-pointer"
                            style={{
                              appearance: 'none',
                              background: `linear-gradient(to right, ${delayHours < 3 ? '#ef4444' : '#2563eb'} 0%, ${delayHours < 3 ? '#ef4444' : '#2563eb'} ${(delayHours / 13) * 100}%, #e2e8f0 ${(delayHours / 13) * 100}%, #e2e8f0 100%)`,
                            }}
                          />
                          <div className="flex justify-between text-[10px] text-[#94a3b8] mt-1.5">
                            <span>Not sure</span>
                            <span className="text-[#16a34a] font-bold">3h (EU261)</span>
                            <span className="text-[#16a34a] font-bold">8h (IL)</span>
                            <span>12h+</span>
                          </div>
                        </div>
                        {(() => {
                          const info = delayEligibilityText(delayHours, disruption);
                          if (!info) return null;
                          return (
                            <div className="mt-1 text-[12px] font-semibold" style={{ color: info.color }}>
                              {info.text}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={goNext}
                    disabled={!canAdvanceStep1()}
                    className="mt-7 w-full flex items-center justify-center gap-2 py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* ── STEP 2: Passenger Details ──────────────────────────────── */}
              {step === 2 && (
                <div>
                  <h2 className="text-[22px] font-extrabold text-[#0f172a] mb-1">Your Details</h2>
                  <p className="text-[13px] text-[#64748b] mb-6">We'll use these to contact you and file your claim.</p>

                  <div className="flex flex-col gap-4">
                    {/* Full name */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Full Name <span className="text-[#dc2626]">*</span>
                      </label>
                      <input
                        value={fullName}
                        onChange={e => setFullName(e.target.value.replace(/[^A-Za-z\s'-]/g, ''))}
                        placeholder="Jane Smith"
                        className="w-full px-4 py-3 border-2 border-[#e2e8f0] focus:border-[#0f2744] rounded-xl text-[14px] outline-none transition-colors"
                      />
                      <div className="text-[11px] text-[#94a3b8] mt-1">As it appears on your passport or ID</div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Email Address <span className="text-[#dc2626]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className={`w-full px-4 py-3 pr-10 border-2 rounded-xl text-[14px] outline-none transition-colors ${
                            email ? validateEmail(email) ? 'border-[#16a34a]' : 'border-[#dc2626]' : 'border-[#e2e8f0] focus:border-[#0f2744]'
                          }`}
                        />
                        {email && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base select-none">
                            {validateEmail(email) ? '✅' : '❌'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Phone Number <span className="text-[#dc2626]">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+44 7700 900000"
                        className={`w-full px-4 py-3 border-2 rounded-xl text-[14px] outline-none transition-colors ${
                          phone ? validatePhone(phone) ? 'border-[#16a34a]' : 'border-[#dc2626]' : 'border-[#e2e8f0] focus:border-[#0f2744]'
                        }`}
                      />
                    </div>

                    {/* Number of passengers */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-2">
                        Number of Passengers
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const n = Math.max(1, passengerCount - 1);
                            setPassengerCount(n);
                            setAdditionalPassengers(prev => prev.slice(0, n - 1).concat(n > 1 && prev.length < n - 1 ? [''] : []));
                          }}
                          className="w-10 h-10 rounded-xl border-2 border-[#e2e8f0] bg-white flex items-center justify-center text-xl font-bold text-[#374151] cursor-pointer hover:border-[#0f2744] transition-colors select-none"
                        >−</button>
                        <span className="w-10 text-center text-[18px] font-black text-[#0f172a]">{passengerCount}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const n = Math.min(9, passengerCount + 1);
                            setPassengerCount(n);
                            setAdditionalPassengers(prev => {
                              const next = [...prev];
                              while (next.length < n - 1) next.push('');
                              return next;
                            });
                          }}
                          className="w-10 h-10 rounded-xl border-2 border-[#e2e8f0] bg-white flex items-center justify-center text-xl font-bold text-[#374151] cursor-pointer hover:border-[#0f2744] transition-colors select-none"
                        >+</button>
                        <span className="text-[12px] text-[#64748b]">passenger{passengerCount !== 1 ? 's' : ''} on this claim</span>
                      </div>

                      {/* Additional passenger names */}
                      {passengerCount > 1 && (
                        <div className="mt-3 space-y-2.5 border-2 border-[#dbeafe] bg-[#f8fbff] rounded-xl p-4">
                          <div className="text-[11px] font-bold text-[#1e40af] uppercase tracking-wider">Additional Passengers</div>
                          {additionalPassengers.slice(0, passengerCount - 1).map((name, idx) => (
                            <div key={idx}>
                              <label className="block text-[11px] font-semibold text-[#374151] mb-1">
                                Passenger {idx + 2} full name
                              </label>
                              <input
                                value={name}
                                onChange={e => {
                                  const updated = [...additionalPassengers];
                                  updated[idx] = e.target.value.replace(/[^A-Za-z\s'-]/g, '');
                                  setAdditionalPassengers(updated);
                                }}
                                placeholder="Full name"
                                className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#2563eb] rounded-lg text-[13px] outline-none transition-colors bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Booking reference */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                        Booking Reference <span className="text-[#94a3b8] font-normal">(optional)</span>
                      </label>
                      <input
                        value={bookingRef}
                        onChange={e => setBookingRef(e.target.value.toUpperCase())}
                        placeholder="e.g. X7KLMQ"
                        className="w-full px-4 py-3 border-2 border-[#e2e8f0] focus:border-[#0f2744] rounded-xl text-[14px] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="mt-7 flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white hover:bg-slate-50 transition-colors" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={goNext}
                      disabled={!canAdvanceStep2()}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Continue <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Airline's Response ────────────────────────────── */}
              {step === 3 && (
                <div>
                  <h2 className="text-[22px] font-extrabold text-[#0f172a] mb-1">Airline's Response</h2>
                  <p className="text-[13px] text-[#64748b] mb-6">Did the airline already offer you anything? This helps us maximise what you're owed.</p>

                  {/* Yes / No */}
                  <div className="mb-6">
                    <p className="text-[12px] font-semibold text-[#374151] mb-2">Did the airline offer or pay you anything? <span className="text-[#dc2626]">*</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { val: false, label: 'No — nothing offered' },
                        { val: true,  label: 'Yes — they gave me something' },
                      ] as { val: boolean; label: string }[]).map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => { setAirlineGaveAnything(opt.val); if (!opt.val) setAirlineTypes([]); }}
                          className={`px-4 py-3.5 rounded-xl border-2 text-[13px] font-semibold text-left cursor-pointer transition-all ${
                            airlineGaveAnything === opt.val
                              ? 'border-[#1d4ed8] bg-[#eff6ff] text-[#1d4ed8]'
                              : 'border-[#e2e8f0] bg-white text-[#374151] hover:border-[#93c5fd]'
                          }`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Type checkboxes */}
                  {airlineGaveAnything === true && (
                    <div className="mb-5">
                      <p className="text-[12px] font-semibold text-[#374151] mb-2">What did they provide? <span className="text-[#94a3b8] font-normal">(select all that apply)</span></p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {([
                          { id: 'refund',       label: 'Cash refund',             sub: 'Money returned to your account' },
                          { id: 'voucher',      label: 'Travel voucher / credit', sub: 'Future credit for flights' },
                          { id: 'meal_voucher', label: 'Meal vouchers',           sub: 'Food & drinks at the airport' },
                          { id: 'hotel',        label: 'Hotel accommodation',    sub: 'Overnight stay arranged by airline' },
                          { id: 'other',        label: 'Something else',         sub: 'Any other form of assistance' },
                        ] as { id: AirlineProvided; label: string; sub: string }[]).map(opt => {
                          const checked = airlineTypes.includes(opt.id);
                          return (
                            <label key={opt.id} className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-[#1d4ed8] bg-[#eff6ff]' : 'border-[#e2e8f0] bg-white hover:border-[#93c5fd]'}`}>
                              <input type="checkbox" checked={checked}
                                onChange={e => setAirlineTypes(prev => e.target.checked ? [...prev, opt.id] : prev.filter(t => t !== opt.id))}
                                className="mt-0.5 accent-[#1d4ed8] shrink-0 w-4 h-4" />
                              <div>
                                <p className={`text-[13px] font-semibold ${checked ? 'text-[#1d4ed8]' : 'text-[#0f172a]'}`}>{opt.label}</p>
                                <p className="text-[11px] text-[#64748b] mt-0.5">{opt.sub}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Refund sub-form */}
                  {airlineGaveAnything && airlineTypes.includes('refund') && (
                    <div className="mb-5 border-2 border-[#dbeafe] bg-[#f8fbff] rounded-2xl p-5">
                      <p className="text-[13px] font-bold text-[#1e40af] mb-3">Refund details</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Amount</label>
                          <input type="number" min="0" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                            placeholder="e.g. 120" className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none transition-colors" /></div>
                        <div><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Currency</label>
                          <select value={refundCurrency} onChange={e => setRefundCurrency(e.target.value)}
                            className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none bg-white transition-colors">
                            <option>EUR</option><option>GBP</option><option>USD</option><option>ILS</option><option>Other</option>
                          </select></div>
                        <div className="col-span-2 sm:col-span-1"><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Date received</label>
                          <input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)}
                            className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none bg-white transition-colors" /></div>
                      </div>
                      <div className="mt-3 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-xl text-[12px] text-[#92400e]">
                        A cash refund may affect your right to additional EU261 compensation. Our team will assess this as part of your claim.
                      </div>
                    </div>
                  )}

                  {/* Voucher sub-form */}
                  {airlineGaveAnything && airlineTypes.includes('voucher') && (
                    <div className="mb-5 border-2 border-[#dbeafe] bg-[#f8fbff] rounded-2xl p-5">
                      <p className="text-[13px] font-bold text-[#1e40af] mb-3">Travel voucher details</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                        <div><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Amount</label>
                          <input type="number" min="0" step="0.01" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)}
                            placeholder="e.g. 200" className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none transition-colors" /></div>
                        <div><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Currency</label>
                          <select value={voucherCurrency} onChange={e => setVoucherCurrency(e.target.value)}
                            className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none bg-white transition-colors">
                            <option>EUR</option><option>GBP</option><option>USD</option><option>ILS</option><option>Other</option>
                          </select></div>
                        <div className="col-span-2 sm:col-span-1"><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Expiry date</label>
                          <input type="date" value={voucherExpires} onChange={e => setVoucherExpires(e.target.value)}
                            className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none bg-white transition-colors" /></div>
                      </div>
                      <div className="mb-3"><label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Voucher code <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                        <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} placeholder="e.g. VOUCHERXYZ"
                          className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none transition-colors font-mono" /></div>
                      <p className="text-[11px] font-semibold text-[#374151] mb-2">Did you sign or formally accept the voucher terms? <span className="text-[#dc2626]">*</span></p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: 'yes' as const, label: 'Yes, I signed' },
                          { val: 'no' as const, label: "No, I didn't" },
                          { val: 'not_sure' as const, label: 'Not sure' },
                        ]).map(opt => (
                          <button key={opt.val} type="button" onClick={() => setVoucherSigned(opt.val)}
                            className={`px-3 py-2.5 rounded-xl border-2 text-[12px] font-semibold cursor-pointer transition-all ${voucherSigned === opt.val ? 'border-[#1d4ed8] bg-[#eff6ff] text-[#1d4ed8]' : 'border-[#e2e8f0] bg-white text-[#374151] hover:border-[#93c5fd]'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {voucherSigned === 'yes' && (
                        <div className="mt-3 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-[12px] text-[#991b1b]">
                          Signing a voucher may limit your cash compensation rights. Our team will review this carefully.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Care sub-form */}
                  {airlineGaveAnything && (airlineTypes.includes('meal_voucher') || airlineTypes.includes('hotel')) && (
                    <div className="mb-5 border-2 border-[#dbeafe] bg-[#f8fbff] rounded-2xl p-5">
                      <p className="text-[13px] font-bold text-[#1e40af] mb-3">Airport care details</p>
                      <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Brief description <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                      <textarea value={careDescription} onChange={e => setCareDescription(e.target.value)} rows={2}
                        placeholder="e.g. 2 meal vouchers (€10 each) + 1 hotel night at Hilton"
                        className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] focus:border-[#1d4ed8] rounded-xl text-[13px] outline-none transition-colors resize-none" />
                    </div>
                  )}

                  {airlineGaveAnything === false && (
                    <div className="mb-5 p-3.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-[13px] text-[#166534]">
                      Good — you are entitled to the full statutory compensation. We will pursue the maximum amount on your behalf.
                    </div>
                  )}

                  <div className="mt-7 flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white hover:bg-slate-50 transition-colors" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button onClick={goNext}
                      disabled={airlineGaveAnything === null || (airlineGaveAnything === true && airlineTypes.length === 0)}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Continue <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: Documents & Sign ───────────────────────────────── */}
              {step === 4 && (
                <div>
                  <h2 className="text-[22px] font-extrabold text-[#0f172a] mb-1">Documents & Signature</h2>
                  <p className="text-[13px] text-[#64748b] mb-6">Upload supporting documents and sign to authorize your claim.</p>

                  {/* File uploads */}
                  <div className="flex flex-col gap-3 mb-6">
                    {([
                      { key: 'boarding' as DocKey, label: 'Boarding Pass / Ticket', sub: 'PDF, JPEG or PNG · Max 10 MB · Required', req: true },
                      { key: 'passport' as DocKey, label: 'Passport or ID', sub: 'PDF, JPEG or PNG · Max 10 MB · Optional', req: false },
                    ]).map(({ key, label, sub, req }) => {
                      const file = uploadedFiles[key];
                      const err = fileErrors[key];
                      const isDragging = dragOver === key;
                      const isPdf = file?.type === 'application/pdf';
                      return (
                        <div key={key}>
                          <input ref={docInputRefs[key]} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleFileInputChange(key, e)} />
                          {file ? (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#16a34a] bg-[#f0fdf4]">
                              <div className="w-9 h-9 rounded-lg bg-[#16a34a]/10 flex items-center justify-center shrink-0">
                                {isPdf ? <FileText className="w-5 h-5 text-[#16a34a]" /> : <Image className="w-5 h-5 text-[#16a34a]" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-[13px] text-[#0f172a] truncate">{file.name}</div>
                                <div className="text-[11px] text-[#64748b]">{formatBytes(file.size)} · {label}</div>
                              </div>
                              <Check className="w-4 h-4 text-[#16a34a] shrink-0" />
                              <button type="button" onClick={() => removeFile(key)} className="w-7 h-7 rounded-lg bg-[#fee2e2] flex items-center justify-center border-none cursor-pointer hover:bg-[#fecaca] shrink-0">
                                <Trash2 className="w-3.5 h-3.5 text-[#dc2626]" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => docInputRefs[key].current?.click()}
                              onDragOver={e => { e.preventDefault(); setDragOver(key); }}
                              onDragLeave={() => setDragOver(null)}
                              onDrop={e => handleDrop(key, e)}
                              className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${isDragging ? 'border-[#0f2744] bg-[#eff6ff]' : err ? 'border-[#fca5a5] bg-[#fef2f2]' : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-[#0f2744] hover:bg-[#f0f4ff]'}`}
                            >
                              <div className="w-10 h-10 rounded-full bg-white border-2 border-[#e2e8f0] flex items-center justify-center">
                                <Upload className="w-4 h-4 text-[#64748b]" />
                              </div>
                              <div className="text-center">
                                <div className="text-[13px] font-semibold text-[#0f172a]">{label} {req && <span className="text-[#dc2626]">*</span>}</div>
                                <div className="text-[11px] text-[#64748b] mt-0.5">{sub}</div>
                                <div className="text-[11px] text-[#2563eb] font-medium mt-1">{isDragging ? 'Drop to upload' : 'Click to browse or drag & drop'}</div>
                              </div>
                            </div>
                          )}
                          {err && <div className="mt-1.5 text-[11px] text-[#dc2626] font-medium px-1">{err}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* OCR feedback */}
                  {ocrLoading && (
                    <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl text-[12px] text-[#1e40af] mb-4 flex items-center gap-2">
                      <span className="animate-spin w-3.5 h-3.5 border-2 border-[#2563eb] border-t-transparent rounded-full shrink-0" />
                      Reading boarding pass with AI — pre-filling your details...
                    </div>
                  )}
                  {!ocrLoading && ocrResult && (
                    <div className="p-3.5 bg-[#f0fdf4] border border-[#86efac] rounded-xl text-[12px] text-[#166534] mb-4">
                      <div className="font-semibold mb-1.5 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Details extracted from boarding pass</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {ocrResult.passengerName && <span>Passenger: <strong>{ocrResult.passengerName}</strong></span>}
                        {ocrResult.flightNum && <span>Flight: <strong>{ocrResult.flightNum}</strong></span>}
                        {ocrResult.date && <span>Date: <strong>{ocrResult.date}</strong></span>}
                        {ocrResult.dep && <span>From: <strong>{ocrResult.dep}</strong></span>}
                        {ocrResult.arr && <span>To: <strong>{ocrResult.arr}</strong></span>}
                      </div>
                    </div>
                  )}

                  {!uploadedFiles.boarding && (
                    <div className="flex items-center gap-2 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-xl text-[12px] text-[#92400e] mb-5">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> Boarding pass or ticket is required to submit your claim.
                    </div>
                  )}

                  {/* LOA */}
                  <div className="border-2 border-[#e2e8f0] rounded-2xl p-5 mb-5">
                    <div className="font-bold text-[15px] text-[#0f172a] mb-3">Letter of Authority <span className="text-[#dc2626]">*</span></div>
                    <label className="flex items-start gap-3 cursor-pointer text-[13px] text-[#374151] leading-relaxed">
                      <input type="checkbox" checked={loaChecked} onChange={e => setLoaChecked(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#0f2744] shrink-0" />
                      <span>I authorize <strong className="mx-0.5">ClaimVelo Ltd.</strong> to act as my authorised representative and pursue compensation on my behalf under EC Regulation 261/2004 / UK261 / Israeli Aviation Law. I agree to a <strong>30% success fee</strong> (50% if legal action is required). No charge if unsuccessful. <strong>No-Win, No-Fee.</strong></span>
                    </label>
                  </div>

                  {/* Signature */}
                  {loaChecked && (
                    <div ref={canvasWrapRef} className="border-2 border-[#e2e8f0] rounded-2xl p-5 mb-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-bold text-[14px] text-[#0f172a]">Sign below <span className="text-[#dc2626]">*</span></div>
                          <div className="text-[11px] text-[#94a3b8] mt-0.5">Use your mouse or finger to sign</div>
                        </div>
                        {hasSig && isSigValid() && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#16a34a]">
                            <Check className="w-3.5 h-3.5" /> Signed
                          </span>
                        )}
                      </div>

                      <div className={`rounded-xl overflow-hidden transition-all ${sigValidError ? 'ring-2 ring-[#dc2626]' : 'ring-1 ring-[#e2e8f0]'}`} style={{ minHeight: 200 }}>
                        <div className="relative" style={{ minHeight: 200 }}>
                          {!hasSig && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                              <span className="text-[15px] text-[#d1d5db] font-light tracking-wide italic">Sign here...</span>
                            </div>
                          )}
                          <canvas
                            ref={canvasRef}
                            style={{ display: 'block', width: '100%', minHeight: 200, cursor: 'crosshair', touchAction: 'none', background: 'transparent' }}
                            onMouseDown={onMD} onMouseMove={onMM} onMouseUp={endStroke} onMouseLeave={endStroke}
                            onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={endStroke}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2">
                        <button type="button" onClick={clearSig} className="px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0]">Clear</button>
                        <span className={`text-[12px] font-medium ${hasSig && isSigValid() ? 'text-[#16a34a]' : 'text-[#94a3b8]'}`}>
                          {hasSig && isSigValid() ? '✓ Signature captured' : hasSig ? 'Keep going — more detail needed' : 'Draw your full signature above'}
                        </span>
                      </div>

                      {sigValidError && (
                        <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-[#fff1f2] border-2 border-[#fecdd3] rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-[#dc2626] shrink-0 mt-0.5" />
                          <span className="text-[12px] text-[#991b1b] font-medium leading-snug">{sigValidError}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Claim summary */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {[
                      ['Passenger', fullName.trim() || '—'],
                      ['Email', email || '—'],
                      ['Flight', flightNumber || '—'],
                      ['Date', flightDate || '—'],
                      ['Route', dep && arr ? `${dep} → ${arr}` : '—'],
                      ['Compensation', '€600'],
                    ].map(([l, v]) => (
                      <div key={l} className="bg-[#f8fafc] rounded-xl px-3 py-2.5 border border-[#e2e8f0]">
                        <div className="text-[10px] text-[#64748b] mb-0.5 uppercase tracking-wider font-semibold">{l}</div>
                        <div className={`font-semibold text-[12px] truncate ${l === 'Compensation' ? 'text-[#16a34a]' : 'text-[#0f172a]'}`}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white hover:bg-slate-50 transition-colors" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={submitClaim}
                      disabled={submitting || !uploadedFiles.boarding || !loaChecked}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting
                        ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Submitting...</>
                        : <>Submit Claim <ArrowRight className="w-5 h-5" /></>
                      }
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
