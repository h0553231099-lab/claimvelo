import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { evaluateClaims } from '../lib/rulesEngine';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, X, User, Download } from 'lucide-react';

interface WorkerProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  agent_code: string;
  created_at: string;
}

interface ParsedRow {
  rowNumber: number;
  pnr: string;
  passengerName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  delayMinutes: number | null;
  delayReason: string;
  valid: boolean;
  errors: string[];
  status: 'pending' | 'imported' | 'evaluating' | 'evaluated' | 'error';
  claimRef?: string;
  engineStatus?: string;
  engineAmount?: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  pnr: ['pnr', 'pnr code', 'booking reference', 'booking ref', 'reservation code', 'reservation'],
  passengerName: ['passenger name', 'passenger', 'name', 'full name', 'passenger full name'],
  email: ['passenger email', 'email', 'e-mail', 'email address', 'contact email'],
  phone: ['passenger phone', 'phone', 'phone number', 'mobile', 'contact phone', 'tel'],
  flightNumber: ['flight number', 'flight no', 'flight', 'flight #', 'flight code'],
  flightDate: ['departure date', 'flight date', 'date', 'dep date', 'date of flight'],
  origin: ['origin', 'origin airport', 'departure airport', 'dep airport', 'from', 'departure'],
  destination: ['destination', 'destination airport', 'arrival airport', 'arr airport', 'to', 'arrival'],
  delayMinutes: ['delay minutes', 'delay mins', 'delay (min)', 'arrival delay', 'delay', 'delay_min'],
  delayReason: ['delay reason', 'reason', 'delay cause', 'cause', 'disruption reason', 'airline reason'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function findColumn(headers: string[], field: string): string | null {
  const aliases = HEADER_ALIASES[field];
  if (!aliases) return null;
  for (const alias of aliases) {
    const match = headers.find(h => normalizeHeader(h) === alias);
    if (match) return match;
  }
  for (const alias of aliases) {
    const match = headers.find(h => normalizeHeader(h).includes(alias));
    if (match) return match;
  }
  return null;
}

function parseDateValue(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'number') {
    const date = XLSX.SSF.parse_date_code(v);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const day = a.padStart(2, '0');
    const month = b.padStart(2, '0');
    return `${y}-${month}-${day}`;
  }
  return s;
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function validateRow(row: Partial<ParsedRow>): string[] {
  const errors: string[] = [];
  if (!row.pnr || row.pnr.length < 4) errors.push('PNR missing or too short');
  if (!row.passengerName?.trim()) errors.push('Passenger name missing');
  if (!row.flightNumber?.trim()) errors.push('Flight number missing');
  if (!row.flightDate) errors.push('Departure date missing');
  if (!row.origin || row.origin.length !== 3) errors.push('Origin must be 3-letter IATA');
  if (!row.destination || row.destination.length !== 3) errors.push('Destination must be 3-letter IATA');
  return errors;
}

function parseDelayMinutes(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n < 0 ? null : Math.round(n);
}

interface Props {
  workers: WorkerProfile[];
  onClaimsImported: () => void;
}

export default function BulkImport({ workers, onClaimsImported }: Props) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAgents = workers.filter(w => w.status === 'active' && w.agent_code);

  const parseFile = useCallback(async (file: File) => {
    setParseError('');
    setParsedRows([]);
    setImportSummary(null);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setParseError('No sheets found in the file.'); return; }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (json.length === 0) { setParseError('The first sheet is empty.'); return; }

      const headers = Object.keys(json[0]);
      const colMap: Record<string, string | null> = {};
      for (const field of Object.keys(HEADER_ALIASES)) {
        colMap[field] = findColumn(headers, field);
      }
      const missingCols = Object.entries(colMap).filter(([, v]) => !v).map(([k]) => k);
      if (missingCols.length > 0) {
        setParseError(
          `Could not find columns for: ${missingCols.join(', ')}. ` +
          `Expected: PNR Code, Passenger Name, Passenger Email, Passenger Phone, Flight Number, Departure Date, Origin Airport, Destination Airport. ` +
          `Optional but recommended: Delay Minutes, Delay Reason — these let the Rules Engine evaluate each claim using real data instead of estimates.`
        );
        return;
      }

      const rows: ParsedRow[] = json.map((raw, idx) => {
        const pnr = String(raw[colMap.pnr!] || '').trim().toUpperCase().slice(0, 6);
        const passengerName = String(raw[colMap.passengerName!] || '').trim();
        const { firstName, lastName } = parseName(passengerName);
        const email = String(raw[colMap.email!] || '').trim();
        const phone = String(raw[colMap.phone!] || '').trim();
        const flightNumber = String(raw[colMap.flightNumber!] || '').trim().toUpperCase();
        const flightDate = parseDateValue(raw[colMap.flightDate!]);
        const origin = String(raw[colMap.origin!] || '').trim().toUpperCase().slice(0, 3);
        const destination = String(raw[colMap.destination!] || '').trim().toUpperCase().slice(0, 3);
        const delayMinutes = colMap.delayMinutes ? parseDelayMinutes(raw[colMap.delayMinutes!]) : null;
        const delayReason = colMap.delayReason ? String(raw[colMap.delayReason!] || '').trim() : '';
        const rowData: Partial<ParsedRow> = { pnr, passengerName, email, phone, flightNumber, flightDate, origin, destination };
        const errors = validateRow(rowData);
        return {
          rowNumber: idx + 2, pnr, passengerName, firstName, lastName, email, phone,
          flightNumber, flightDate, origin, destination, delayMinutes, delayReason,
          valid: errors.length === 0, errors, status: 'pending' as const,
        };
      });
      setParsedRows(rows);
    } catch {
      setParseError('Failed to read the file. Please ensure it is a valid .csv or .xlsx file.');
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function clearFile() {
    setFileName(''); setParsedRows([]); setParseError(''); setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function importRows() {
    if (!selectedAgent) return;
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    let success = 0; let failed = 0;
    const agentCode = activeAgents.find(a => a.id === selectedAgent)?.agent_code || '—';
    const createdClaimIds: string[] = [];

    for (const row of validRows) {
      const ref = 'CLM-' + Date.now().toString().slice(-6) + '-' + String(row.rowNumber).slice(-3);
      try {
        const { data, error } = await supabase.from('claims').insert({
          claim_ref: ref,
          passenger_first_name: row.firstName,
          passenger_last_name: row.lastName,
          email: row.email,
          phone: row.phone,
          flight_number: row.flightNumber,
          flight_date: row.flightDate,
          departure: row.origin,
          arrival: row.destination,
          booking_reference: row.pnr,
          status: 'Pending Check',
          amount: '€600',
          agent: agentCode,
          loa_signed: false,
          issue_type: 'Bulk Import — Pending Check',
          delay_hours: row.delayMinutes != null ? Math.round((row.delayMinutes / 60) * 10) / 10 : 0,
          airline_reason: row.delayReason || '',
        }).select('id');
        if (error) {
          failed++;
          setParsedRows(prev => prev.map(r => r.rowNumber === row.rowNumber ? { ...r, status: 'error' } : r));
        } else {
          success++;
          if (data?.[0]?.id) createdClaimIds.push(data[0].id);
          setParsedRows(prev => prev.map(r => r.rowNumber === row.rowNumber ? { ...r, status: 'imported', claimRef: ref } : r));
        }
      } catch {
        failed++;
        setParsedRows(prev => prev.map(r => r.rowNumber === row.rowNumber ? { ...r, status: 'error' } : r));
      }
    }
    setImportSummary({ success, failed });
    setImporting(false);
    if (success > 0) onClaimsImported();

    // Run the Rules Engine on all newly imported claims and refresh UI with results
    if (createdClaimIds.length > 0) {
      setParsedRows(prev => prev.map(r => {
        const idx = validRows.findIndex(vr => vr.rowNumber === r.rowNumber);
        if (idx < 0 || !createdClaimIds[idx]) return r;
        return { ...r, status: 'evaluating' as const };
      }));

      const results = await evaluateClaims(createdClaimIds);

      const { data: updatedClaims } = await supabase
        .from('claims')
        .select('id, status, amount, claim_ref')
        .in('id', createdClaimIds);

      const updatedMap = new Map((updatedClaims || []).map(c => [c.id, c]));

      setParsedRows(prev => prev.map(r => {
        const idx = validRows.findIndex(vr => vr.rowNumber === r.rowNumber);
        if (idx < 0 || !createdClaimIds[idx]) return r;
        const claimId = createdClaimIds[idx];
        const result = results.find(res => res.claimId === claimId);
        const updated = updatedMap.get(claimId);
        return {
          ...r,
          status: 'evaluated' as const,
          engineStatus: updated?.status || result?.decision || '',
          engineAmount: updated?.amount || '',
        };
      }));

      if (success > 0) onClaimsImported();
    }
  }

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;
  const canImport = selectedAgent && validCount > 0 && !importing;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-4 h-4 text-[#2563eb]" />
          <span className="font-bold text-[13px]">Bulk Historical Upload</span>
        </div>
        <p className="text-[11px] text-[#64748b]">
          Upload a spreadsheet of past flights to create claims in bulk. Each row becomes a new claim linked to the selected agent.
        </p>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:w-[280px] shrink-0">
            <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">
              Assign to Agent / Partner
            </label>
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-[8px] text-[13px] outline-none bg-white cursor-pointer focus:border-[#2563eb]"
            >
              <option value="">Select an agent...</option>
              {activeAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email} — {a.agent_code}
                </option>
              ))}
            </select>
            {activeAgents.length === 0 && (
              <p className="text-[10px] text-[#dc2626] mt-1">No active agents found. Add agents in Users &amp; Roles first.</p>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                Spreadsheet File (.csv or .xlsx)
              </label>
              <a
                href="/sample-bulk-import.csv"
                download="sample-bulk-import.csv"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff6ff] text-[#2563eb] rounded-[8px] text-[11px] font-bold border border-[#bfdbfe] hover:bg-[#dbeafe] hover:border-[#93c5fd] transition-all cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download Sample Template
              </a>
            </div>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-[10px] px-6 py-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-[#2563eb] bg-[#eff6ff]'
                  : fileName
                  ? 'border-[#16a34a] bg-[#f0fdf4]'
                  : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-[#94a3b8] hover:bg-[#f1f5f9]'
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
              {fileName ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-[#16a34a]" />
                  <div className="text-left">
                    <div className="text-[13px] font-semibold text-[#0f172a]">{fileName}</div>
                    <div className="text-[11px] text-[#64748b]">
                      {parsedRows.length} rows parsed · {validCount} valid · {errorCount} with issues
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="ml-2 p-1.5 rounded-lg hover:bg-[#e2e8f0] text-[#64748b] border-none cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-7 h-7 text-[#94a3b8]" />
                  <div className="text-[13px] font-semibold text-[#0f172a]">
                    Drop your file here or click to browse
                  </div>
                  <div className="text-[11px] text-[#64748b]">Supports .csv and .xlsx — max one sheet</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {['PNR Code', 'Passenger Name', 'Passenger Email', 'Passenger Phone', 'Flight Number', 'Departure Date', 'Origin Airport', 'Destination Airport', 'Delay Minutes', 'Delay Reason'].map(col => (
            <span key={col} className="px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] rounded-[6px] text-[10px] font-medium">
              {col}
            </span>
          ))}
          <span className="px-2 py-0.5 bg-[#eff6ff] text-[#2563eb] rounded-[6px] text-[10px] font-semibold">Delay Minutes &amp; Reason = optional but recommended</span>
        </div>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[10px]">
          <AlertTriangle className="w-4 h-4 text-[#dc2626] shrink-0 mt-0.5" />
          <div className="text-[12px] text-[#dc2626]">{parseError}</div>
        </div>
      )}

      {importSummary && (
        <div className={`flex items-center gap-2 p-3.5 rounded-[10px] border ${
          importSummary.failed === 0 ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#fffbeb] border-[#fde68a]'
        }`}>
          <CheckCircle2 className={`w-4 h-4 shrink-0 ${importSummary.failed === 0 ? 'text-[#16a34a]' : 'text-[#d97706]'}`} />
          <div className="text-[12px] font-medium text-[#0f172a]">
            Import complete: {importSummary.success} claims created successfully
            {importSummary.failed > 0 && `, ${importSummary.failed} failed`}
          </div>
        </div>
      )}

      {parsedRows.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={importRows}
            disabled={!canImport}
            className="px-4 py-2 bg-[#2563eb] text-white rounded-[8px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing &amp; checking {validCount} claims...</>
            ) : (
              <><Upload className="w-4 h-4" /> Import &amp; evaluate {validCount} valid {validCount === 1 ? 'claim' : 'claims'}</>
            )}
          </button>
          {!selectedAgent && <span className="text-[11px] text-[#dc2626]">Select an agent to enable import</span>}
        </div>
      )}

      {parsedRows.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
            <span className="font-bold text-[12px] text-[#0f172a]">Preview ({parsedRows.length} rows)</span>
            <span className="text-[10px] text-[#64748b]">from {fileName}</span>
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {['#', 'PNR', 'Passenger', 'Email', 'Phone', 'Flight', 'Date', 'Route', 'Delay', 'Reason', 'Status', 'Issues'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.map(r => (
                  <tr key={r.rowNumber} className={`hover:bg-[#f8fafc] ${r.status === 'evaluated' ? 'bg-[#f0fdf4]/40' : r.status === 'evaluating' ? 'bg-[#eff6ff]/40' : r.status === 'error' ? 'bg-[#fef2f2]/40' : ''}`}>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8] font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] font-semibold text-[#0f172a]">{r.pnr || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-[#94a3b8] shrink-0" />
                        {r.passengerName || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] max-w-[160px] truncate">{r.email || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] whitespace-nowrap">{r.phone || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] font-semibold">{r.flightNumber || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap">{r.flightDate || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap font-mono">{r.origin || '?'} → {r.destination || '?'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap font-semibold text-[#0f172a]">{r.delayMinutes != null ? `${r.delayMinutes}m` : <span className="text-[#94a3b8] font-normal">—</span>}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] whitespace-nowrap max-w-[140px] truncate">{r.delayReason || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px]">
                      {r.status === 'evaluated' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold whitespace-nowrap ${
                            r.engineStatus === 'Eligible' ? 'bg-[#f0fdf4] text-[#16a34a]' :
                            r.engineStatus === 'Not Eligible - Expired' ? 'bg-[#f1f5f9] text-[#64748b]' :
                            r.engineStatus === 'Not Eligible' ? 'bg-[#fef2f2] text-[#dc2626]' :
                            r.engineStatus === 'Force Majeure' ? 'bg-[#fffbeb] text-[#d97706]' :
                            'bg-[#f8fafc] text-[#64748b]'
                          }`}>{r.engineStatus}{r.engineAmount && r.engineStatus === 'Eligible' ? ` · ${r.engineAmount}` : ''}</span>
                          <span className="text-[9px] text-[#94a3b8]">{r.claimRef}</span>
                        </div>
                      ) : r.status === 'evaluating' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#eff6ff] text-[#2563eb] whitespace-nowrap">
                          <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                        </span>
                      ) : r.status === 'imported' ? (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#f0fdf4] text-[#16a34a]">Imported {r.claimRef}</span>
                      ) : r.status === 'error' ? (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#fef2f2] text-[#dc2626]">Failed</span>
                      ) : r.valid ? (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#f8fafc] text-[#64748b]">Pending Check</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#fffbeb] text-[#d97706]">Invalid</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[10px] text-[#dc2626] max-w-[180px]">
                      {r.errors.length > 0 ? r.errors.join('; ') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}