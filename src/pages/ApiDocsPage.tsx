import { useState } from 'react';
import { Page } from '../types';
import { supabase } from '../lib/supabase';
import {
  Code2, Terminal, Send, CheckCircle, XCircle, AlertCircle,
  Copy, ChevronDown, ChevronRight, Key, Webhook, FileJson,
  ShieldCheck, Zap, ArrowRight, Loader2,
} from 'lucide-react';

interface Props {
  onNav: (p: Page) => void;
}

interface TestResult {
  status: number;
  body: unknown;
  ok: boolean;
}

const API_BASE = 'https://claimvelo.co/functions/v1/b2b-api';

const SAMPLE_PAYLOAD = `{
  "pnr_code": "ABC123",
  "passenger": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+441234567890"
  },
  "flight_info": {
    "flight_number": "BA245",
    "departure_date": "2026-07-15",
    "origin": "LHR",
    "destination": "JFK",
    "delay_minutes": 240,
    "delay_reason": "technical"
  }
}`;

const CURL_EXAMPLE = `curl -X POST \\
  ${API_BASE}/api/v1/leads \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -d '${SAMPLE_PAYLOAD}'`;

const JS_EXAMPLE = `const response = await fetch(
  "${API_BASE}/api/v1/leads",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_AGENT_API_KEY",
    },
    body: JSON.stringify({
      pnr_code: "ABC123",
      passenger: {
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "+441234567890",
      },
      flight_info: {
        flight_number: "BA245",
        departure_date: "2026-07-15",
        origin: "LHR",
        destination: "JFK",
        delay_minutes: 240,
        delay_reason: "technical",
      },
    }),
  }
);

const data = await response.json();
console.log(data);
// { success: true, message: "Lead received...", claim_ref: "CLM-...", evaluation_status: "Eligible" }`;

const PHP_EXAMPLE = `<?php
$ch = curl_init("${API_BASE}/api/v1/leads");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Authorization: Bearer YOUR_AGENT_API_KEY",
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    "pnr_code" => "ABC123",
    "passenger" => [
        "first_name" => "John",
        "last_name" => "Doe",
        "email" => "john.doe@example.com",
        "phone" => "+441234567890",
    ],
    "flight_info" => [
        "flight_number" => "BA245",
        "departure_date" => "2026-07-15",
        "origin" => "LHR",
        "destination" => "JFK",
        "delay_minutes" => 240,
        "delay_reason" => "technical",
    ],
]));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP $httpCode: $response";
?>`;

const REQUIRED_FIELDS = [
  { field: 'pnr_code', type: 'string', desc: '6-char booking reference (uppercase alphanumeric)' },
  { field: 'passenger.first_name', type: 'string', desc: 'Passenger first name' },
  { field: 'passenger.last_name', type: 'string', desc: 'Passenger last name' },
  { field: 'passenger.email', type: 'string', desc: 'Valid email address' },
  { field: 'passenger.phone', type: 'string', desc: 'International format with + (e.g. +441234567890)' },
  { field: 'flight_info.flight_number', type: 'string', desc: 'Flight number (e.g. BA245)' },
  { field: 'flight_info.departure_date', type: 'string', desc: 'Date in YYYY-MM-DD format' },
  { field: 'flight_info.origin', type: 'string', desc: '3-letter IATA airport code (e.g. LHR)' },
  { field: 'flight_info.destination', type: 'string', desc: '3-letter IATA airport code (e.g. JFK)' },
];

const OPTIONAL_FIELDS = [
  { field: 'flight_info.delay_minutes', type: 'number', desc: 'Total delay in minutes (integer)' },
  { field: 'flight_info.delay_reason', type: 'string', desc: 'carrier, technical, crew, weather, atc, or security' },
];

const RESPONSE_CODES = [
  { code: '201', label: 'Created', color: '#16a34a', bg: '#f0fdf4', desc: 'Lead received, claim created, and rules engine evaluation completed.' },
  { code: '400', label: 'Bad Request', color: '#d97706', bg: '#fffbeb', desc: 'Validation failed — required fields missing or values malformed.' },
  { code: '401', label: 'Unauthorized', color: '#dc2626', bg: '#fef2f2', desc: 'Missing or invalid API key in the Authorization header.' },
  { code: '500', label: 'Server Error', color: '#7c3aed', bg: '#f5f3ff', desc: 'Internal server error. Safe, generic message returned.' },
];

