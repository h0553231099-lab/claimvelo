import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Gavel, AlertTriangle } from 'lucide-react';

interface AuditEntry {
  id: string;
  user_email: string;
  role: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  claimId: string;
  claimRef: string;
  currentStatus: string;
  onOverridden?: () => void;
}

const DECISIONS = [
  { val: 'Eligible', label: 'Eligible', color: 'text-[#16a34a] border-[#bbf7d0] bg-[#f0fdf4]' },
  { val: 'Not Eligible', label: 'Not Eligible', color: 'text-[#dc2626] border-[#fecaca] bg-[#fef2f2]' },
  { val: 'Pending Check', label: 'Pending Check', color: 'text-[#ea580c] border-[#fed7aa] bg-[#fff7ed]' },
  { val: 'Force Majeure', label: 'Force Majeure', color: 'text-[#92400e] border-[#fde68a] bg-[#fffbeb]' },
];

export default function OverridePanel({ claimId, claimRef, currentStatus, onOverridden }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  useEffect(() => {
    loadAuditHistory();
  }, [claimId]);

  async function loadAuditHistory() {
    const { data } = await supabase
      .from('audit_log')
      .select('id, user_email, role, action, old_values, new_values, created_at')
      .eq('entity_id', claimId)
      .order('created_at', { ascending: false });
    if (data) setAuditHistory(data as AuditEntry[]);
  }

  async function submitOverride() {
    if (!decision) { setError('Please select a decision.'); return; }
    if (!reason.trim() || reason.trim().length < 10) { setError('Reason is mandatory (minimum 10 characters).'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/override-eligibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ claimId, decision, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Override failed');
      setShowForm(false);
      setDecision('');
      setReason('');
      await loadAuditHistory();
      onOverridden?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Override failed');
    }
    setSubmitting(false);
  }

  return (
    <div className="border border-[#e2e8f0] rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <Gavel className="w-4 h-4 text-[#64748b]" />
        <span className="font-bold text-[13px] text-[#0f172a]">Override Eligibility</span>
        <span className="ml-auto text-[10px] text-[#94a3b8]">Current: {currentStatus}</span>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 border-2 border-[#e2e8f0] rounded-lg text-[12px] font-semibold text-[#374151] cursor-pointer hover:border-[#0f2744] hover:text-[#0f2744] transition-colors bg-[#f8fafc]"
        >
          Override Decision
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Decision buttons */}
          <div>
            <div className="text-[11px] font-semibold text-[#374151] mb-1.5">Decision</div>
            <div className="grid grid-cols-2 gap-2">
              {DECISIONS.map(({ val, label, color }) => (
                <button
                  key={val}
                  onClick={() => setDecision(val)}
                  className={`px-3 py-2 rounded-lg text-[12px] font-semibold border cursor-pointer transition-all ${decision === val ? color : 'text-[#94a3b8] bg-white border-[#e2e8f0] hover:border-[#cbd5e1]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <div className="text-[11px] font-semibold text-[#374151] mb-1.5">Reason (mandatory, min 10 chars) <span className="text-[#dc2626]">*</span></div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this override is necessary..."
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] resize-none min-h-[80px]"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[11px] text-[#dc2626]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={submitOverride}
              disabled={submitting}
              className="flex-1 py-2 bg-[#0f2744] text-white rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#1a3a5c] disabled:opacity-50 border-none"
            >
              {submitting ? 'Applying...' : 'Apply Override'}
            </button>
            <button
              onClick={() => { setShowForm(false); setDecision(''); setReason(''); setError(''); }}
              className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#f1f5f9]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Audit history */}
      {auditHistory.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#e2e8f0]">
          <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Audit History</div>
          <div className="flex flex-col gap-2">
            {auditHistory.map(entry => (
              <div key={entry.id} className="text-[11px] border border-[#e2e8f0] rounded-lg p-2 bg-[#f8fafc]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-[#0f172a]">{entry.action}</span>
                  <span className="text-[#94a3b8]">{new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <div className="text-[#64748b]">
                  by {entry.user_email || 'system'} ({entry.role || '—'})
                </div>
                {entry.new_values && (
                  <div className="mt-1 text-[#374151]">
                    {Object.entries(entry.new_values).map(([k, v]) => (
                      <span key={k} className="mr-3">{k}: <strong>{String(v)}</strong></span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
