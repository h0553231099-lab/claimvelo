import { useState } from 'react';
import { Commission, UserProfile } from '../../types';
import { approveCommission, payCommission } from '../../lib/agentApi';
import { CheckCircle, Clock, DollarSign, Loader2 } from 'lucide-react';

interface Props {
  commissions: Commission[];
  loading: boolean;
  user: UserProfile | null;
  onRefresh: () => void;
}

const euro = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SalesCommissions({ commissions, loading, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleApprove(id: string) {
    setError('');
    setBusy(id);
    try {
      await approveCommission(id);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    }
    setBusy(null);
  }

  async function handlePay(id: string) {
    setError('');
    setBusy(id);
    try {
      await payCommission(id);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark paid');
    }
    setBusy(null);
  }

  const total = commissions.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const pending = commissions.filter(c => c.commission_status === 'pending');
  const approved = commissions.filter(c => c.commission_status === 'approved');
  const paid = commissions.filter(c => c.commission_status === 'paid');

  const sumPending = pending.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const sumApproved = approved.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const sumPaid = paid.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-black text-[#0f172a]">Commissions</h1>
        <p className="text-[13px] text-[#64748b] mt-1">Review and process commission payouts for your team.</p>
      </div>

      {error && (
        <div className="mb-4 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Commission', value: euro(total), icon: DollarSign, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Pending', value: euro(sumPending), icon: Clock, color: '#d97706', bg: '#fffbeb', count: pending.length },
          { label: 'Approved', value: euro(sumApproved), icon: CheckCircle, color: '#0891b2', bg: '#ecfeff', count: approved.length },
          { label: 'Paid', value: euro(sumPaid), icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4', count: paid.length },
        ].map(({ label, value, icon: Icon, color, bg, count }) => (
          <div key={label} className="bg-white border border-[#e2e8f0] rounded-[12px] px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <div className="text-[16px] font-black leading-none" style={{ color }}>{value}</div>
              <div className="text-[10px] text-[#64748b] font-medium mt-0.5">{label}{count != null ? ` · ${count}` : ''}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Workflow legend */}
      <div className="flex items-center gap-2 mb-4 text-[11px] text-[#64748b]">
        <span className="font-semibold">Workflow:</span>
        <span className="px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#d97706] font-semibold">Pending</span>
        →
        <span className="px-2 py-0.5 rounded-full bg-[#ecfeff] text-[#0891b2] font-semibold">Approved</span>
        →
        <span className="px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a] font-semibold">Paid</span>
      </div>

      {/* Commissions table */}
      <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[13px] text-[#64748b]">Loading commissions...</div>
        ) : commissions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-[28px] mb-2">💰</div>
            <div className="text-[13px] font-semibold text-[#0f172a] mb-1">No commissions yet</div>
            <div className="text-[12px] text-[#64748b]">Commissions are generated server-side when claims are resolved.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Agent', 'Claim', 'Rate', 'Amount', 'Status', 'Created', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commissions.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-semibold text-[#0f172a]">{c.agent_name || c.agent_code || '—'}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] font-mono text-[#2563eb]">{c.claim_ref || c.claim_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] text-[#64748b]">{c.commission_rate}%</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[12px] font-bold text-[#16a34a]">{euro(Number(c.commission_amount))}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0]">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        c.commission_status === 'paid' ? 'bg-[#f0fdf4] text-[#16a34a]' :
                        c.commission_status === 'approved' ? 'bg-[#ecfeff] text-[#0891b2]' :
                        'bg-[#fffbeb] text-[#d97706]'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.commission_status === 'paid' ? '#16a34a' : c.commission_status === 'approved' ? '#0891b2' : '#d97706' }} />
                        {c.commission_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0] text-[11px] text-[#94a3b8]">{c.created_at?.split('T')[0]}</td>
                    <td className="px-4 py-3 border-b border-[#e2e8f0]">
                      {busy === c.id ? (
                        <Loader2 className="w-4 h-4 text-[#94a3b8] animate-spin" />
                      ) : c.commission_status === 'pending' ? (
                        <button onClick={() => handleApprove(c.id)} className="px-3 py-1.5 bg-[#0891b2] text-white rounded-[7px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#0e7490] transition-colors">
                          Approve
                        </button>
                      ) : c.commission_status === 'approved' ? (
                        <button onClick={() => handlePay(c.id)} className="px-3 py-1.5 bg-[#16a34a] text-white rounded-[7px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#15803d] transition-colors">
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#94a3b8]">—</span>
                      )}
                    </td>
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
