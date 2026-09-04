import { useState, useRef, useEffect } from 'react';
import { Page } from '../types';
import { supabase, lookupFlight, FlightLookupResult, AI_URL, AI_HEADERS } from '../lib/supabase';
import { Plane, ArrowRight, ArrowLeft, Check, Search, AlertTriangle, X, Upload, FileText, Image, Trash2, Ban } from 'lucide-react';
import AirportInput from '../components/AirportInput';
import { CheckerPrefill } from '../components/CompensationChecker';
import IssueTypeSelector, { type IssueType } from '../components/IssueTypeSelector';
import CancellationFields from '../components/CancellationFields';
import DeniedBoardingFields from '../components/DeniedBoardingFields';
import ConnectingFlightFields, { type SegmentData } from '../components/ConnectingFlightFields';

interface Props { onNav: (p: Page) => void; prefill?: CheckerPrefill; }

// Steps: 1=Contact+Journey, 2=FlightSearch, 3=ConfirmFlight+Disruption, 4=Documents+LOA, 5=Success

const TOTAL_STEPS = 4;

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const AIRLINE_REASONS = [
  'Technical fault',
  'Bad weather',
  'Air traffic control',
  'Crew shortage / strike',
  'No reason given',
  'Other reason',
] as const;

type AirlineReason = typeof AIRLINE_REASONS[number];

const EXTRAORDINARY_REASONS: AirlineReason[] = ['Bad weather', 'Air traffic control'];

function validateEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validatePhone(v: string) { return /^\+?[\d\s\-().]{7,20}$/.test(v.trim()); }
function validateFlightNumber(v: string) { return /^[A-Za-z]{2,3}\d{1,4}$/.test(v.trim()); }

