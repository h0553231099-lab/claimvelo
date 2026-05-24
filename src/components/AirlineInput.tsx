import { useState, useRef, useEffect, useCallback } from 'react';
import { Plane } from 'lucide-react';

export type Airline = { iata: string; name: string; country: string };

const SPEC_AIRLINES: Airline[] = [
  { iata: 'LY', name: 'El Al Israel Airlines', country: 'Israel' },
  { iata: 'BA', name: 'British Airways', country: 'United Kingdom' },
  { iata: 'W6', name: 'Wizz Air', country: 'Hungary' },
  { iata: 'FR', name: 'Ryanair', country: 'Ireland' },
  { iata: 'LH', name: 'Lufthansa', country: 'Germany' },
  { iata: 'UA', name: 'United Airlines', country: 'United States' },
  { iata: 'DL', name: 'Delta Air Lines', country: 'United States' },
  { iata: 'AA', name: 'American Airlines', country: 'United States' },
  { iata: 'EK', name: 'Emirates', country: 'United Arab Emirates' },
  { iata: 'TK', name: 'Turkish Airlines', country: 'Turkey' },
  { iata: 'AZ', name: 'ITA Airways', country: 'Italy' },
  { iata: 'UX', name: 'Air Europa', country: 'Spain' },
  { iata: 'IB', name: 'Iberia', country: 'Spain' },
  { iata: 'A3', name: 'Aegean Airlines', country: 'Greece' },
  { iata: 'TO', name: 'Transavia France', country: 'France' },
  { iata: 'HV', name: 'Transavia Airlines', country: 'Netherlands' },
  { iata: 'U2', name: 'EasyJet', country: 'United Kingdom' },
  { iata: 'VY', name: 'Vueling Airlines', country: 'Spain' },
  { iata: 'OS', name: 'Austrian Airlines', country: 'Austria' },
  { iata: 'LX', name: 'Swiss International Air Lines', country: 'Switzerland' },
  { iata: 'SN', name: 'Brussels Airlines', country: 'Belgium' },
  { iata: 'JU', name: 'Air Serbia', country: 'Serbia' },
  { iata: 'LO', name: 'LOT Polish Airlines', country: 'Poland' },
  { iata: 'BT', name: 'Air Baltic', country: 'Latvia' },
  { iata: 'IZ', name: 'Arkia', country: 'Israel' },
  { iata: '6H', name: 'Israir Airlines', country: 'Israel' },
];

let cachedAirlines: Airline[] | null = null;
let loadPromise: Promise<Airline[]> | null = null;

async function loadAirlines(): Promise<Airline[]> {
  if (cachedAirlines) return cachedAirlines;
  if (loadPromise) return loadPromise;

  loadPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat')
    .then(r => r.text())
    .then(text => {
      const airlines: Airline[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g);
        if (!parts || parts.length < 8) continue;
        const strip = (s: string) => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
        const name = strip(parts[1]);
        const iata = strip(parts[3]);
        const country = strip(parts[6]);
        const active = strip(parts[7]);
        if (!iata || iata === '\\N' || iata.length < 2) continue;
        if (active !== 'Y') continue;
        if (!name || name === '\\N') continue;
        airlines.push({ iata, name, country });
      }
      // Merge spec airlines first so they always appear prominently
      const specCodes = new Set(SPEC_AIRLINES.map(a => a.iata));
      const extra = airlines.filter(a => !specCodes.has(a.iata));
      cachedAirlines = [...SPEC_AIRLINES, ...extra];
      return cachedAirlines;
    })
    .catch(() => {
      cachedAirlines = SPEC_AIRLINES;
      return SPEC_AIRLINES;
    });

  return loadPromise;
}

function search(airlines: Airline[], q: string): Airline[] {
  if (!q || q.length < 1) return [];
  const lower = q.toLowerCase();
  const exact: Airline[] = [];
  const starts: Airline[] = [];
  const contains: Airline[] = [];

  for (const a of airlines) {
    const iataL = a.iata.toLowerCase();
    const nameL = a.name.toLowerCase();
    const countryL = a.country.toLowerCase();
    if (iataL === lower) { exact.push(a); continue; }
    if (nameL.startsWith(lower) || iataL.startsWith(lower)) { starts.push(a); continue; }
    if (nameL.includes(lower) || countryL.includes(lower)) { contains.push(a); }
  }

  return [...exact, ...starts, ...contains].slice(0, 10);
}

// Fallback alias for initial render before loadAirlines resolves
const FALLBACK_AIRLINES: Airline[] = SPEC_AIRLINES;

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export default function AirlineInput({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Airline[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [airlines, setAirlines] = useState<Airline[]>(FALLBACK_AIRLINES);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const ensureLoaded = useCallback(async () => {
    if (cachedAirlines && cachedAirlines.length > 50) {
      setAirlines(cachedAirlines);
      return;
    }
    setLoading(true);
    const list = await loadAirlines();
    setAirlines(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    const res = search(airlines, query);
    setResults(res);
    setOpen(focused && query.length >= 1 && res.length > 0);
  }, [query, focused, airlines]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function select(a: Airline) {
    const formatted = `${a.name} (${a.iata})`;
    setQuery(formatted);
    onChange(formatted);
    setOpen(false);
    setFocused(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Plane className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none z-10" />
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
        onFocus={() => { setFocused(true); ensureLoaded(); }}
        placeholder={placeholder || 'Airline name or code'}
        className={`w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] transition-colors bg-white ${className || ''}`}
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#e2e8f0] rounded-xl shadow-xl z-50 overflow-hidden max-h-[280px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-2.5 text-[12px] text-[#94a3b8]">Loading airlines...</div>
          )}
          {results.map(a => (
            <button
              key={a.iata}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(a); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f1f5f9] border-none bg-white cursor-pointer transition-colors border-b border-[#f1f5f9] last:border-0"
            >
              <div className="w-10 h-8 bg-[#0f2744] text-white rounded-lg flex items-center justify-center text-[11px] font-black shrink-0">
                {a.iata}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0f172a] truncate">{a.name}</div>
                <div className="text-[11px] text-[#94a3b8]">{a.country}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
