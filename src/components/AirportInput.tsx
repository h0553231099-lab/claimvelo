import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';

export type Airport = { code: string; name: string; city: string; country: string };

const SPEC_AIRPORTS: Airport[] = [
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', country: 'United States' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States' },
  { code: 'TLV', name: 'Ben Gurion International Airport', city: 'Tel Aviv', country: 'Israel' },
  { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates' },
  { code: 'FRA', name: 'Frankfurt am Main Airport', city: 'Frankfurt', country: 'Germany' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey' },
  { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country: 'Italy' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country: 'Spain' },
  { code: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat Airport', city: 'Barcelona', country: 'Spain' },
  { code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'Greece' },
  { code: 'LCA', name: 'Larnaca International Airport', city: 'Larnaca', country: 'Cyprus' },
  { code: 'BUD', name: 'Budapest Ferenc Liszt International Airport', city: 'Budapest', country: 'Hungary' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany' },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'United States' },
  { code: 'BGI', name: 'Grantley Adams International Airport', city: 'Bridgetown', country: 'Barbados' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' },
];

let cachedAirports: Airport[] | null = null;
let loadPromise: Promise<Airport[]> | null = null;

async function loadAirports(): Promise<Airport[]> {
  if (cachedAirports) return cachedAirports;
  if (loadPromise) return loadPromise;
  loadPromise = fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat')
    .then(r => r.text())
    .then(text => {
      const airports: Airport[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g);
        if (!parts || parts.length < 5) continue;
        const strip = (s: string) => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
        const name = strip(parts[1]);
        const city = strip(parts[2]);
        const country = strip(parts[3]);
        const code = strip(parts[4]);
        if (!code || code === '\\N' || code.length !== 3) continue;
        airports.push({ code, name, city, country });
      }
      cachedAirports = airports.length > 0 ? airports : SPEC_AIRPORTS;
      return cachedAirports;
    })
    .catch(() => {
      cachedAirports = SPEC_AIRPORTS;
      return SPEC_AIRPORTS;
    });
  return loadPromise;
}

function search(airports: Airport[], q: string): Airport[] {
  if (!q || q.length < 1) return [];
  const lower = q.toLowerCase().trim();
  const exact: Airport[] = [];
  const starts: Airport[] = [];
  const contains: Airport[] = [];

  for (const a of airports) {
    const codeL = a.code.toLowerCase();
    const nameL = a.name.toLowerCase();
    const cityL = a.city.toLowerCase();
    const countryL = a.country.toLowerCase();

    if (codeL === lower) { exact.push(a); continue; }
    if (codeL.startsWith(lower) || cityL.startsWith(lower)) { starts.push(a); continue; }
    if (nameL.includes(lower) || cityL.includes(lower) || countryL.includes(lower) || codeL.includes(lower)) {
      contains.push(a);
    }
  }

  return [...exact, ...starts, ...contains].slice(0, 10);
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export default function AirportInput({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Airport[]>([]);
  const [focused, setFocused] = useState(false);
  const [airports, setAirports] = useState<Airport[]>(cachedAirports ?? SPEC_AIRPORTS);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const suppressSync = useRef(false);

  // Sync from parent only when not actively editing
  useEffect(() => {
    if (!suppressSync.current) {
      setQuery(value);
    }
  }, [value]);

  const updateDropdownPos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

  // Recompute results + refresh dropdown position whenever query changes
  useEffect(() => {
    const res = search(airports, query);
    setResults(res);
    if (focused) updateDropdownPos();
  }, [query, airports, focused, updateDropdownPos]);

  // Load full airport list in background on mount
  useEffect(() => {
    loadAirports().then(list => setAirports(list));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!focused) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setFocused(false);
    }
    function onScroll() { updateDropdownPos(); }
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [focused, updateDropdownPos]);

  function select(a: Airport) {
    const formatted = `${a.city} (${a.code})`;
    suppressSync.current = false;
    setQuery(formatted);
    onChange(formatted);
    setFocused(false);
  }

  function handleFocus() {
    suppressSync.current = true;
    setFocused(true);
    updateDropdownPos();
  }

  function handleBlur() {
    suppressSync.current = false;
    // Small delay so mousedown on dropdown item fires first
    setTimeout(() => {
      const lower = query.trim().toLowerCase();
      const exact = airports.find(a => a.code.toLowerCase() === lower);
      if (exact) {
        select(exact);
      } else if (results.length === 1) {
        select(results[0]);
      } else {
        setFocused(false);
      }
    }, 200);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    suppressSync.current = true;
    setQuery(val);
    onChange(val);
    updateDropdownPos();
  }

  const showDropdown = focused && results.length > 0 && query.length >= 1;

  const dropdown = showDropdown ? createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 99999 }}
      className="bg-white border border-[#e2e8f0] rounded-xl shadow-2xl max-h-[280px] overflow-y-auto"
    >
      {results.map(a => (
        <button
          key={a.code}
          type="button"
          onMouseDown={e => { e.preventDefault(); select(a); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f1f5f9] border-none bg-white cursor-pointer transition-colors border-b border-[#f1f5f9] last:border-0"
        >
          <div className="w-10 h-8 bg-[#0f2744] text-white rounded-lg flex items-center justify-center text-[11px] font-black shrink-0">
            {a.code}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#0f172a] truncate">{a.name}</div>
            <div className="text-[11px] text-[#94a3b8]">{a.city} · {a.country}</div>
          </div>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563eb] pointer-events-none z-10" />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || 'City or Airport'}
        className={`w-full pl-9 pr-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] transition-colors bg-white ${className || ''}`}
        autoComplete="off"
      />
      {dropdown}
    </div>
  );
}
