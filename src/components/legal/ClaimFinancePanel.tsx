/**
 * Claim Finance Panel — shown in the admin Claim Detail modal.
 *
 * Displays the full financial lifecycle of a claim (estimated → approved →
 * airline payment → ClaimVelo fee → customer payout) plus reconciliation
 * status, and surfaces mismatches (underpayment / overpayment / missing
 * payout / incomplete reconciliation).
 *
 * All values are READ from the secure manage-legal-finance endpoint
 * (get-reconciliation). All mutations (approve compensation, record airline
 * payment, set fee, record payout, record legal expense) are wired to the
 * same endpoint — the frontend never computes fees/payouts and never writes
 * protected finance fields directly.
 *
 * Admin / super_admin only (the parent gates visibility).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getReconciliation,
  approveCompensation,
  recordAirlinePayment,
  setClaimveloFee,
  recordCustomerPayout,
  recordLegalExpense,
  type ReconciliationDetail,
} from '../../lib/legalFinanceApi';
import { AlertTriangle, CheckCircle, RefreshCw, Plus, Euro } from 'lucide-react';

interface Props {
  claimId: string;
  claimRef: string;
  estimatedAmount: number | null;
  approvedAmount: number | null;
}

const euro = (n: number | null | undefined) =>
  n == null ? '—'
    : `€${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-[11px] text-[#64748b]">{label}</span>
      <span className={`text-[12px] ${strong ? 'font-bold text-[#0f172a]' : 'text-[#0f172a]'}`}>{value}</span>
    </div>
  );
}

export default function ClaimFinancePanel({ claimId, claimRef, estimatedAmount, approvedAmount }: Props) {
  const [recon, setRecon] = useState<ReconciliationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── inline action forms ──────────────────────────────────────────────────
  const [approveAmt, setApproveAmt] = useState('');
  const [airlineAmt, setAirlineAmt] = useState('');
  const [airlineDate, setAirlineDate] = useState('');
  const [airlineRef, setAirlineRef] = useState('');
  const [feeTier, setFeeTier] = useState<'standard' | 'legal'>('legal');
  const [payoutAmt, setPayoutAmt] = useState('');
  const [payoutDate, setPayoutDate] = useState('');
  const [payoutRef, setPayoutRef] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [expDate, setExpDate] = useState('');
  const [expDesc, setExpDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getReconciliation(claimId);
      setRecon(r);
      if (approvedAmount != null && !approveAmt) setApproveAmt(String(approvedAmount));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  }, [claimId, approvedAmount, approveAmt]);

  useEffect(() => { load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'ok', text: `${label} saved.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : `${label} failed` });
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <div className="p-5 text-[12px] text-[#94a3b8]">Loading finance…</div>;
  }
  if (error) {
    return (
      <div className="p-4">
        <div className="text-[12px] text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-[8px] px-3 py-2 mb-3">{error}</div>
        <button onClick={load} className="text-[11px] text-[#2563eb] hover:underline cursor-pointer">Retry</button>
      </div>
    );
  }

  const overall = recon?.overallStatus ?? 'pending';
  const overallStyle: Record<string, string> = {
    complete: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]',
    mismatch: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
    in_progress: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]',
    pending: 'bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]',
  };
  const overallLabel: Record<string, string> = {
    complete: 'Reconciled',
    mismatch: 'Mismatch — review needed',
    in_progress: 'In progress',
    pending: 'Pending',
  };

  // Mismatch flags
  const mismatches: string[] = [];
  if (recon) {
    if (recon.airlineMismatch != null && recon.airlineMismatch > 0) mismatches.push(`Airline underpaid by ${euro(recon.airlineMismatch)}`);
    if (recon.airlineMismatch != null && recon.airlineMismatch < 0) mismatches.push(`Airline overpaid by ${euro(Math.abs(recon.airlineMismatch))}`);
    if (recon.expectedPayout != null && recon.customerPayout.amount <= 0) mismatches.push('Customer payout missing');
    if (recon.payoutMismatch != null && recon.payoutMismatch !== 0) mismatches.push(`Payout mismatch of ${euro(Math.abs(recon.payoutMismatch))}`);
    if (overall === 'in_progress' || overall === 'pending') mismatches.push('Reconciliation incomplete');
  }

  return (
    <div className="p-4 space-y-4">
      {/* Reconciliation status banner */}
      <div className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 ${overallStyle[overall]}`}>
        {overall === 'complete' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
        <span className="text-[12px] font-semibold">{overallLabel[overall]}</span>
        <button onClick={load} disabled={busy !== ''} className="ml-auto text-[#64748b] hover:text-[#0f172a] disabled:opacity-50 cursor-pointer bg-transparent border-none p-0">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {mismatches.length > 0 && (
        <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[8px] px-3 py-2">
          <div className="text-[10px] font-bold text-[#ea580c] uppercase tracking-wider mb-1">Mismatches</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {mismatches.map((m, i) => <li key={i} className="text-[11px] text-[#9a3412]">{m}</li>)}
          </ul>
        </div>
      )}

      {msg && (
        <div className={`text-[11px] font-semibold rounded-[7px] px-3 py-2 ${msg.kind === 'ok' ? 'text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0]' : 'text-[#dc2626] bg-[#fef2f2] border border-[#fecaca]'}`}>{msg.text}</div>
      )}

      {/* Finance summary */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Compensation & Payments — {claimRef}</div>
        <Row label="Estimated compensation" value={euro(estimatedAmount)} />
        <Row label="Approved compensation" value={recon ? euro(recon.approvedCompensation) : '—'} strong />
        <Row label="Airline payment" value={recon ? `${euro(recon.airlinePayment.amount)} (${recon.airlinePayment.status})` : '—'} />
        <Row label="Airline payment date" value={recon?.airlinePayment.date ? recon.airlinePayment.date.split('T')[0] : '—'} />
        <Row label="ClaimVelo fee" value={recon ? `${euro(recon.claimveloFee.amount)}${recon.claimveloFee.tier ? ` (${recon.claimveloFee.tier} ${recon.claimveloFee.rate}%)` : ''}` : '—'} />
        <Row label="Customer payout" value={recon ? `${euro(recon.customerPayout.amount)} (${recon.customerPayout.status})` : '—'} />
        <Row label="Customer payout date" value={recon?.customerPayout.date ? recon.customerPayout.date.split('T')[0] : '—'} />
        {recon?.expectedPayout != null && <Row label="Expected payout (recv − fee)" value={euro(recon.expectedPayout)} />}
        {recon?.airlineMismatch != null && <Row label="Airline mismatch" value={euro(recon.airlineMismatch)} />}
        {recon?.payoutMismatch != null && <Row label="Payout mismatch" value={euro(recon.payoutMismatch)} />}
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3 space-y-3">
        <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Finance Actions</div>

        {/* Approve compensation */}
        <div className="flex items-end gap-2">
          <label className="text-[10px] text-[#64748b] flex-1">
            Approve compensation (€)
            <input type="number" value={approveAmt} onChange={e => setApproveAmt(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" />
          </label>
          <button disabled={busy !== '' || !approveAmt} onClick={() => run('Approve compensation', () => approveCompensation(claimId, Number(approveAmt)))}
            className="px-3 py-1.5 bg-[#0f2744] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed">Approve</button>
        </div>

        {/* Record airline payment */}
        <div className="border-t border-[#f1f5f9] pt-3">
          <div className="text-[10px] font-semibold text-[#64748b] mb-1.5">Record airline payment</div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[10px] text-[#64748b] w-[90px]">Amount (€)<input type="number" value={airlineAmt} onChange={e => setAirlineAmt(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] w-[120px]">Date<input type="date" value={airlineDate} onChange={e => setAirlineDate(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] flex-1 min-w-[120px]">Reference<input value={airlineRef} onChange={e => setAirlineRef(e.target.value)} placeholder="Bank ref / txn id" className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <button disabled={busy !== '' || !airlineAmt || !airlineDate || !airlineRef} onClick={() => run('Airline payment', () => recordAirlinePayment(claimId, Number(airlineAmt), airlineDate, airlineRef))}
              className="px-3 py-1.5 bg-[#16a34a] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed">Record</button>
          </div>
        </div>

        {/* Set ClaimVelo fee */}
        <div className="border-t border-[#f1f5f9] pt-3">
          <div className="text-[10px] font-semibold text-[#64748b] mb-1.5">Set ClaimVelo fee (computed from approved amount)</div>
          <div className="flex items-end gap-2">
            <select value={feeTier} onChange={e => setFeeTier(e.target.value as 'standard' | 'legal')} className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]">
              <option value="standard">Standard — 30%</option>
              <option value="legal">Legal — 50%</option>
            </select>
            <button disabled={busy !== ''} onClick={() => run('ClaimVelo fee', () => setClaimveloFee(claimId, feeTier))}
              className="px-3 py-1.5 bg-[#0f2744] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed">Set fee</button>
          </div>
        </div>

        {/* Record customer payout */}
        <div className="border-t border-[#f1f5f9] pt-3">
          <div className="text-[10px] font-semibold text-[#64748b] mb-1.5">Record customer payout</div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[10px] text-[#64748b] w-[90px]">Amount (€)<input type="number" value={payoutAmt} onChange={e => setPayoutAmt(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] w-[120px]">Date<input type="date" value={payoutDate} onChange={e => setPayoutDate(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] flex-1 min-w-[120px]">Reference<input value={payoutRef} onChange={e => setPayoutRef(e.target.value)} placeholder="Payout ref" className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <button disabled={busy !== '' || !payoutAmt || !payoutDate || !payoutRef} onClick={() => run('Customer payout', () => recordCustomerPayout(claimId, Number(payoutAmt), payoutDate, payoutRef))}
              className="px-3 py-1.5 bg-[#2563eb] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed">Record</button>
          </div>
        </div>

        {/* Record legal expense */}
        <div className="border-t border-[#f1f5f9] pt-3">
          <div className="text-[10px] font-semibold text-[#64748b] mb-1.5">Record legal expense</div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[10px] text-[#64748b] w-[90px]">Amount (€)<input type="number" value={expAmt} onChange={e => setExpAmt(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] w-[120px]">Date<input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <label className="text-[10px] text-[#64748b] flex-1 min-w-[160px]">Description<input value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Court filing fee, etc." className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb]" /></label>
            <button disabled={busy !== '' || !expAmt || !expDate || !expDesc} onClick={() => run('Legal expense', () => recordLegalExpense(Number(expAmt), expDate, expDesc, claimId))}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#92400e] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#78350f] disabled:opacity-50 disabled:cursor-not-allowed"><Plus className="w-3 h-3" />Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
