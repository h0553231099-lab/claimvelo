import { useState } from 'react';
import { InfoRequest, UserProfile } from '../types';
import { supabase, SEND_STAFF_EMAIL_URL } from '../lib/supabase';
import { PlusCircle, Mail, Clock, CheckCircle, AlertTriangle, X, Send } from 'lucide-react';

interface Props {
  claimId: string;
  claimRef: string;
  claimEmail: string;
  passengerName: string;
  user?: UserProfile;
  requests: InfoRequest[];
  loading: boolean;
  onRefresh: () => void;
}

const STATUS_META: Record<string, { icon: typeof Clock; bg: string; text: string; label: string }> = {
  requested: { icon: Clock, bg: 'bg-[#eff6ff]', text: 'text-[#2563eb]', label: 'Requested' },
  received:  { icon: CheckCircle, bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]', label: 'Received' },
  overdue:   { icon: AlertTriangle, bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]', label: 'Overdue' },
  cancelled: { icon: X, bg: 'bg-[#f8fafc]', text: 'text-[#64748b]', label: 'Cancelled' },
};

const REQUEST_TYPES = [
  { value: 'document', label: 'Document Upload' },
  { value: 'information', label: 'Information Request' },
];

function timeUntil(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const hours = Math.floor(diff / 3600000);
  if (hours < 0) return `${Math.abs(hours)}h overdue`;
  if (hours < 24) return `${hours}h remaining`;
  const days = Math.floor(hours / 24);
  return `${days}d remaining`;
}

