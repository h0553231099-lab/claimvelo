/**
 * Finance Dashboard — Phase 9C
 *
 * Admin finance view built on the structured (typed) finance_transactions
 * introduced in Phase 9A: airline payments, ClaimVelo fees, customer payouts,
 * agent commissions, legal expenses, and unreconciled claims.
 *
 * Filters: date range, airline, country, claim status, payment status,
 * reconciliation status.
 *
 * All data is READ via RLS (admin-only finance_transactions). No amounts are
 * computed in the frontend — totals are simple sums of server-persisted rows.
 *
 * Admin / super_admin only (the parent gates visibility).
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { FinanceTransaction, Claim } from '../../types';
import { Search, RefreshCw, ArrowUpRight, ArrowDownRight, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';

const euro = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TXN_TYPE_LABELS: Record<string, string> = {
  airline_payment: 'Airline Payment',
  claimvelo_fee: 'ClaimVelo Fee',
  customer_payout: 'Customer Payout',
  agent_commission: 'Agent Commission',
  legal_expense: 'Legal Expense',
  general: 'General',
};

export default function FinanceDashboard() {
  const [txns, setTxns] = useState<FinanceTransaction[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [airline, setAirline] = useState('');
  const [country, setCountry] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [reconStatus, setReconStatus] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [t, c] = await Promise.all([
          supabase.from('finance_transactions').select('*').order('date', { ascending: false }),
          supabase.from('claims').select('*'),
        ]);
        setTxns((t.data || []) as FinanceTransaction[]);
        setClaims((c.data || []) as Claim[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load finance data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Build a claim lookup map for joining txn → claim metadata
  const claimMap = useMemo(() => {
    const m = new Map<string, Claim>();
    for (const c of claims) m.set(c.id, c);
    return m;
  }, [claims]);

  const airlines = useMemo(() => Array.from(new Set(claims.map(c => c.airline).filter(Boolean))).sort(), [claims]);
  const countries = useMemo(() => Array.from(new Set(claims.map(c => c.country).filter(Boolean))).sort(), [claims]);

  // Reconciliation status per claim
  function reconOf(c: Claim): 'complete' | 'mismatch' | 'in_progress' | 'pending' {
    const approved = Number(c.approved_compensation_amount) || 0;
    const received = Number(c.airline_payment_amount) || 0;
    const fee = Number(c.claimvelo_fee_amount) || 0;
    const payout = Number(c.customer_payout_amount) || 0;
    if (approved > 0 && received > 0 && fee > 0 && payout > 0) {
      const airMis = Math.round((approved - received) * 100) / 100;
      const expPayout = Math.round((received - fee) * 100) / 100;
      const payMis = Math.round((expPayout - payout) * 100) / 100;
      return airMis === 0 && payMis === 0 ? 'complete' : 'mismatch';
    }
    if (approved > 0 || received > 0 || fee > 0 || payout > 0) return 'in_progress';
    return 'pending';
  }

  // Filter transactions
  const filteredTxns = useMemo(() => {
    return txns.filter(t => {
      // date filter (on txn.date)
      if (fromDate && t.date && t.date < fromDate) return false;
      if (toDate && t.date && t.date > toDate) return false;
      // join to claim for airline/country/status/payment filters
      const c = t.claim_id ? claimMap.get(t.claim_id) : undefined;
      if (airline && (!c || c.airline !== airline)) return false;
      if (country && (!c || c.country !== country)) return false;
      if (claimStatus && (!c || c.status !== claimStatus)) return false;
      if (paymentStatus) {
        if (!c) return false;
        if (paymentStatus === 'airline_received' && c.airline_payment_status !== 'received') return false;
        if (paymentStatus === 'airline_pending' && c.airline_payment_status !== 'pending' && c.airline_payment_status !== 'partial') return false;
        if (paymentStatus === 'payout_paid' && c.customer_payout_status !== 'paid') return false;
        if (paymentStatus === 'payout_pending' && c.customer_payout_status !== 'pending' && c.customer_payout_status !== 'none') return false;
      }
      if (reconStatus) {
        if (!c) return false;
        if (reconOf(c) !== reconStatus) return false;
      }
      // search
      if (search) {
        const q = search.toLowerCase();
        if (![t.description, t.category, t.claim_ref || '', t.transaction_type || ''].join(' ').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [txns, fromDate, toDate, airline, country, claimStatus, paymentStatus, reconStatus, search, claimMap]);

  // Totals by typed category
  const totals = useMemo(() => {
    const sum = (type: string) => filteredTxns.filter(t => t.transaction_type === type).reduce((s, t) => s + Number(t.amount), 0);
    return {
      airlinePayments: sum('airline_payment'),
      claimveloFees: sum('claimvelo_fee'),
      customerPayouts: sum('customer_payout'),
      agentCommissions: sum('agent_commission'),
      legalExpenses: sum('legal_expense'),
    };
  }, [filteredTxns]);

  // Unreconciled claims (claims with any finance activity but not complete)
  const unreconciled = useMemo(() => {
    return claims.filter(c => {
      const r = reconOf(c);
      if (reconStatus && r !== reconStatus) return false;
      if (airline && c.airline !== airline) return false;
      if (country && c.country !== country) return false;
      if (claimStatus && c.status !== claimStatus) return false;
      return r === 'mismatch' || r === 'in_progress';
    });
  }, [claims, reconStatus, airline, country, claimStatus]);

  function clearFilters() {
    setFromDate(''); setToDate(''); setAirline(''); setCountry('');
    setClaimStatus(''); setPaymentStatus(''); setReconStatus(''); setSearch('');
  }

  const hasFilters = fromDate || toDate || airline || country || claimStatus || paymentStatus || reconStatus || search;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-[#16a34a]" />
        <span className="font-bold text-[14px] text-[#0f172a]">Finance Dashboard</span>
        <span className="text-[11px] text-[#64748b]">{filteredTxns.length} transactions</span>
        {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#94a3b8] ml-auto" />}
      </div>

      {error && <div className="text-[12px] text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-[8px] px-3 py-2 mb-3">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <SummaryCard icon={<ArrowUpRight className="w-4 h-4 text-[#16a34a]" />} bg="bg-[#f0fdf4]" label="Airline Payments" value={euro(totals.airlinePayments)} valueClass="text-[#16a34a]" />
        <SummaryCard icon={<DollarSign className="w-4 h-4 text-[#0f2744]" />} bg="bg-[#eff6ff]" label="ClaimVelo Fees" value={euro(totals.claimveloFees)} valueClass="text-[#0f2744]" />
        <SummaryCard icon={<ArrowDownRight className="w-4 h-4 text-[#dc2626]" />} bg="bg-[#fef2f2]" label="Customer Payouts" value={euro(totals.customerPayouts)} valueClass="text-[#dc2626]" />
        <SummaryCard icon={<DollarSign className="w-4 h-4 text-[#7c3aed]" />} bg="bg-[#f5f3ff]" label="Agent Commissions" value={euro(totals.agentCommissions)} valueClass="text-[#7c3aed]" />
        <SummaryCard icon={<ArrowDownRight className="w-4 h-4 text-[#92400e]" />} bg="bg-[#fffbeb]" label="Legal Expenses" value={euro(totals.legalExpenses)} valueClass="text-[#92400e]" />
        <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-[#ea580c]" />} bg="bg-[#fff7ed]" label="Unreconciled Claims" value={String(unreconciled.length)} valueClass="text-[#ea580c]" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] text-[#64748b]">From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="block mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb]" /></label>
          <label className="text-[10px] text-[#64748b]">To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="block mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb]" /></label>
          <select value={airline} onChange={e => setAirline(e.target.value)} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All airlines</option>
            {airlines.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={country} onChange={e => setCountry(e.target.value)} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={claimStatus} onChange={e => setClaimStatus(e.target.value)} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All claim statuses</option>
            {['Untouched', 'In Progress', 'Submitted', 'Waiting', 'Escalated', 'Resolved'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All payments</option>
            <option value="airline_received">Airline: received</option>
            <option value="airline_pending">Airline: pending/partial</option>
            <option value="payout_paid">Payout: paid</option>
            <option value="payout_pending">Payout: pending</option>
          </select>
          <select value={reconStatus} onChange={e => setReconStatus(e.target.value)} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white">
            <option value="">All reconciliation</option>
            <option value="complete">Reconciled</option>
            <option value="mismatch">Mismatch</option>
            <option value="in_progress">In progress</option>
            <option value="pending">Pending</option>
          </select>
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94a3b8]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-7 pr-3 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] bg-white" />
          </div>
          {hasFilters && <button onClick={clearFilters} className="text-[11px] text-[#dc2626] hover:underline bg-transparent border-none cursor-pointer">Clear</button>}
        </div>
      </div>

      {/* Unreconciled claims */}
      {unreconciled.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-3 mb-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2"><AlertTriangle className="w-3 h-3 text-[#ea580c]" /> Unreconciled Claims</div>
          <div className="space-y-1.5">
            {unreconciled.slice(0, 10).map(c => {
              const r = reconOf(c);
              const approved = Number(c.approved_compensation_amount) || 0;
              const received = Number(c.airline_payment_amount) || 0;
              return (
                <div key={c.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-[#f1f5f9] last:border-0">
                  <span className="font-bold text-[#0f172a]">{c.claim_ref}</span>
                  <span className="text-[#64748b]">{c.airline}</span>
                  <span className="text-[#64748b]">approved {euro(approved)}</span>
                  <span className="text-[#64748b]">recv {euro(received)}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold ${r === 'mismatch' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#fffbeb] text-[#d97706]'}`}>{r === 'mismatch' ? 'Mismatch' : 'In progress'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-2 px-3 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
          <span>Date</span><span>Description</span><span>Type</span><span>Claim</span><span>Amount</span>
        </div>
        {loading ? (
          <div className="text-center py-8 text-[12px] text-[#94a3b8]">Loading transactions…</div>
        ) : filteredTxns.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-[#94a3b8]">No transactions match your filters.</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {filteredTxns.slice(0, 200).map(t => (
              <div key={t.id} className="md:grid md:grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-2 px-3 py-2 border-b border-[#f1f5f9] last:border-0 items-center text-[11px]">
                <span className="text-[#64748b]">{t.date || '—'}</span>
                <span className="text-[#0f172a] truncate">{t.description}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-block ${t.type === 'income' ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'}`}>{TXN_TYPE_LABELS[t.transaction_type || 'general'] || t.category}</span>
                <span className="text-[#64748b]">{t.claim_ref || '—'}</span>
                <span className={`font-bold ${t.type === 'income' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{t.type === 'income' ? '+' : '−'}{euro(Number(t.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, bg, label, value, valueClass }: { icon: React.ReactNode; bg: string; label: string; value: string; valueClass: string }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-3.5 py-3 flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-[#64748b] truncate">{label}</div>
        <div className={`text-[16px] font-bold ${valueClass} truncate`}>{value}</div>
      </div>
    </div>
  );
}
