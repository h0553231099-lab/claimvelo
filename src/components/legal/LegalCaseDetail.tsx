/**
 * Legal Case Detail — shared by the Lawyer Dashboard (read-only) and the Admin
 * Legal Queue (editable).
 *
 * Reads are direct Supabase queries protected by RLS:
 *   - lawyer sees only their own assigned legal_cases / claims / files / comms
 *   - admin sees everything
 *
 * Writes (update legal status, deadlines, notes, reassign lawyer) are wired
 * ONLY to the secure manage-legal-finance `update-legal-case` action. The edge
 * function enforces admin-only authorization — a lawyer call returns 403, so
 * the UI shows edit controls to admins only and renders read-only for lawyers.
 *
 * Escalation history comes from audit_log (admin-only via RLS); for lawyers it
 * is derived from the claim_status_history timeline instead.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { updateLegalCase, type LegalDeadline } from '../../lib/legalFinanceApi';
import type { LegalStatus, ClaimStatusHistory, Claim, LegalCase } from '../../types';
import { Gavel, Calendar, FileText, MessageSquare, Mail, History, Save, Plus, Trash2, AlertCircle } from 'lucide-react';

interface Props {
  claimId: string;
  isAdmin: boolean;
  lawyers: { id: string; full_name: string; email: string }[];
  onUpdated?: () => void;
}

const LEGAL_STATUSES: LegalStatus[] = [
  'intake', 'pre_litigation', 'letter_before_claim', 'court_filed',
  'in_discovery', 'hearing_scheduled', 'judgment', 'settled', 'closed', 'withdrawn',
];

const STATUS_LABELS: Record<LegalStatus, string> = {
  intake: 'Intake',
  pre_litigation: 'Pre-litigation',
  letter_before_claim: 'Letter Before Claim',
  court_filed: 'Court Filed',
  in_discovery: 'In Discovery',
  hearing_scheduled: 'Hearing Scheduled',
  judgment: 'Judgment',
  settled: 'Settled',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
};

// A simple next-action hint derived from the current legal stage.
const NEXT_ACTION_HINT: Record<LegalStatus, string> = {
  intake: 'Review case file and confirm eligibility for legal action',
  pre_litigation: 'Prepare pre-litigation strategy',
  letter_before_claim: 'Draft and send Letter Before Claim',
  court_filed: 'Monitor court filing and await case number',
  in_discovery: 'Exchange evidence with opposing counsel',
  hearing_scheduled: 'Prepare hearing bundle and exhibits',
  judgment: 'Review judgment and advise client',
  settled: 'Confirm settlement terms and process payout',
  closed: 'Case closed — archive file',
  withdrawn: 'Document withdrawal reason',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ClaimFile { id: string; file_name: string; file_type: string; created_at: string; note: string; }
interface Comm { id: string; direction: string; subject: string; from_address: string; created_at: string; }
interface AirlineEmail { id: string; direction: string; subject: string; from_name: string; created_at: string; }
interface AuditItem { id: string; created_at: string; action: string; user_email: string | null; new_values: Record<string, unknown> | null; }

export default function LegalCaseDetail({ claimId, isAdmin, lawyers, onUpdated }: Props) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [legalCase, setLegalCase] = useState<LegalCase | null>(null);
  const [files, setFiles] = useState<ClaimFile[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [airlineEmails, setAirlineEmails] = useState<AirlineEmail[]>([]);
  const [timeline, setTimeline] = useState<ClaimStatusHistory[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // edit state
  const [legalStatus, setLegalStatus] = useState<LegalStatus>('intake');
  const [lawyerId, setLawyerId] = useState<string>('');
  const [nextDeadline, setNextDeadline] = useState('');
  const [deadlines, setDeadlines] = useState<LegalDeadline[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: c }, { data: lc }] = await Promise.all([
        supabase.from('claims').select('*').eq('id', claimId).maybeSingle(),
        supabase.from('legal_cases').select('*').eq('claim_id', claimId).maybeSingle(),
      ]);
      setClaim(c as Claim | null);
      setLegalCase(lc as LegalCase | null);
      if (lc) {
        const lcData = lc as LegalCase;
        setLegalStatus(lcData.legal_status);
        setLawyerId(lcData.lawyer_id || '');
        setNextDeadline(lcData.next_deadline_date ? lcData.next_deadline_date.split('T')[0] : '');
        setDeadlines(Array.isArray(lcData.deadlines) ? (lcData.deadlines as LegalDeadline[]) : []);
        setNotes(lcData.notes || '');
      }

      const [f, cm, ae, tl] = await Promise.all([
        supabase.from('claim_files').select('id, file_name, file_type, created_at, note').eq('claim_id', claimId).order('created_at', { ascending: false }),
        supabase.from('claim_communications').select('id, direction, subject, from_address, created_at').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(20),
        supabase.from('airline_emails').select('id, direction, subject, from_name, created_at').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(20),
        supabase.from('claim_status_history').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }),
      ]);
      setFiles((f.data || []) as ClaimFile[]);
      setComms((cm.data || []) as Comm[]);
      setAirlineEmails((ae.data || []) as AirlineEmail[]);
      setTimeline((tl.data || []) as ClaimStatusHistory[]);

      // Escalation / legal audit history — admin only (RLS restricts audit_log)
      if (isAdmin) {
        const { data: auditData } = await supabase
          .from('audit_log')
          .select('id, created_at, action, user_email, new_values')
          .or(`and(entity_type.eq.legal_case),and(entity_type.eq.claim,action.in.(claim.escalated,claim.lawyer_assigned,claim.legal_case_linked,claim.compensation_approved))`)
          .order('created_at', { ascending: false })
          .limit(50);
        setAudit((auditData || []) as AuditItem[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load legal case');
    } finally {
      setLoading(false);
    }
  }, [claimId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!legalCase) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateLegalCase(legalCase.id, {
        legalStatus,
        lawyerId: lawyerId || null,
        nextDeadlineDate: nextDeadline || null,
        deadlines,
        notes,
      });
      setSaveMsg({ kind: 'ok', text: 'Legal case updated.' });
      await load();
      onUpdated?.();
    } catch (e) {
      setSaveMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Update failed' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-5 text-[12px] text-[#94a3b8]">Loading legal case…</div>;
  if (error) return <div className="p-4 text-[12px] text-[#dc2626]">{error}</div>;
  if (!claim) return <div className="p-4 text-[12px] text-[#94a3b8]">Claim not found.</div>;

  const passenger = `${claim.passenger_first_name} ${claim.passenger_last_name}`.trim();

  return (
    <div className="space-y-4">
      {/* ── Case header ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Gavel className="w-4 h-4 text-[#0f2744]" />
          <span className="text-[13px] font-bold text-[#0f172a]">Legal Case — {claim.claim_ref}</span>
          {legalCase && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb]">{STATUS_LABELS[legalCase.legal_status]}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div><span className="text-[#64748b]">Passenger:</span> <span className="font-medium text-[#0f172a]">{passenger}</span></div>
          <div><span className="text-[#64748b]">Airline:</span> <span className="font-medium text-[#0f172a]">{claim.airline || '—'}</span></div>
          <div><span className="text-[#64748b]">Flight:</span> <span className="font-medium text-[#0f172a]">{claim.flight_number || '—'} · {claim.flight_date || '—'}</span></div>
          <div><span className="text-[#64748b]">Route:</span> <span className="font-medium text-[#0f172a]">{claim.departure}→{claim.arrival}</span></div>
          <div><span className="text-[#64748b]">Approved comp.:</span> <span className="font-medium text-[#0f172a]">{claim.approved_compensation_amount != null ? `€${Number(claim.approved_compensation_amount).toFixed(2)}` : '—'}</span></div>
          <div><span className="text-[#64748b]">Escalated:</span> <span className="font-medium text-[#0f172a]">{fmtDate(claim.escalated_at)}</span></div>
        </div>
        {claim.escalation_reason && (
          <div className="mt-2 text-[11px] text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded-[6px] px-2.5 py-1.5">
            <strong>Escalation reason:</strong> {claim.escalation_reason}
          </div>
        )}
      </div>

      {/* ── Legal status + deadlines + notes ─────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Legal Management</div>

        {!legalCase && <div className="text-[11px] text-[#94a3b8]">No legal case record. An admin must escalate this claim first.</div>}

        {legalCase && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="text-[10px] text-[#64748b] block">
                Legal status
                <select value={legalStatus} disabled={!isAdmin} onChange={e => setLegalStatus(e.target.value as LegalStatus)}
                  className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb] disabled:bg-[#f8fafc] disabled:text-[#0f172a]">
                  {LEGAL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </label>
              <label className="text-[10px] text-[#64748b] block">
                Assigned lawyer
                <select value={lawyerId} disabled={!isAdmin} onChange={e => setLawyerId(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb] disabled:bg-[#f8fafc] disabled:text-[#0f172a]">
                  <option value="">Unassigned</option>
                  {lawyers.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                </select>
              </label>
            </div>

            <div className="mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#64748b] mb-1"><Calendar className="w-3 h-3" /> Next deadline</div>
              <input type="date" value={nextDeadline} disabled={!isAdmin} onChange={e => setNextDeadline(e.target.value)}
                className="px-2 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb] disabled:bg-[#f8fafc] disabled:text-[#0f172a]" />
              <div className="mt-1.5 text-[10px] text-[#64748b]"><strong>Next action:</strong> {NEXT_ACTION_HINT[legalStatus]}</div>
            </div>

            {/* Important deadlines list */}
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#64748b] mb-1"><Calendar className="w-3 h-3" /> Important deadlines</div>
              {deadlines.length === 0 && <div className="text-[11px] text-[#94a3b8]">No deadlines recorded.</div>}
              {deadlines.map((d, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <input value={d.label} disabled={!isAdmin} onChange={e => setDeadlines(ds => ds.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Label" className="flex-1 px-2 py-1 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] disabled:bg-[#f8fafc]" />
                  <input type="date" value={d.date ? d.date.split('T')[0] : ''} disabled={!isAdmin} onChange={e => setDeadlines(ds => ds.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} className="px-2 py-1 border border-[#e2e8f0] rounded-[6px] text-[11px] outline-none focus:border-[#2563eb] disabled:bg-[#f8fafc]" />
                  {isAdmin && <button onClick={() => setDeadlines(ds => ds.filter((_, j) => j !== i))} className="text-[#dc2626] bg-transparent border-none cursor-pointer p-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
              {isAdmin && <button onClick={() => setDeadlines(ds => [...ds, { label: '', date: '' }])} className="flex items-center gap-1 text-[11px] text-[#2563eb] hover:underline cursor-pointer bg-transparent border-none p-0 mt-1"><Plus className="w-3 h-3" />Add deadline</button>}
            </div>

            {/* Legal notes */}
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#64748b] mb-1"><FileText className="w-3 h-3" /> Legal notes</div>
              <textarea value={notes} disabled={!isAdmin} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Legal notes, strategy, counsel instructions…"
                className="w-full px-2.5 py-2 border border-[#e2e8f0] rounded-[6px] text-[12px] outline-none focus:border-[#2563eb] resize-none disabled:bg-[#f8fafc] disabled:text-[#0f172a]" />
            </div>

            {isAdmin && (
              <>
                {saveMsg && <div className={`text-[11px] font-semibold rounded-[6px] px-2.5 py-1.5 mb-2 ${saveMsg.kind === 'ok' ? 'text-[#16a34a] bg-[#f0fdf4]' : 'text-[#dc2626] bg-[#fef2f2]'}`}>{saveMsg.text}</div>}
                <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f2744] text-white rounded-[6px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save legal case'}
                </button>
                {!isAdmin && <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#64748b]"><AlertCircle className="w-3 h-3" /> Read-only — contact an admin to update.</div>}
              </>
            )}
            {!isAdmin && <div className="flex items-center gap-1.5 text-[10px] text-[#64748b]"><AlertCircle className="w-3 h-3" /> Read-only — contact an admin to update legal status, deadlines, or notes.</div>}
          </>
        )}
      </div>

      {/* ── Linked documents / evidence ────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2"><FileText className="w-3 h-3" /> Linked Documents / Evidence</div>
        {files.length === 0 ? <div className="text-[11px] text-[#94a3b8]">No documents attached.</div> : (
          <ul className="space-y-1">
            {files.map(f => (
              <li key={f.id} className="flex items-center gap-2 text-[11px]">
                <FileText className="w-3 h-3 text-[#94a3b8] shrink-0" />
                <span className="font-medium text-[#0f172a] truncate">{f.file_name}</span>
                <span className="text-[#94a3b8] ml-auto">{fmtDate(f.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Communication ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2"><MessageSquare className="w-3 h-3" /> Customer Communication</div>
        {comms.length === 0 ? <div className="text-[11px] text-[#94a3b8]">No customer messages.</div> : (
          <ul className="space-y-1">
            {comms.map(c => (
              <li key={c.id} className="flex items-center gap-2 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.direction === 'outbound' ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>{c.direction === 'outbound' ? 'OUT' : 'IN'}</span>
                <span className="text-[#0f172a] truncate">{c.subject || '(no subject)'}</span>
                <span className="text-[#94a3b8] ml-auto">{fmtDate(c.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mt-3 mb-2"><Mail className="w-3 h-3" /> Airline Communication</div>
        {airlineEmails.length === 0 ? <div className="text-[11px] text-[#94a3b8]">No airline emails.</div> : (
          <ul className="space-y-1">
            {airlineEmails.map(a => (
              <li key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.direction === 'outbound' ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-[#fff7ed] text-[#ea580c]'}`}>{a.direction === 'outbound' ? 'OUT' : 'IN'}</span>
                <span className="text-[#0f172a] truncate">{a.subject || '(no subject)'}</span>
                <span className="text-[#94a3b8] ml-auto">{a.from_name || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Claim timeline ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2"><History className="w-3 h-3" /> Claim Timeline</div>
        {timeline.length === 0 ? <div className="text-[11px] text-[#94a3b8]">No timeline events.</div> : (
          <ul className="space-y-1.5">
            {timeline.slice(0, 20).map(t => (
              <li key={t.id} className="flex items-start gap-2 text-[11px]">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#f1f5f9] text-[#64748b] shrink-0">{t.field_name}</span>
                <span className="text-[#0f172a]">{t.to_status}</span>
                <span className="text-[#94a3b8] ml-auto whitespace-nowrap">{fmtDateTime(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Escalation history (admin: audit_log; lawyer: derived) ────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2"><Gavel className="w-3 h-3" /> Escalation History</div>
        {isAdmin ? (
          audit.length === 0 ? <div className="text-[11px] text-[#94a3b8]">No escalation events recorded.</div> : (
            <ul className="space-y-1.5">
              {audit.map(a => (
                <li key={a.id} className="flex items-start gap-2 text-[11px]">
                  <span className="text-[#0f172a] font-medium">{a.action.replace(/\./g, ' › ')}</span>
                  {a.user_email && <span className="text-[#94a3b8]">by {a.user_email}</span>}
                  <span className="text-[#94a3b8] ml-auto whitespace-nowrap">{fmtDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-1.5">
            {timeline.filter(t => ['status', 'assigned_to'].includes(t.field_name)).slice(0, 15).map(t => (
              <li key={t.id} className="flex items-start gap-2 text-[11px]">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#f1f5f9] text-[#64748b] shrink-0">{t.field_name}</span>
                <span className="text-[#0f172a]">{t.from_status || '—'} → {t.to_status}</span>
                <span className="text-[#94a3b8] ml-auto whitespace-nowrap">{fmtDateTime(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