const PIPELINE_STEPS = [
  { icon: Key, title: '1. Authentication', desc: 'Bearer token verified against agent API keys in the database.', color: '#2563eb', bg: '#eff6ff' },
  { icon: FileJson, title: '2. Validation', desc: 'Strict schema validation — all required fields checked, types enforced.', color: '#0891b2', bg: '#ecfeff' },
  { icon: Webhook, title: '3. Database Insert', desc: 'New claim record created with all passenger/flight data, linked to the agent.', color: '#7c3aed', bg: '#f5f3ff' },
  { icon: Zap, title: '4. Rules Engine', desc: 'Instant evaluation: statute of limitations, delay threshold, force majeure, financials.', color: '#d97706', bg: '#fffbeb' },
];

type Tab = 'curl' | 'javascript' | 'php';

export default function ApiDocsPage({ onNav }: Props) {
  const [tab, setTab] = useState<Tab>('curl');
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [payload, setPayload] = useState(SAMPLE_PAYLOAD);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('fields');

  const codeExample = tab === 'curl' ? CURL_EXAMPLE : tab === 'javascript' ? JS_EXAMPLE : PHP_EXAMPLE;

  function copyCode() {
    navigator.clipboard.writeText(codeExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      const res = await fetch(`${API_BASE}/api/v1/leads`, {
        method: 'POST',
        headers,
        body: payload,
      });
      const body = await res.json();
      setResult({ status: res.status, body, ok: res.status >= 200 && res.status < 300 });
    } catch (err) {
      setResult({
        status: 0,
        body: { success: false, message: err instanceof Error ? err.message : 'Network error' },
        ok: false,
      });
    } finally {
      setTesting(false);
    }
  }

  function runPreset(preset: 'no-key' | 'bad-data' | 'valid') {
    if (preset === 'no-key') {
      setApiKey('');
      setPayload(SAMPLE_PAYLOAD);
    } else if (preset === 'bad-data') {
      setApiKey('cv_live_test_key_abc123XY');
      setPayload(`{
  "passenger": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "not-an-email",
    "phone": "+441234567890"
  },
  "flight_info": {
    "flight_number": "BA123",
    "departure_date": "2026-09-15",
    "origin": "LHR",
    "destination": "JFK"
  }
}`);
    } else {
      setApiKey('cv_live_test_key_abc123XY');
      setPayload(SAMPLE_PAYLOAD);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-14 pb-12 text-white" style={{ background: 'linear-gradient(135deg, #0b1e4d 0%, #132a6b 50%, #1e40af 100%)' }}>
        <div aria-hidden className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '18px 18px' }} />
        <div className="relative mx-auto max-w-4xl">
          <span className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-blue-200 ring-1 ring-white/20">
            ClaimVelo · B2B API v1.0
          </span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-[40px]">
            Developer Integration Portal
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-blue-100">
            Push flight delay leads directly into ClaimVelo from your booking platform.
            Authenticate with your agent API key, send passenger and flight data as JSON,
            and our rules engine evaluates eligibility instantly.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-blue-200">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#38bdf8]" /> Bearer Token Auth</span>
            <span className="flex items-center gap-1.5"><FileJson className="w-4 h-4 text-[#38bdf8]" /> JSON Schema Validation</span>
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-[#38bdf8]" /> Instant Rules Engine</span>
            <span className="flex items-center gap-1.5"><Code2 className="w-4 h-4 text-[#38bdf8]" /> REST / JSON</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Endpoint */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-[#2563eb]" />
            <span className="text-[13px] font-bold text-slate-900">Endpoint</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3">
            <span className="rounded-md bg-green-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-400">POST</span>
            <code className="text-[12px] font-mono text-slate-200 overflow-x-auto whitespace-nowrap">{API_BASE}/api/v1/leads</code>
          </div>
        </div>

        {/* Pipeline */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">How It Works</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: step.bg }}>
                  <step.icon className="w-4 h-4" style={{ color: step.color }} />
                </div>
                <h3 className="text-[12px] font-bold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Collapsible: Required Fields */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'fields' ? null : 'fields')}
            className="w-full flex items-center justify-between px-5 py-4 border-none bg-transparent cursor-pointer"
          >
            <span className="text-[13px] font-bold text-slate-900">Required & Optional Fields</span>
            {expandedSection === 'fields' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === 'fields' && (
            <div className="px-5 pb-5">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Field</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Type</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td colSpan={3} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#dc2626] bg-[#fef2f2]">Required</td></tr>
                    {REQUIRED_FIELDS.map(f => (
                      <tr key={f.field}>
                        <td className="px-3 py-2.5 text-[11px] font-mono font-semibold text-[#2563eb] border-b border-slate-100">{f.field}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-600 border-b border-slate-100">{f.type}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-500 border-b border-slate-100">{f.desc}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={3} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#64748b] bg-slate-50">Optional</td></tr>
                    {OPTIONAL_FIELDS.map(f => (
                      <tr key={f.field}>
                        <td className="px-3 py-2.5 text-[11px] font-mono font-semibold text-slate-600 border-b border-slate-100">{f.field}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-600 border-b border-slate-100">{f.type}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-500 border-b border-slate-100">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible: Response Codes */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'responses' ? null : 'responses')}
            className="w-full flex items-center justify-between px-5 py-4 border-none bg-transparent cursor-pointer"
          >
            <span className="text-[13px] font-bold text-slate-900">Response Codes</span>
            {expandedSection === 'responses' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSection === 'responses' && (
            <div className="px-5 pb-5 space-y-3">
              {RESPONSE_CODES.map(rc => (
                <div key={rc.code} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                  <span className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ color: rc.color, background: rc.bg }}>{rc.code} {rc.label}</span>
                  <span className="text-[11px] leading-relaxed text-slate-600">{rc.desc}</span>
                </div>
              ))}
              <div className="rounded-lg bg-slate-900 p-4 mt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Success Response (201)</div>
                <pre className="text-[11px] font-mono text-green-400 leading-relaxed overflow-x-auto">{`{
  "success": true,
  "message": "Lead received and processed successfully",
  "claim_ref": "CLM-384452-VY4",
  "evaluation_status": "Eligible"
}`}</pre>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Error Response (400)</div>
                <pre className="text-[11px] font-mono text-orange-400 leading-relaxed overflow-x-auto">{`{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "pnr_code", "message": "Required" },
    { "field": "passenger.email", "message": "must be a valid email" }
  ]
}`}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Code Examples */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <div className="flex items-center gap-1">
              {(['curl', 'javascript', 'php'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-colors ${
                    tab === t
                      ? 'bg-[#eff6ff] text-[#2563eb]'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {t === 'curl' ? 'cURL' : t === 'javascript' ? 'JavaScript' : 'PHP'}
                </button>
              ))}
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 bg-transparent cursor-pointer transition-colors"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="px-5 py-4 bg-slate-900 text-[12px] font-mono text-slate-200 leading-relaxed overflow-x-auto max-h-[400px]">
            {codeExample}
          </pre>
        </div>

        {/* Live Test Panel */}
        <div className="mb-8 rounded-xl border-2 border-[#2563eb]/20 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 bg-[#eff6ff]">
            <Send className="w-4 h-4 text-[#2563eb]" />
            <span className="text-[13px] font-bold text-slate-900">Live Test Panel</span>
            <span className="ml-auto text-[10px] font-semibold text-[#2563eb] bg-white px-2 py-0.5 rounded-full ring-1 ring-blue-200">Try it now</span>
          </div>

          <div className="p-5 space-y-4">
            {/* Preset buttons */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2">Quick Test Scenarios</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runPreset('no-key')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Test A: Missing API Key
                </button>
                <button
                  onClick={() => runPreset('bad-data')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> Test B: Invalid Data
                </button>
                <button
                  onClick={() => runPreset('valid')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Test C: Valid Request
                </button>
              </div>
            </div>

            {/* API Key input */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Agent API Key</label>
              <input
                type="text"
                placeholder="cv_live_xxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[12px] font-mono text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-[10px] text-slate-400">Leave empty to test the 401 Unauthorized response.</p>
            </div>

            {/* JSON Payload */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">JSON Payload</label>
              <textarea
                value={payload}
                onChange={e => setPayload(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-slate-300 bg-slate-900 px-3.5 py-3 text-[11px] font-mono text-slate-200 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-y"
                spellCheck={false}
              />
            </div>

            {/* Send button */}
            <button
              onClick={runTest}
              disabled={testing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[12px] font-bold border-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {testing ? 'Sending...' : 'Send Request'}
            </button>

            {/* Result */}
            {result && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200" style={{ background: result.ok ? '#f0fdf4' : '#fef2f2' }}>
                  <div className="flex items-center gap-2">
                    {result.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                    <span className="text-[12px] font-bold" style={{ color: result.ok ? '#16a34a' : '#dc2626' }}>
                      HTTP {result.status} {result.status === 0 ? 'Network Error' : ''}
                    </span>
                  </div>
                </div>
                <pre className="px-4 py-3 bg-slate-900 text-[11px] font-mono text-slate-200 leading-relaxed overflow-x-auto max-h-[300px]">
                  {JSON.stringify(result.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl p-8 text-center text-white" style={{ background: 'linear-gradient(135deg, #0b1e4d 0%, #132a6b 50%, #1e40af 100%)' }}>
          <h2 className="text-xl font-bold">Ready to integrate?</h2>
          <p className="mx-auto mt-2 max-w-md text-[12px] text-blue-200">
            Contact your account manager to get your agent API key, then start pushing leads immediately.
          </p>
          <button
            onClick={() => onNav('partners')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[12px] font-bold text-[#2563eb] border-none cursor-pointer transition hover:bg-blue-50"
          >
            Become a Partner <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