function formatDelay(min: number): string {
  if (min === 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return `${h} hours`;
  return `${h} hours and ${m} minutes`;
}

type DocKey = 'booking' | 'passport' | 'boarding';

type ConfirmedFlight = {
  flightNum: string;
  airline: string;
  depAirport: string;
  depCode: string;
  arrAirport: string;
  arrCode: string;
  depTime: string;
  arrTime: string;
  delayMin: number;
  status: string;
  date: string;
};

export default function ClaimPage({ onNav, prefill }: Props) {
  const [step, setStep] = useState(1);

  // ── STEP 1 ────────────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [connecting, setConnecting] = useState<boolean | null>(null);
  const [viaAirport, setViaAirport] = useState('');

  // ── STEP 2 ────────────────────────────────────────────────────────────────────
  const [flightDate, setFlightDate] = useState(prefill?.fdate || '');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightNumError, setFlightNumError] = useState('');
  const [searchDone, setSearchDone] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hardBlocked, setHardBlocked] = useState(false);
  const [searchResults, setSearchResults] = useState<ConfirmedFlight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<ConfirmedFlight | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualFlight, setManualFlight] = useState('');
  const [manualAirline, setManualAirline] = useState('');

  // dep/arr derived from prefill or route fields
  const [dep, setDep] = useState(prefill?.dep || '');
  const [arr, setArr] = useState(prefill?.arr || '');

  // ── STEP 3 ────────────────────────────────────────────────────────────────────
  const [airlineReason, setAirlineReason] = useState<AirlineReason | ''>('');
  const [reasonBlocked, setReasonBlocked] = useState(false);

  // Issue type + conditional fields
  const [issueType, setIssueType] = useState<IssueType | ''>('');
  const [cancellationNoticeDate, setCancellationNoticeDate] = useState('');
  const [cancellationNoticeSource, setCancellationNoticeSource] = useState('');
  const [replacementOffered, setReplacementOffered] = useState(false);
  const [replacementAccepted, setReplacementAccepted] = useState(false);
  const [replacementFlightNumber, setReplacementFlightNumber] = useState('');
  const [boardingType, setBoardingType] = useState('');
  const [confirmedReservation, setConfirmedReservation] = useState<boolean | null>(null);
  const [checkedInOnTime, setCheckedInOnTime] = useState<boolean | null>(null);
  const [denialReason, setDenialReason] = useState('');

  // Connecting flight segments
  const [isSingleBooking, setIsSingleBooking] = useState<boolean | null>(null);
  const [segments, setSegments] = useState<SegmentData[]>([]);

  // Prior compensation check
  type PriorCompType = 'Food & Hotel Vouchers' | 'Cash' | 'Flight Voucher';
  type PriorSigType = 'Yes' | 'No' | 'Unsure';
  const [priorComp, setPriorComp] = useState<'No' | 'Yes' | ''>('');
  const [priorCompType, setPriorCompType] = useState<PriorCompType | ''>('');
  const [priorSigned, setPriorSigned] = useState<PriorSigType | ''>('');

  const priorHardBlocked =
    priorComp === 'Yes' &&
    (priorCompType === 'Cash' || priorCompType === 'Flight Voucher') &&
    priorSigned === 'Yes';

  const priorReviewFlag =
    priorComp === 'Yes' &&
    (priorCompType === 'Cash' || priorCompType === 'Flight Voucher') &&
    (priorSigned === 'No' || priorSigned === 'Unsure');

  // ── STEP 4 ────────────────────────────────────────────────────────────────────
  const [uploadedFiles, setUploadedFiles] = useState<Record<DocKey, File | null>>({ booking: null, passport: null, boarding: null });
  const [fileErrors, setFileErrors] = useState<Record<DocKey, string>>({ booking: '', passport: '', boarding: '' });
  const [dragOver, setDragOver] = useState<DocKey | null>(null);
  const bookingInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const boardingInputRef = useRef<HTMLInputElement>(null);
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

  // Agent code
  const [agentCode] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('agent');
    return p ? p.toUpperCase() : '';
  });

  // Submission
  const [submitting, setSubmitting] = useState(false);

  // Canvas init — runs whenever canvas mounts (step 4 / loaChecked)
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
    ctx.strokeStyle = '#0d1b2a';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function getPos(e: MouseEvent | TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const sc = c.width / r.width;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - r.left) * sc, y: (e.touches[0].clientY - r.top) * sc };
    }
    return { x: (e.clientX - r.left) * sc, y: (e.clientY - r.top) * sc };
  }

  function addDistance(p: { x: number; y: number }) {
    if (lastPoint.current) {
      const dx = p.x - lastPoint.current.x;
      const dy = p.y - lastPoint.current.y;
      totalDist.current += Math.sqrt(dx * dx + dy * dy);
    }
    lastPoint.current = p;
  }

  function isSigValid(): boolean {
    // Must have either 2+ stroke segments OR 150+ px cumulative distance
    return strokeCount.current >= 2 || totalDist.current >= 150;
  }

  function onMD(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true;
    strokeCount.current += 1;
    lastPoint.current = null;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    applyCtxStyle(ctx);
    const p = getPos(e.nativeEvent, c);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    lastPoint.current = p;
  }
  function onMM(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    const p = getPos(e.nativeEvent, c);
    addDistance(p);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasSig(true);
    setSigValidError('');
  }
  function onTS(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    strokeCount.current += 1;
    lastPoint.current = null;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    applyCtxStyle(ctx);
    const p = getPos(e.nativeEvent, c);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    lastPoint.current = p;
  }
  function onTM(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    const p = getPos(e.nativeEvent, c);
    addDistance(p);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasSig(true);
    setSigValidError('');
  }
  function applyCtxStyle(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#0d1b2a';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }
  function endStroke() {
    drawing.current = false;
    lastPoint.current = null;
    saveSig();
  }

  function clearSig() {
    const c = canvasRef.current;
    if (!c) return;
    c.dataset.init = '';
    c.height = 200;
    const w = c.offsetWidth || 560;
    c.width = w;
    initCtx(c);
    setHasSig(false);
    setSigValidError('');
    sigDataRef.current = '';
    strokeCount.current = 0;
    totalDist.current = 0;
    lastPoint.current = null;
  }

  function saveSig() {
    const c = canvasRef.current;
    if (!c) return;
    const off = document.createElement('canvas');
    off.width = c.width || 560;
    off.height = c.height || 200;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(c, 0, 0);
    sigDataRef.current = off.toDataURL('image/png');
  }

  const docInputRefs: Record<DocKey, React.RefObject<HTMLInputElement>> = {
    booking: bookingInputRef, passport: passportInputRef, boarding: boardingInputRef,
  };

  function handleFileSelect(key: DocKey, file: File) {
    const extOk = /\.(pdf|jpg|jpeg|png)$/i.test(file.name);
    if (!ALLOWED_MIME.includes(file.type) || !extOk) {
      setFileErrors(e => ({ ...e, [key]: 'Only PDF, JPEG, or PNG files are allowed.' }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileErrors(e => ({ ...e, [key]: 'File exceeds 10 MB limit.' }));
      return;
    }
    setFileErrors(e => ({ ...e, [key]: '' }));
    setUploadedFiles(f => ({ ...f, [key]: file }));
    if (key === 'boarding') parseBoardingPass(file);
  }

  function handleFileInputChange(key: DocKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(key, file);
    e.target.value = '';
  }

  function handleDrop(key: DocKey, e: React.DragEvent) {
    e.preventDefault(); setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(key, file);
  }

  function removeFile(key: DocKey) {
    setUploadedFiles(f => ({ ...f, [key]: null }));
    setFileErrors(e => ({ ...e, [key]: '' }));
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
      }
    } catch { /* silent */ }
    setOcrLoading(false);
  }

  async function searchFlights() {
    if (!flightDate) return;
    const trimmedNum = flightNumber.trim();
    if (trimmedNum && !validateFlightNumber(trimmedNum)) {
      setFlightNumError('Please enter a valid flight number (e.g. LY315). Only English letters and numbers are allowed.');
      return;
    }
    setFlightNumError('');
    setSearching(true); setSearchDone(false); setHardBlocked(false);
    setSearchError(''); setSearchResults([]); setSelectedFlight(null);

    const depCode = dep.match(/\(([A-Z]{3})\)/)?.[1] || dep.slice(0, 3).toUpperCase();
    const arrCode = arr.match(/\(([A-Z]{3})\)/)?.[1] || arr.slice(0, 3).toUpperCase();

    const { flights, error } = await lookupFlight(trimmedNum, flightDate, depCode || undefined, arrCode || undefined);
    setSearching(false); setSearchDone(true);

    if (error && !flights.length) {
      setSearchError(error);
      return;
    }
    if (!flights.length) {
      setSearchError('No flights found. Please check the date or flight number format.');
      return;
    }

    // Check if ANY found flight had < 3h delay (on time) — if ALL are on time, hard block
    const eligible = flights.filter((f: FlightLookupResult) => f.delayMin >= 180 || f.status === 'cancelled' || f.status === 'diverted');
    const allOnTime = flights.every((f: FlightLookupResult) => f.delayMin < 180 && f.status !== 'cancelled' && f.status !== 'diverted');

    // Keep on-time results selectable so a passenger can continue to manual review.
    // Aviation data can be incomplete or disagree with the passenger's documents.
    setHardBlocked(allOnTime);

    const mapped: ConfirmedFlight[] = (eligible.length > 0 ? eligible : flights).map((f: FlightLookupResult) => ({
      flightNum: f.flightNum,
      airline: f.airline,
      depAirport: f.depAirport || '',
      depCode: f.depCode || depCode,
      arrAirport: f.arrAirport || '',
      arrCode: f.arrCode || arrCode,
      depTime: f.depTime,
      arrTime: f.arrTime,
      delayMin: f.delayMin,
      status: f.status,
      date: f.date,
    }));

    setSearchResults(mapped);
    if (!dep && mapped[0]?.depAirport) setDep(`${mapped[0].depAirport} (${mapped[0].depCode})`);
    if (!arr && mapped[0]?.arrAirport) setArr(`${mapped[0].arrAirport} (${mapped[0].arrCode})`);
  }

  function handleReasonSelect(r: AirlineReason) {
    setAirlineReason(r);
    setReasonBlocked(EXTRAORDINARY_REASONS.includes(r));
  }

  function goNext() { window.scrollTo(0, 0); setStep(s => s + 1); }
  function goBack() { window.scrollTo(0, 0); setStep(s => Math.max(1, s - 1)); }

  async function submitClaim() {
    // Signature hard validation
    if (!hasSig || !isSigValid()) {
      const msg = 'Your signature is required on the Letter of Authority to proceed. Please sign clearly with your finger or mouse.';
      setSigValidError(msg);
      canvasWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    const sf = selectedFlight;
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Passenger';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Build file metadata for the server to generate pre-signed upload URLs
    const fileMetadata: Array<{ name: string; size: number; type: string; note: string }> = [];
    if (uploadedFiles.booking) fileMetadata.push({ name: uploadedFiles.booking.name, size: uploadedFiles.booking.size, type: uploadedFiles.booking.type, note: 'Booking Confirmation' });
    if (uploadedFiles.passport) fileMetadata.push({ name: uploadedFiles.passport.name, size: uploadedFiles.passport.size, type: uploadedFiles.passport.type, note: 'Passport / ID' });
    if (uploadedFiles.boarding) fileMetadata.push({ name: uploadedFiles.boarding.name, size: uploadedFiles.boarding.size, type: uploadedFiles.boarding.type, note: 'Boarding Pass' });

    // Get the current session token (if authenticated)
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;

    // Call the secure server-side create-claim edge function
    let res: Response;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken,
        },
        body: JSON.stringify({
          claim: {
            passenger_first_name: firstName,
            passenger_last_name: lastName,
            email,
            phone,
            address: '',
            country: 'United Kingdom',
            flight_number: sf?.flightNum || '',
            flight_date: flightDate || null,
            departure: dep,
            arrival: arr,
            airline: sf?.airline || '',
            issue_type: issueType || 'Delay',
            airline_reason: airlineReason,
            agent: agentCode || '—',
            loa_signed: hasSig && loaChecked,
            signature_data: sigDataRef.current,
            prior_comp_type: priorComp === 'Yes' ? priorCompType || null : null,
            prior_signed: priorComp === 'Yes' ? priorSigned || null : null,
            review_required: priorReviewFlag,
            // Cancellation fields
            cancellation_notice_date: issueType === 'Cancellation' ? cancellationNoticeDate || null : null,
            cancellation_notice_source: issueType === 'Cancellation' ? cancellationNoticeSource : '',
            replacement_offered: issueType === 'Cancellation' ? replacementOffered : false,
            replacement_accepted: issueType === 'Cancellation' ? replacementAccepted : false,
            replacement_flight_number: issueType === 'Cancellation' && replacementAccepted ? replacementFlightNumber : '',
            // Denied boarding fields
            boarding_type: issueType === 'Denied Boarding' ? boardingType : '',
            confirmed_reservation: issueType === 'Denied Boarding' ? confirmedReservation : null,
            checked_in_on_time: issueType === 'Denied Boarding' ? checkedInOnTime : null,
            denial_reason: issueType === 'Denied Boarding' ? denialReason : '',
            // Connecting flight fields
            is_single_booking: issueType === 'Missed Connection' ? (isSingleBooking || false) : false,
          },
          segments: issueType === 'Missed Connection' && segments.length > 0
            ? segments.map((s, i) => ({ ...s, segment_order: i + 1 }))
            : undefined,
          files: fileMetadata,
        }),
      });
    } catch {
      alert('Network error — please try again.');
      setSubmitting(false);
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (res.status === 409) {
        alert(data.error || 'This claim has already been submitted.');
      } else {
        alert(data.error || 'Submission failed. Please try again.');
      }
      setSubmitting(false);
      return;
    }

    const ref = data.claim_ref as string;

    // Upload files to the pre-signed URLs returned by the server
    if (data.upload_urls && Array.isArray(data.upload_urls)) {
      const fileMap: Record<string, File> = {};
      if (uploadedFiles.booking) fileMap[uploadedFiles.booking.name] = uploadedFiles.booking;
      if (uploadedFiles.passport) fileMap[uploadedFiles.passport.name] = uploadedFiles.passport;
      if (uploadedFiles.boarding) fileMap[uploadedFiles.boarding.name] = uploadedFiles.boarding;

      for (const { name, url } of data.upload_urls) {
        const file = fileMap[name];
        if (!file || !url) continue;
        try {
          await fetch(url, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });
        } catch {
          // Non-blocking — file upload failure shouldn't block claim submission
        }
      }
    }

    // Redirect to /claim-success with ref and email as query params
    const successUrl = `/claim-success?ref=${encodeURIComponent(ref)}${email ? `&email=${encodeURIComponent(email)}` : ''}`;
    window.history.pushState({}, '', successUrl);
    onNav('claim-success');
    setSubmitting(false);
  }

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  // ── SIDEBAR STAGES ────────────────────────────────────────────────────────────
  const sidebarStages = [
    { label: 'Your Details', sub: 'Contact & journey type', steps: [1] },
    { label: 'Flight Search', sub: 'Date, number & API check', steps: [2] },
    { label: 'Confirm & Reason', sub: 'Disruption & airline reason', steps: [3] },
    { label: 'Documents & LOA', sub: 'Upload & sign', steps: [4] },
  ];
  const currentStage = sidebarStages.findIndex(s => s.steps.includes(step));

  return (
    <div className="min-h-screen w-full min-w-0 flex overflow-x-hidden" style={{ background: '#f1f5f9' }}>
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
            {sidebarStages.map((stage, i) => {
              const done = i < currentStage;
              const active = i === currentStage;
              return (
                <div key={stage.label} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${done ? 'bg-emerald-400 text-white' : active ? 'bg-white text-[#1a3a6b]' : 'bg-white/10 text-white/30 border border-white/20'}`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    {i < sidebarStages.length - 1 && (
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
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => onNav('home')} className="md:hidden flex items-center gap-2 border-none bg-transparent cursor-pointer mr-2">
            <div className="w-7 h-7 bg-[#0f2744] rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Progress</span>
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

        {/* Scrollable content */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-4 sm:py-8 md:px-10 md:py-10">
          <div className="w-full min-w-0 max-w-[680px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="min-w-0 p-4 sm:p-6 md:p-8 lg:p-10">

              {/* ── STEP 1: Contact & Journey ─────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <div className="text-[22px] font-extrabold text-[#0f172a] mb-1">Your Contact Details</div>
                  <div className="text-[13px] text-[#64748b] mb-6">Find out if you're owed up to <strong className="text-[#0f172a]">€600</strong>. No win, no fee.</div>

                  {prefill && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f0f4ff] border border-[#c7d0ff] rounded-xl mb-5 text-[12px] text-[#1e40af] font-semibold">
                      <Check className="w-4 h-4 shrink-0" />
                      Pre-filled from your compensation check
                    </div>
                  )}

                  <div className="flex flex-col gap-4 mb-5">
                    {/* Full name */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#374151]">Full Name <span className="text-[#dc2626]">*</span></label>
                      <input
                        value={fullName}
                        onChange={e => setFullName(e.target.value.replace(/[^A-Za-z\s'-]/g, ''))}
                        placeholder="Jane Smith"
                        className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] transition-colors"
                      />
                      <div className="text-[11px] text-[#94a3b8]">As it appears on your passport or ID</div>
                    </div>

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#374151]">Email Address <span className="text-[#dc2626]">*</span></label>
                      <div className="relative">
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className={`w-full px-4 py-3 pr-10 border-2 rounded-xl text-[14px] outline-none transition-colors ${
                            email
                              ? validateEmail(email) ? 'border-[#16a34a] focus:border-[#16a34a]' : 'border-[#dc2626] focus:border-[#dc2626]'
                              : 'border-[#e2e8f0] focus:border-[#0f2744]'
                          }`}
                        />
                        {email && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base select-none">
                            {validateEmail(email) ? '✅' : '❌'}
                          </span>
                        )}
                      </div>
                      {email && !validateEmail(email) && (
                        <div className="text-[11px] text-[#dc2626] font-medium">Please enter a valid email address (e.g. jane@example.com)</div>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#374151]">Phone Number <span className="text-[#dc2626]">*</span></label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+44 7700 900000"
                        className={`px-4 py-3 border-2 rounded-xl text-[14px] outline-none transition-colors ${
                          phone
                            ? validatePhone(phone) ? 'border-[#16a34a] focus:border-[#16a34a]' : 'border-[#dc2626] focus:border-[#dc2626]'
                            : 'border-[#e2e8f0] focus:border-[#0f2744]'
                        }`}
                      />
                      {phone && !validatePhone(phone) && (
                        <div className="text-[11px] text-[#dc2626] font-medium">Please enter a valid international phone number</div>
                      )}
                    </div>

                    {/* Route */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[12px] font-semibold text-[#374151] mb-1.5">Flying From</div>
                        <AirportInput value={dep} onChange={setDep} placeholder="City or airport" />
                      </div>
                      <div>
                        <div className="text-[12px] font-semibold text-[#374151] mb-1.5">Flying To</div>
                        <AirportInput value={arr} onChange={setArr} placeholder="City or airport" />
                      </div>
                    </div>

                    {/* Connecting flight */}
                    <div>
                      <div className="text-[12px] font-semibold text-[#374151] mb-2">Did you have a connecting flight? <span className="text-[#dc2626]">*</span></div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => { setConnecting(false); setViaAirport(''); }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left cursor-pointer transition-all ${connecting === false ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] bg-white hover:border-[#94a3b8]'}`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${connecting === false ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
                            {connecting === false && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
                          </div>
                          <span className="text-[14px] font-medium text-[#0f172a]">No, direct flight</span>
                        </button>
                        <div
                          onClick={() => setConnecting(true)}
                          className={`flex flex-col gap-3 px-4 py-3 rounded-xl border-2 text-left cursor-pointer transition-all ${connecting === true ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] bg-white hover:border-[#94a3b8]'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${connecting === true ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
                              {connecting === true && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
                            </div>
                            <span className="text-[14px] font-medium text-[#0f172a]">Yes, I had a connection</span>
                          </div>
                          {connecting === true && (
                            <div onClick={e => e.stopPropagation()}>
                              <div className="text-[12px] font-semibold text-[#374151] mb-1.5">Connecting Airport (Via) <span className="text-[#dc2626]">*</span></div>
                              <AirportInput value={viaAirport} onChange={setViaAirport} placeholder="e.g. Amsterdam (AMS)" />
                              {!viaAirport.trim() && (
                                <div className="mt-1 text-[11px] text-[#dc2626]">Please enter your connecting airport to proceed.</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={goNext}
                    disabled={
                      !fullName.trim() ||
                      !validateEmail(email) ||
                      !validatePhone(phone) ||
                      connecting === null ||
                      (connecting === true && !viaAirport.trim())
                    }
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* ── STEP 2: Flight Search & API Validation ───────────────────── */}
              {step === 2 && (
                <div>
                  <div className="text-[22px] font-extrabold text-[#0f172a] mb-1">Search Your Flight</div>
                  <div className="text-[13px] text-[#64748b] mb-6">Enter your flight details so we can verify eligibility via official aviation data.</div>

                  <div className="flex flex-col gap-4 mb-5">
                    {/* Flight Date */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#374151]">Flight Date <span className="text-[#dc2626]">*</span></label>
                      <input
                        type="date"
                        value={flightDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={e => { setFlightDate(e.target.value); setSearchDone(false); setHardBlocked(false); setSearchResults([]); setSelectedFlight(null); }}
                        className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors"
                      />
                    </div>

                    {/* Flight Number */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-semibold text-[#374151]">Flight Number <span className="text-[#dc2626]">*</span></label>
                      <input
                        value={flightNumber}
                        onChange={e => {
                          const v = e.target.value.replace(/[^A-Za-z0-9]/g, '');
                          setFlightNumber(v);
                          setFlightNumError('');
                          setSearchDone(false); setHardBlocked(false); setSearchResults([]); setSelectedFlight(null);
                        }}
                        placeholder="e.g. LY315"
                        maxLength={7}
                        className={`px-4 py-3 border-2 rounded-xl text-[14px] outline-none transition-colors ${flightNumError ? 'border-[#dc2626] focus:border-[#dc2626]' : 'border-[#e2e8f0] focus:border-[#0f2744]'}`}
                      />
                      {flightNumError && (
                        <div className="text-[11px] text-[#dc2626] font-medium">{flightNumError}</div>
                      )}
                      <div className="text-[11px] text-[#94a3b8]">Format: 2–3 English letters followed by 1–4 digits (e.g. LY315, W64452)</div>
                    </div>
                  </div>

                  {/* Search button */}
                  <button
                    onClick={searchFlights}
                    disabled={!flightDate || !flightNumber.trim() || searching}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[15px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-4"
                  >
                    {searching
                      ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Searching...</>
                      : <><Search className="w-5 h-5" /> Search Flights</>}
                  </button>

                  {/* On-time result: warning only, not a hard block */}
                  {hardBlocked && (
                    <div className="flex items-start gap-3 p-4 bg-[#fffbeb] border-2 border-[#fde68a] rounded-xl mb-4">
                      <div className="w-9 h-9 rounded-full bg-[#d97706] flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-[14px] text-[#92400e] mb-1">No qualifying delay found in the flight data</div>
                        <div className="text-[13px] text-[#92400e]">The available data shows less than 3 hours' delay. Select your flight below to continue with a manual review if your documents show a longer delay or another issue.</div>
                      </div>
                    </div>
                  )}

                  {/* No results */}
                  {searchDone && searchResults.length === 0 && !searching && (
                    <div className="flex items-center gap-3 p-4 bg-[#fffbeb] border border-[#fde68a] rounded-xl mb-4">
                      <AlertTriangle className="w-5 h-5 text-[#d97706] shrink-0" />
                      <div>
                        <div className="font-semibold text-[13px] text-[#92400e]">No flights found</div>
                        <div className="text-[12px] text-[#92400e] mt-0.5">{searchError || 'Please check the date or flight number format.'}</div>
                      </div>
                    </div>
                  )}

                  {/* API error note */}
                  {searchDone && searchError && searchResults.length === 0 && !searching && (
                    <div>
                      {!manualMode ? (
                        <button
                          onClick={() => setManualMode(true)}
                          className="text-[13px] text-[#2563eb] bg-transparent border-none cursor-pointer hover:underline"
                        >Enter flight details manually</button>
                      ) : (
                        <div className="border-2 border-[#dbeafe] bg-[#f0f4ff] rounded-xl p-4 mb-4">
                          <div className="font-semibold text-[14px] text-[#0f172a] mb-3">Enter Flight Details Manually</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div>
                              <div className="text-[12px] font-semibold text-[#374151] mb-1.5">Flight Number</div>
                              <input value={manualFlight} onChange={e => setManualFlight(e.target.value)} placeholder="e.g. LY315" className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white" />
                            </div>
                            <div>
                              <div className="text-[12px] font-semibold text-[#374151] mb-1.5">Airline</div>
                              <input value={manualAirline} onChange={e => setManualAirline(e.target.value)} placeholder="e.g. El Al Israel Airlines" className="w-full px-3 py-2.5 border-2 border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setManualMode(false)} className="px-4 py-2 border-2 border-[#e2e8f0] rounded-lg text-[13px] font-semibold bg-white cursor-pointer hover:bg-[#f8fafc]">Cancel</button>
                            <button
                              onClick={() => {
                                if (manualFlight.trim()) {
                                  const depCode = dep.match(/\(([A-Z]{3})\)/)?.[1] || dep.slice(0, 3).toUpperCase();
                                  const arrCode = arr.match(/\(([A-Z]{3})\)/)?.[1] || arr.slice(0, 3).toUpperCase();
                                  const flight: ConfirmedFlight = {
                                    flightNum: manualFlight.trim(),
                                    airline: manualAirline.trim() || 'Unknown Airline',
                                    depAirport: dep, depCode,
                                    arrAirport: arr, arrCode,
                                    depTime: '--:--', arrTime: '--:--',
                                    delayMin: 0, status: 'unknown', date: flightDate,
                                  };
                                  setSelectedFlight(flight);
                                  setSearchResults([flight]);
                                  setManualMode(false);
                                }
                              }}
                              disabled={!manualFlight.trim()}
                              className="flex-1 px-4 py-2 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-lg text-[13px] font-bold border-none cursor-pointer disabled:opacity-40"
                            >Confirm Flight</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Results list */}
                  {searchDone && searchResults.length > 0 && !selectedFlight && (
                    <div className="flex flex-col gap-2 mb-4 max-h-[280px] overflow-y-auto pr-1">
                      <div className="text-[12px] font-semibold text-[#374151] mb-1">Select your flight:</div>
                      {searchResults.map(f => (
                        <button
                          key={f.flightNum + f.depTime}
                          type="button"
                          onClick={() => setSelectedFlight(f)}
                          className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-[#e2e8f0] hover:border-[#0f2744] cursor-pointer transition-all bg-white"
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="text-[13px] font-bold text-[#0f172a]">{f.flightNum} <span className="text-[#64748b] font-normal">· {f.airline}</span></div>
                            {f.delayMin >= 180
                              ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#fef3c7] text-[#d97706]"><AlertTriangle className="w-3 h-3" /> +{Math.floor(f.delayMin / 60)}h{f.delayMin % 60 > 0 ? ` ${f.delayMin % 60}m` : ''}</span>
                              : <span className="text-[11px] text-[#16a34a] font-semibold">On time</span>
                            }
                          </div>
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="font-semibold">{f.depTime}</span>
                            <div className="flex-1 flex items-center gap-1 text-[#94a3b8] text-[11px]">
                              <div className="flex-1 h-px bg-[#e2e8f0]" />
                              <Plane className="w-3 h-3" />
                              <div className="flex-1 h-px bg-[#e2e8f0]" />
                            </div>
                            <span className="font-semibold">{f.arrTime}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-[#94a3b8] mt-1">
                            <span>{f.depCode}</span><span>{f.arrCode}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected flight card */}
                  {selectedFlight && (
                    <div className="border-2 border-[#16a34a] bg-[#f0fdf4] rounded-xl p-4 flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#16a34a] flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[14px] text-[#166534]">{selectedFlight.airline} · {selectedFlight.flightNum}</div>
                        <div className="text-[12px] text-[#166534]">{flightDate} · {selectedFlight.depCode} → {selectedFlight.arrCode}</div>
                      </div>
                      <button onClick={() => setSelectedFlight(null)} className="text-[12px] text-[#374151] border border-[#e2e8f0] bg-white rounded-lg px-3 py-1.5 cursor-pointer hover:bg-[#f8fafc] shrink-0">Change</button>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-[#e2e8f0] text-[#374151] rounded-xl text-[14px] font-semibold cursor-pointer hover:border-[#94a3b8] border-none" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={goNext}
                      disabled={!selectedFlight}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[14px] font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Confirm Flight + Disruption Reason ───────────────── */}
              {step === 3 && selectedFlight && (
                <div>
                  <div className="text-[22px] font-extrabold text-[#0f172a] mb-1">Confirm Flight & Disruption</div>
                  <div className="text-[13px] text-[#64748b] mb-5">Please verify your flight details are correct.</div>

                  {/* Flight confirmation card */}
                  {(() => {
                    const depCode3 = selectedFlight.depCode;
                    const arrCode3 = selectedFlight.arrCode;
                    const iataValid = /^[A-Z]{3}$/.test(depCode3) && /^[A-Z]{3}$/.test(arrCode3);
                    if (!iataValid) {
                      return (
                        <div className="flex items-start gap-3 p-4 bg-[#fff1f2] border-2 border-[#fecdd3] rounded-xl mb-5">
                          <Ban className="w-5 h-5 text-[#dc2626] shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-[14px] text-[#991b1b]">Invalid flight details detected</div>
                            <div className="text-[13px] text-[#991b1b] mt-0.5">Please go back and enter a valid flight number in English.</div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="border-2 border-[#d97706] rounded-xl p-4 mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-[15px] text-[#0f172a]">{selectedFlight.airline}</span>
                          <span className="text-[11px] font-semibold bg-[#f1f5f9] text-[#374151] px-2 py-0.5 rounded-full">{selectedFlight.flightNum}</span>
                          <button onClick={() => setStep(2)} className="ml-auto text-[12px] text-[#64748b] border border-[#e2e8f0] rounded-lg px-2.5 py-1 cursor-pointer hover:bg-[#f8fafc] bg-white">Change</button>
                        </div>
                        <div className="text-[13px] text-[#64748b] mb-2">{flightDate} · {selectedFlight.depCode} → {selectedFlight.arrCode}</div>
                        {selectedFlight.depTime !== '--:--' && (
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="font-semibold">{selectedFlight.depTime}</span>
                            <div className="flex-1 flex items-center gap-1 text-[#94a3b8] text-[11px]">
                              <div className="flex-1 h-px bg-[#e2e8f0]" />
                              <Plane className="w-3 h-3" />
                              <div className="flex-1 h-px bg-[#e2e8f0]" />
                            </div>
                            <span className="font-semibold">{selectedFlight.arrTime}</span>
                          </div>
                        )}
                        {selectedFlight.delayMin >= 180 && (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fef3c7] text-[#d97706] text-[12px] font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Delayed {formatDelay(selectedFlight.delayMin)}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Airline reason */}
                  <div className="mb-5">
                    <div className="font-bold text-[15px] text-[#0f172a] mb-1">What reason did the airline give? <span className="text-[#dc2626]">*</span></div>
                    <div className="text-[12px] text-[#64748b] mb-3">Select the closest option — this helps us build your case.</div>
                    <div className="flex flex-col gap-2">
                      {AIRLINE_REASONS.map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleReasonSelect(r)}
                          className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 text-left cursor-pointer transition-all bg-white ${airlineReason === r ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] hover:border-[#94a3b8]'}`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${airlineReason === r ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
                            {airlineReason === r && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
                          </div>
                          <span className="text-[14px] font-medium text-[#0f172a]">{r}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Issue type selection ─────────────────────────────── */}
                  <div className="mb-5">
                    <IssueTypeSelector value={issueType} onChange={setIssueType} />
                  </div>

                  {/* ── Cancellation conditional fields ──────────────────── */}
                  {issueType === 'Cancellation' && (
                    <div className="mb-5">
                      <CancellationFields
                        cancellationNoticeDate={cancellationNoticeDate}
                        setCancellationNoticeDate={setCancellationNoticeDate}
                        cancellationNoticeSource={cancellationNoticeSource}
                        setCancellationNoticeSource={setCancellationNoticeSource}
                        replacementOffered={replacementOffered}
                        setReplacementOffered={setReplacementOffered}
                        replacementAccepted={replacementAccepted}
                        setReplacementAccepted={setReplacementAccepted}
                        replacementFlightNumber={replacementFlightNumber}
                        setReplacementFlightNumber={setReplacementFlightNumber}
                      />
                    </div>
                  )}

                  {/* ── Denied boarding conditional fields ─────────────── */}
                  {issueType === 'Denied Boarding' && (
                    <div className="mb-5">
                      <DeniedBoardingFields
                        boardingType={boardingType}
                        setBoardingType={setBoardingType}
                        confirmedReservation={confirmedReservation}
                        setConfirmedReservation={setConfirmedReservation}
                        checkedInOnTime={checkedInOnTime}
                        setCheckedInOnTime={setCheckedInOnTime}
                        denialReason={denialReason}
                        setDenialReason={setDenialReason}
                      />
                    </div>
                  )}

                  {/* ── Missed Connection conditional fields ─────────────── */}
                  {issueType === 'Missed Connection' && (
                    <div className="mb-5">
                      <ConnectingFlightFields
                        isSingleBooking={isSingleBooking}
                        setIsSingleBooking={setIsSingleBooking}
                        segments={segments}
                        setSegments={setSegments}
                      />
                    </div>
                  )}

                  {/* ── Prior compensation check ─────────────────────────── */}
                  <div className="mb-5">
                    <div className="font-bold text-[15px] text-[#0f172a] mb-1">Have you received any compensation, vouchers, or signed a document with the airline? <span className="text-[#dc2626]">*</span></div>
                    <div className="text-[12px] text-[#64748b] mb-3">This helps us assess your legal eligibility.</div>
                    <div className="flex flex-col gap-2">
                      {(['No', 'Yes'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => { setPriorComp(opt); setPriorCompType(''); setPriorSigned(''); }}
                          className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 text-left cursor-pointer transition-all bg-white ${priorComp === opt ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] hover:border-[#94a3b8]'}`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${priorComp === opt ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
                            {priorComp === opt && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
                          </div>
                          <span className="text-[14px] font-medium text-[#0f172a]">{opt}</span>
                        </button>
                      ))}
                    </div>

                    {/* Conditional fields — only visible when Yes */}
                    {priorComp === 'Yes' && (
                      <div className="mt-4 border-2 border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-4 bg-[#fafbfc]">
                        {/* Type dropdown */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[12px] font-semibold text-[#374151]">What did you receive? <span className="text-[#dc2626]">*</span></label>
                          <select
                            value={priorCompType}
                            onChange={e => setPriorCompType(e.target.value as PriorCompType)}
                            className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors appearance-none cursor-pointer"
                          >
                            <option value="">Select type...</option>
                            <option value="Food & Hotel Vouchers">Food &amp; Hotel Vouchers</option>
                            <option value="Cash">Cash</option>
                            <option value="Flight Voucher">Flight Voucher</option>
                          </select>
                        </div>

                        {/* Signature radio */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[12px] font-semibold text-[#374151]">Did you sign a waiver or release form? <span className="text-[#dc2626]">*</span></label>
                          <div className="flex flex-col gap-2">
                            {(['Yes', 'No', 'Unsure'] as const).map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setPriorSigned(opt)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left cursor-pointer transition-all bg-white ${priorSigned === opt ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] hover:border-[#94a3b8]'}`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${priorSigned === opt ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
                                  {priorSigned === opt && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
                                </div>
                                <span className="text-[14px] font-medium text-[#0f172a]">{opt}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Review flag info */}
                        {priorReviewFlag && (
                          <div className="flex items-start gap-3 p-3.5 bg-[#fffbeb] border-2 border-[#fcd34d] rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
                            <div className="text-[12px] text-[#92400e] leading-snug">
                              <strong>Your case will be reviewed.</strong> You may still be eligible — our team will assess whether the prior payment affects your entitlement under EU/UK law.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prior compensation warning (non-blocking) */}
                  {priorHardBlocked && (
                    <div className="flex items-start gap-3 p-4 bg-[#fffbeb] border-2 border-[#fcd34d] rounded-xl mb-5">
                      <AlertTriangle className="w-5 h-5 text-[#d97706] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[14px] text-[#92400e] mb-1">You May Not Be Eligible</div>
                        <div className="text-[13px] text-[#92400e]">You indicated you received compensation and signed a waiver. You can still submit your claim and our team will review whether you remain eligible under EU/UK law.</div>
                      </div>
                    </div>
                  )}

                  {/* Extraordinary circumstances hard block */}
                  {reasonBlocked && (
                    <div className="flex items-start gap-3 p-4 bg-[#fff1f2] border-2 border-[#fecdd3] rounded-xl mb-5">
                      <div className="w-9 h-9 rounded-full bg-[#dc2626] flex items-center justify-center shrink-0">
                        <Ban className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-[14px] text-[#991b1b] mb-1">Claim Cannot Be Processed</div>
                        <div className="text-[13px] text-[#991b1b]">Airlines are legally exempt from paying compensation for disruptions caused by extraordinary circumstances like severe weather or air traffic control decisions. This claim cannot be processed.</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer hover:border-[#94a3b8] bg-white" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={goNext}
                      disabled={
                        !airlineReason ||
                        reasonBlocked ||
                        priorComp === '' ||
                        (priorComp === 'Yes' && (!priorCompType || !priorSigned)) ||
                        !issueType ||
                        (issueType === 'Cancellation' && !cancellationNoticeDate) ||
                        (issueType === 'Cancellation' && replacementOffered && replacementAccepted && !replacementFlightNumber) ||
                        (issueType === 'Denied Boarding' && (!boardingType || confirmedReservation === null || checkedInOnTime === null)) ||
                        (issueType === 'Missed Connection' && (isSingleBooking === null || segments.length === 0 || segments.some(s => !s.flight_number || !s.flight_date || !s.origin || !s.destination))) ||
                        !/^[A-Z]{3}$/.test(selectedFlight.depCode) ||
                        !/^[A-Z]{3}$/.test(selectedFlight.arrCode)
                      }
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0f2744] hover:bg-[#1a3a5c] text-white rounded-xl text-[14px] font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: Documents + LOA + Signature ─────────────────────── */}
              {step === 4 && (
                <div>
                  <div className="text-[22px] font-extrabold text-[#0f172a] mb-1">Upload Documents</div>
                  <div className="text-[13px] text-[#64748b] mb-5">Upload your supporting documents to process your claim.</div>

                  <div className="flex flex-col gap-3 mb-5">
                    {([
                      { key: 'booking' as DocKey, label: 'Booking Confirmation', sub: 'PDF, JPEG or PNG · Max 10 MB', req: true },
                      { key: 'passport' as DocKey, label: 'Passport / ID Copy', sub: 'PDF, JPEG or PNG · Max 10 MB', req: true },
                      { key: 'boarding' as DocKey, label: 'Boarding Pass', sub: 'PDF, JPEG or PNG · Max 10 MB · Optional', req: false },
                    ]).map(({ key, label, sub, req }) => {
                      const file = uploadedFiles[key];
                      const err = fileErrors[key];
                      const isDragging = dragOver === key;
                      const isPdf = file?.type === 'application/pdf';
                      return (
                        <div key={key}>
                          <input
                            ref={docInputRefs[key]}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={e => handleFileInputChange(key, e)}
                          />
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
                                <div className="text-[13px] font-semibold text-[#0f172a]">
                                  {label} {req && <span className="text-[#dc2626]">*</span>}
                                </div>
                                <div className="text-[11px] text-[#64748b] mt-0.5">{sub}</div>
                                <div className="text-[11px] text-[#2563eb] font-medium mt-1">
                                  {isDragging ? 'Drop to upload' : 'Click to browse or drag & drop'}
                                </div>
                              </div>
                            </div>
                          )}
                          {err && <div className="mt-1.5 text-[11px] text-[#dc2626] font-medium px-1">{err}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Boarding pass OCR result */}
                  {ocrLoading && (
                    <div className="p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl text-[12px] text-[#1e40af] mb-4 flex items-center gap-2">
                      <span className="animate-spin w-3.5 h-3.5 border-2 border-[#2563eb] border-t-transparent rounded-full shrink-0" />
                      Reading boarding pass with AI...
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

                  {/* Booking confirmation missing warning */}
                  {!uploadedFiles.booking && (
                    <div className="flex items-center gap-2 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-xl text-[12px] text-[#92400e] mb-4">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Booking Confirmation is required to submit your claim.
                    </div>
                  )}
                  {!uploadedFiles.passport && (
                    <div className="flex items-center gap-2 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-xl text-[12px] text-[#92400e] mb-4">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Passport / ID is required — airlines reject claims without identity verification.
                    </div>
                  )}

                  {/* Letter of Authority */}
                  <div className="border-2 border-[#e2e8f0] rounded-xl p-4 mb-5">
                    <div className="font-bold text-[14px] text-[#0f172a] mb-3">Letter of Authority <span className="text-[#dc2626]">*</span></div>
                    <label className="flex items-start gap-3 cursor-pointer text-[13px] text-[#374151] leading-relaxed mb-4">
                      <input type="checkbox" checked={loaChecked} onChange={e => setLoaChecked(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#0f2744] shrink-0" />
                      <span className="flex-1 min-w-0">
                        I authorise <strong>ClaimVelo Ltd.</strong> to act as my authorised representative and pursue compensation on my behalf under EC Regulation 261/2004 / UK261. I agree to a <strong>30% success fee</strong> (50% if legal action is required) — no charge if unsuccessful. No-Win, No-Fee.
                      </span>
                    </label>
                    {loaChecked && (
                      <div ref={canvasWrapRef}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[12px] font-semibold text-[#374151]">
                            Sign below <span className="text-[#dc2626]">*</span>
                            <span className="ml-1 font-normal text-[#94a3b8]">(use mouse or finger)</span>
                          </div>
                          {hasSig && isSigValid() && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#16a34a]">
                              <Check className="w-3.5 h-3.5" /> Signed
                            </span>
                          )}
                        </div>

                        {/* Canvas area */}
                        <div
                          className={`rounded-xl overflow-hidden mb-2 transition-all ${sigValidError ? 'ring-2 ring-[#dc2626]' : 'ring-1 ring-[#e2e8f0]'}`}
                          style={{ background: '#fff', minHeight: 200 }}
                        >
                          {/* Watermark placeholder text inside canvas wrapper */}
                          <div className="relative" style={{ minHeight: 200 }}>
                            {!hasSig && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                                <span className="text-[15px] text-[#d1d5db] font-light tracking-wide italic">Sign here...</span>
                              </div>
                            )}
                            <canvas
                              ref={canvasRef}
                              style={{ display: 'block', width: '100%', minHeight: 200, cursor: 'crosshair', touchAction: 'none', background: 'transparent' }}
                              onMouseDown={onMD}
                              onMouseMove={onMM}
                              onMouseUp={endStroke}
                              onMouseLeave={endStroke}
                              onTouchStart={onTS}
                              onTouchMove={onTM}
                              onTouchEnd={endStroke}
                            />
                          </div>
                        </div>

                        {/* Controls row */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={clearSig}
                            className="px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0] transition-colors"
                          >
                            Clear
                          </button>
                          <span className={`text-[12px] font-medium ${hasSig && isSigValid() ? 'text-[#16a34a]' : 'text-[#94a3b8]'}`}>
                            {hasSig && isSigValid()
                              ? '✓ Signature captured'
                              : hasSig
                              ? 'Please continue signing — more detail needed'
                              : 'Draw your full signature above'}
                          </span>
                        </div>

                        {/* Hard validation error */}
                        {sigValidError && (
                          <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-[#fff1f2] border-2 border-[#fecdd3] rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-[#dc2626] shrink-0 mt-0.5" />
                            <span className="text-[12px] text-[#991b1b] font-medium leading-snug">{sigValidError}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Review summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                    {[
                      ['Passenger', fullName.trim() || '—'],
                      ['Email', email || '—'],
                      ['Flight', selectedFlight?.flightNum || '—'],
                      ['Date', flightDate || '—'],
                      ['Route', dep && arr ? `${dep.replace(/\s*\([A-Z]{3}\)/, '')} → ${arr.replace(/\s*\([A-Z]{3}\)/, '')}` : '—'],
                      ['Potential Compensation', '€600'],
                    ].map(([l, v]) => (
                      <div key={l} className="bg-[#f8fafc] rounded-xl px-3 py-2.5 border border-[#e2e8f0]">
                        <div className="text-[10px] text-[#64748b] mb-0.5 uppercase tracking-wider font-semibold">{l}</div>
                        <div className={`font-semibold text-[12px] truncate ${l === 'Potential Compensation' ? 'text-[#16a34a]' : 'text-[#0f172a]'}`}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={goBack} className="flex items-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer bg-white" style={{ border: '2px solid #e2e8f0' }}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={submitClaim}
                      disabled={submitting || !uploadedFiles.booking || !uploadedFiles.passport || !loaChecked}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[14px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting
                        ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Submitting...</>
                        : <>Submit Claim <ArrowRight className="w-4 h-4" /></>
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
