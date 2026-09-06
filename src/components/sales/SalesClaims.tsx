import { useState, useMemo } from 'react';
import { Claim } from '../../types';

interface Props {
  claims: Claim[];
  agentNames: Record<string, string>; // agent_code → full_name
  loading: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Untouched':  { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' },
  'In Progress':{ bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
  'Submitted':  { bg: '#ecfeff', text: '#0891b2', dot: '#0891b2' },
  'Waiting':    { bg: '#fffbeb', text: '#d97706', dot: '#d97706' },
  'Resolved':   { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
  'Escalated':  { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
  'Pending Check': { bg: '#fff7ed', text: '#ea580c', dot: '#ea580c' },
  'Eligible':   { bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  'Not Eligible': { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  'Not Eligible - Expired': { bg: '#f8fafc', text: '#94a3b8', dot: '#cbd5e1' },
  'Force Majeure': { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
};

function Badge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

const selectCls = 'px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb] bg-white cursor-pointer';
const inputCls = 'px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb] bg-white';

export default function SalesClaims({ claims, agentNames, loading }: Props) {
  const [agentFilter, setAgentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [airlineFilter, setAirlineFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const countries = useMemo(() => [...new Set(claims.map(c => c.country).filter(Boolean))].sort(), [claims]);
  const airlines = useMemo(() => [...new Set(claims.map(c => c.airline).filter(Boolean))].sort(), [claims]);
  const statuses = useMemo(() => [...new Set(claims.map(c => c.status))].sort(), [claims]);
  const agentCodes = useMemo(() => [...new Set(claims.map(c => c.agent).filter(c => c && c !== '—'))].sort(), [claims]);

  const filtered = useMemo(() => {
    return claims.filter(c => {
      if (agentFilter && c.agent !== agentFilter) return false;
      if (countryFilter && c.country !== countryFilter) return false;
      if (airlineFilter && c.airline !== airlineFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (dateFrom && c.created_at && c.created_at.split('T')[0] < dateFrom) return false;
      if (dateTo && c.created_at && c.created_at.split('T')[0] > dateTo) return false;
      return true;
    });
  }, [claims, agentFilter, countryFilter, airlineFilter, statusFilter, dateFrom, dateTo]);

  function clearFilters() {
    setAgentFilter(''); setDateFrom(''); setDateTo(''); setCountryFilter(''); setAirlineFilter(''); setStatusFilter('');
  }

  const hasFilters = agentFilter || dateFrom || dateTo || countryFilter || airlineFilter || statusFilter;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-[#0f172a]">Leads & Claims</h1>
        <p className="text-[13px] text-[#64748b] mt-1">All claims from your team. Use filters to narrow down.</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e2e8f0] rounded-[12px] p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Agent</label>
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className={selectCls}>
              <option value="">All agents</option>
              {agentCodes.map(a => <option key={a} value={a}>{agentNames[a] || a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Country</label>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className={selectCls}>
              <option value="">All</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Airline</label>
            <select value={airlineFilter} onChange={e => setAirlineFilter(e.target.value)} className={selectCls}>
              <option value="">All</option>
              {airlines.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
              <option value="">All</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="mt-3 text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] border-none bg-transparent cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
          <span className="font-bold text-[13px] text-[#0f172a]">Claims</span>
          <span className="text-[11px] text-[#64748b]">{filtered.length} of {claims.length}</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-[13px] text-[#64748b]">Loading claims...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#64748b]">{hasFilters ? 'No claims match your filters.' : 'No claims yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Ref', 'Agent', 'Passenger', 'Route', 'Airline', 'Status', 'Compensation', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono font-semibold text-[#2563eb]">{c.claim_ref}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{agentNames[c.agent] || c.agent || '—'}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{c.passenger_first_name} {c.passenger_last_name}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.departure} → {c.arrival}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#64748b]">{c.airline || '—'}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0]"><Badge status={c.status} /></td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#16a34a]">{c.compensation_amount != null ? `€${Number(c.compensation_amount).toLocaleString()}` : c.amount}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8]">{c.created_at?.split('T')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
