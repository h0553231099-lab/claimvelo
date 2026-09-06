import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, X, User, Download } from 'lucide-react';

/**
 * ExcelImport — Excel Leads MVP ingestion screen.
 *
 * Reuses the parsing helpers from the original BulkImport component (header
 * aliasing, date/name parsing, row validation) but does NOT create claims.
 * Instead it POSTs the parsed rows to the server-side `process-excel-import`
 * Edge Function, which stores raw rows, deduplicates, groups by booking/
 * passenger, and creates leads — never claims.
 */

interface WorkerProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  agent_code: string;
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

const SAMPLE_CSV_CONTENT = `PNR Code,Passenger Name,Passenger Email,Passenger Phone,Flight Number,Departure Date,Origin Airport,Destination Airport,Delay Minutes,Delay Reason
TLV001,Roni Levi,roni.levi@email.com,+972 50 123 4567,LY315,2021-06-15,TLV,LHR,300,Carrier
ABC123,Jane Doe,jane.doe@email.com,+44 7700 900123,BA456,2026-09-15,LHR,CDG,120,Carrier
ABC123,John Doe,john.doe@email.com,,BA456,2026-09-15,LHR,CDG,120,Carrier
ELI003,John Smith,john.smith@email.com,+44 7700 900456,FR2389,2026-09-20,DUB,STN,240,Technical
FMJ004,Maria Garcia,maria.garcia@email.com,+353 86 123 4567,EI106,2026-10-01,MAN,ORK,500,Weather
`;