export default function InfoRequestPanel({
  claimId, claimRef, claimEmail, passengerName, user, requests, loading, onRefresh,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    request_type: 'document' as 'document' | 'information',
    title: '',
    description: '',
    dueDays: '3',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  async function createRequest() {
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    const dueDays = parseInt(form.dueDays) || 3;
    const dueAt = new Date(Date.now() + dueDays * 86400000).toISOString();
    const { error: insertErr } = await supabase.from('claim_info_requests').insert({
      claim_id: claimId,
      request_type: form.request_type,
      title: form.title.trim(),
      description: form.description.trim(),
      status: 'requested',
      requested_by: user?.id,
      requested_at: new Date().toISOString(),
      due_at: dueAt,
    });
    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }
    setForm({ request_type: 'document', title: '', description: '', dueDays: '3' });
    setShowForm(false);
    onRefresh();
    setSaving(false);
  }

  async function sendRequestEmail(req: InfoRequest) {
    setSendingEmail(req.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_STAFF_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          to: claimEmail,
          subject: `Action Required: ${req.title} — Claim ${claimRef}`,
          body: buildRequestEmailBody(req, passengerName, claimRef),
          fromName: user?.full_name || 'ClaimVelo Team',
          fromAddress: user?.claimvelo_email || 'support@claimvelo.com',
        }),
      });
      if (res.ok) {
        // Update reminder_sent_at
        await supabase.from('claim_info_requests').update({ reminder_sent_at: new Date().toISOString() }).eq('id', req.id);
        onRefresh();
      }
    } catch {
      // Non-blocking
    }
    setSendingEmail(null);
  }

  async function cancelRequest(reqId: string) {
    await supabase.from('claim_info_requests').update({ status: 'cancelled' }).eq('id', reqId);
    onRefresh();
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
          Information & Document Requests
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
        >
          <PlusCircle className="w-3 h-3" /> New Request
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="mb-4 p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[10px]">
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              {REQUEST_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setForm(f => ({ ...f, request_type: t.value as 'document' | 'information' }))}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                    form.request_type === t.value
                      ? 'bg-[#2563eb] text-white border-[#2563eb]'
                      : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#2563eb]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={form.request_type === 'document' ? 'e.g., Boarding Pass' : 'e.g., Flight booking reference number'}
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] bg-white"
            />
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what's needed and why..."
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] resize-none bg-white min-h-[60px]"
            />
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Due in</label>
              <select
                value={form.dueDays}
                onChange={e => setForm(f => ({ ...f, dueDays: e.target.value }))}
                className="px-2 py-1 border border-[#e2e8f0] rounded-lg text-[11px] outline-none focus:border-[#2563eb] bg-white"
              >
                <option value="1">1 day</option>
                <option value="2">2 days</option>
                <option value="3">3 days</option>
                <option value="5">5 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
              </select>
            </div>
            {error && <div className="text-[11px] text-[#dc2626]">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={createRequest}
                disabled={saving}
                className="px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {saving ? 'Creating...' : 'Create Request'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(''); }}
                className="px-3 py-1.5 bg-white border border-[#e2e8f0] text-[#64748b] rounded-lg text-[11px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request list */}
      {loading ? (
        <div className="text-center py-6 text-[#94a3b8] text-[12px]">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-6 text-[#94a3b8] text-[12px]">
          No information requests for this claim yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map(req => {
            const meta = STATUS_META[req.status] || STATUS_META.requested;
            const StatusIcon = meta.icon;
            const isOverdue = req.status === 'requested' && req.due_at && new Date(req.due_at).getTime() < Date.now();
            const displayStatus = isOverdue ? 'overdue' : req.status;
            const displayMeta = STATUS_META[displayStatus] || STATUS_META.requested;
            const DisplayIcon = displayMeta.icon;

            return (
              <div key={req.id} className="p-3 bg-white border border-[#e2e8f0] rounded-[10px]">
                <div className="flex items-start gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${displayMeta.bg}`}>
                    <DisplayIcon className={`w-3.5 h-3.5 ${displayMeta.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-semibold text-[#0f172a] truncate">{req.title}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${displayMeta.bg} ${displayMeta.text}`}>
                        {displayMeta.label}
                      </span>
                      <span className="text-[9px] text-[#94a3b8] uppercase font-semibold bg-[#f1f5f9] px-1.5 py-0.5 rounded">
                        {req.request_type}
                      </span>
                    </div>
                    {req.description && (
                      <div className="text-[11px] text-[#64748b] mb-1">{req.description}</div>
                    )}
                    <div className="text-[10px] text-[#94a3b8] flex items-center gap-2 flex-wrap">
                      <span>Requested {new Date(req.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      {req.due_at && req.status === 'requested' && (
                        <>
                          <span className="text-[#cbd5e1]">·</span>
                          <span className={isOverdue ? 'text-[#dc2626] font-semibold' : ''}>{timeUntil(req.due_at)}</span>
                        </>
                      )}
                      {req.fulfilled_at && (
                        <>
                          <span className="text-[#cbd5e1]">·</span>
                          <span className="text-[#16a34a]">Fulfilled {new Date(req.fulfilled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </>
                      )}
                      {req.reminder_sent_at && (
                        <>
                          <span className="text-[#cbd5e1]">·</span>
                          <span>Reminder sent</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                {req.status === 'requested' && (
                  <div className="flex gap-1.5 mt-2 ml-9">
                    <button
                      onClick={() => sendRequestEmail(req)}
                      disabled={sendingEmail === req.id}
                      className="flex items-center gap-1 px-2 py-1 bg-[#eff6ff] text-[#2563eb] rounded-lg text-[10px] font-semibold border border-[#dbeafe] cursor-pointer hover:bg-[#dbeafe] disabled:opacity-60"
                    >
                      <Send className="w-2.5 h-2.5" />
                      {sendingEmail === req.id ? 'Sending...' : isOverdue ? 'Send Reminder' : 'Send Email'}
                    </button>
                    <button
                      onClick={() => cancelRequest(req.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-[#f8fafc] text-[#64748b] rounded-lg text-[10px] font-semibold border border-[#e2e8f0] cursor-pointer hover:bg-[#f1f5f9]"
                    >
                      <X className="w-2.5 h-2.5" /> Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildRequestEmailBody(req: InfoRequest, passengerName: string, claimRef: string): string {
  const dueDate = req.due_at
    ? new Date(req.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'soon';

  return `Hi ${passengerName},

We need additional ${req.request_type === 'document' ? 'documents' : 'information'} to proceed with your claim ${claimRef}.

Request: ${req.title}
${req.description ? `\n${req.description}\n` : ''}
Please provide this ${req.request_type === 'document' ? 'document' : 'information'} by ${dueDate}.

You can upload documents or respond by logging into your ClaimVelo dashboard and viewing your claim details.

If you have any questions, please don't hesitate to contact us at support@claimvelo.com.

Best regards,
ClaimVelo Team`;
}