function downloadSampleCSV(): void {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sample-excel-leads.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value.trim()); value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function parseCsvText(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, unknown>>((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

interface ImportSummary {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  unique_rows: number;
  duplicate_rows: number;
  leads_created: number;
  leads_already_existing: number;
  status_counts: Record<string, number>;
}

interface Props {
  workers: WorkerProfile[];
  onImported: () => void;
}

export default function ExcelImport({ workers, onImported }: Props) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAgents = workers.filter(w => w.status === 'active' && w.agent_code);

  const parseFile = useCallback(async (file: File) => {
    setParseError('');
    setParsedRows([]);
    setImportSummary(null);
    setImportError('');
    setFileName(file.name);

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      let json: Record<string, unknown>[];
      if (isCsv) {
        json = parseCsvText(await file.text());
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) { setParseError('No sheets found in the file.'); return; }
        json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      }
      if (json.length === 0) { setParseError('The file contains no data rows.'); return; }

      const headers = Object.keys(json[0]);
      const colMap: Record<string, string | null> = {};
      for (const field of Object.keys(HEADER_ALIASES)) {
        colMap[field] = findColumn(headers, field);
      }
      const requiredFields = ['pnr', 'passengerName', 'flightNumber', 'flightDate', 'origin', 'destination'];
      const missingCols = requiredFields.filter(field => !colMap[field]);
      if (missingCols.length > 0) {
        setParseError(
          `Could not find columns for: ${missingCols.join(', ')}. ` +
          `Expected: PNR Code, Passenger Name, Passenger Email, Passenger Phone, Flight Number, Departure Date, Origin Airport, Destination Airport. ` +
          `Optional but recommended: Delay Minutes, Delay Reason.`
        );
        return;
      }

      const rows: ParsedRow[] = json.map((raw, idx) => {
        const pnr = String(raw[colMap.pnr!] || '').trim().toUpperCase().slice(0, 6);
        const passengerName = String(raw[colMap.passengerName!] || '').trim();
        const { firstName, lastName } = parseName(passengerName);
        const email = colMap.email ? String(raw[colMap.email!] || '').trim() : '';
        const phone = colMap.phone ? String(raw[colMap.phone!] || '').trim() : '';
        const flightNumber = String(raw[colMap.flightNumber!] || '').trim().toUpperCase();
        const flightDate = parseDateValue(raw[colMap.flightDate!]);
        const origin = String(raw[colMap.origin!] || '').trim().toUpperCase().slice(0, 3);
        const destination = String(raw[colMap.destination!] || '').trim().toUpperCase().slice(0, 3);
        const delayMinutes = colMap.delayMinutes ? parseDelayMinutes(raw[colMap.delayMinutes!]) : null;
        const delayReason = colMap.delayReason ? String(raw[colMap.delayReason!] || '').trim() : '';
        const rowData: Partial<ParsedRow> = { pnr, passengerName, flightNumber, flightDate, origin, destination };
        const errors = validateRow(rowData);
        return {
          rowNumber: idx + 2, pnr, passengerName, firstName, lastName, email, phone,
          flightNumber, flightDate, origin, destination, delayMinutes, delayReason,
          valid: errors.length === 0, errors,
        };
      });
      setParsedRows(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown file format error';
      setParseError(`Failed to read the file: ${message}`);
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
    setFileName(''); setParsedRows([]); setParseError(''); setImportSummary(null); setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function importRows() {
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    setImportError('');
    setImportSummary(null);

    const agentCode = activeAgents.find(a => a.id === selectedAgent)?.agent_code || '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-excel-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          fileName,
          agentCode,
          rows: parsedRows,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setImportError(data.error || 'Import failed');
        setImporting(false);
        return;
      }
      setImportSummary(data.summary as ImportSummary);
      onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Network error during import');
    }
    setImporting(false);
  }

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;
  const canImport = validCount > 0 && !importing;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-4 h-4 text-[#2563eb]" />
          <span className="font-bold text-[13px]">Excel Leads Import</span>
        </div>
        <p className="text-[11px] text-[#64748b]">
          Upload a spreadsheet of flights to create <strong>leads</strong> (one per passenger per booking).
          Rows are grouped by PNR + passenger; multiple segments stay attached. No claims are created.
        </p>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:w-[280px] shrink-0">
            <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">
              Assign to Agent / Agency
            </label>
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-[8px] text-[13px] outline-none bg-white cursor-pointer focus:border-[#2563eb]"
            >
              <option value="">No agent (unassigned)</option>
              {activeAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email} — {a.agent_code}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                Spreadsheet File (.csv or .xlsx)
              </label>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); downloadSampleCSV(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff6ff] text-[#2563eb] rounded-[8px] text-[11px] font-bold border border-[#bfdbfe] hover:bg-[#dbeafe] hover:border-[#93c5fd] transition-all cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download Sample Template
              </button>
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
          <span className="px-2 py-0.5 bg-[#eff6ff] text-[#2563eb] rounded-[6px] text-[10px] font-semibold">Email/Phone optional — lead still created</span>
        </div>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[10px]">
          <AlertTriangle className="w-4 h-4 text-[#dc2626] shrink-0 mt-0.5" />
          <div className="text-[12px] text-[#dc2626]">{parseError}</div>
        </div>
      )}

      {importError && (
        <div className="flex items-start gap-2 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[10px]">
          <AlertTriangle className="w-4 h-4 text-[#dc2626] shrink-0 mt-0.5" />
          <div className="text-[12px] text-[#dc2626]">{importError}</div>
        </div>
      )}

      {importSummary && (
        <div className="p-3.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[10px]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[#16a34a] shrink-0" />
            <div className="text-[12px] font-semibold text-[#0f172a]">Import complete — leads created</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-white rounded-[8px] p-2 border border-[#e2e8f0]">
              <div className="text-[#64748b]">Total rows</div>
              <div className="font-bold text-[14px]">{importSummary.total_rows}</div>
            </div>
            <div className="bg-white rounded-[8px] p-2 border border-[#e2e8f0]">
              <div className="text-[#64748b]">Leads created</div>
              <div className="font-bold text-[14px] text-[#16a34a]">{importSummary.leads_created}</div>
            </div>
            <div className="bg-white rounded-[8px] p-2 border border-[#e2e8f0]">
              <div className="text-[#64748b]">Duplicates skipped</div>
              <div className="font-bold text-[14px] text-[#d97706]">{importSummary.leads_already_existing}</div>
            </div>
            <div className="bg-white rounded-[8px] p-2 border border-[#e2e8f0]">
              <div className="text-[#64748b]">Duplicate rows</div>
              <div className="font-bold text-[14px] text-[#d97706]">{importSummary.duplicate_rows}</div>
            </div>
          </div>
          {importSummary.status_counts && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(importSummary.status_counts).map(([k, v]) => v > 0 && (
                <span key={k} className="px-2 py-0.5 bg-[#f1f5f9] rounded-[6px] text-[10px] font-semibold text-[#64748b]">{k}: {v}</span>
              ))}
            </div>
          )}
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing {validCount} rows...</>
            ) : (
              <><Upload className="w-4 h-4" /> Import {validCount} valid rows as leads</>
            )}
          </button>
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
                  {['#', 'PNR', 'Passenger', 'Email', 'Phone', 'Flight', 'Date', 'Route', 'Delay', 'Reason', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.map(r => (
                  <tr key={r.rowNumber} className={`hover:bg-[#f8fafc] ${!r.valid ? 'bg-[#fffbeb]/40' : ''}`}>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8] font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] font-semibold text-[#0f172a]">{r.pnr || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-[#94a3b8] shrink-0" />
                        {r.passengerName || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] max-w-[160px] truncate">{r.email || <span className="text-[#d97706]">missing</span>}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] whitespace-nowrap">{r.phone || <span className="text-[#d97706]">missing</span>}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] font-semibold">{r.flightNumber || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap">{r.flightDate || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap font-mono">{r.origin || '?'} → {r.destination || '?'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] whitespace-nowrap font-semibold text-[#0f172a]">{r.delayMinutes != null ? `${r.delayMinutes}m` : <span className="text-[#94a3b8] font-normal">—</span>}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px] text-[#64748b] whitespace-nowrap max-w-[140px] truncate">{r.delayReason || '—'}</td>
                    <td className="px-3 py-2 border-b border-[#e2e8f0] text-[11px]">
                      {r.valid ? (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#f0fdf4] text-[#16a34a]">Valid</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#fffbeb] text-[#d97706]" title={r.errors.join('; ')}>Issues</span>
                      )}
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
