import { useState, useEffect, useCallback } from 'react';
import { supabase, GMAIL_SYNC_URL, GMAIL_SEND_URL } from '../lib/supabase';
import { AirlineEmail, AirlineEmailAttachment, MatchConfidence, EmailStatus, UserProfile } from '../types';
import {
  Inbox, Mail, Send, Search, Paperclip, X, Reply, AlertTriangle,
  ArrowDownLeft, ArrowUpRight, Link2, RefreshCw,
} from 'lucide-react';

interface Props {
  currentUser?: UserProfile;
  claims: { id: string; claim_ref: string; passenger_first_name: string; passenger_last_name: string; airline: string; flight_number: string; flight_date?: string }[];
  onOpenClaim?: (claimId: string) => void;
}

const CONFIDENCE_STYLES: Record<MatchConfidence, { bg: string; text: string; label: string }> = {
  HIGH:      { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', label: 'HIGH' },
  MEDIUM:    { bg: 'bg-[#dbeafe]', text: 'text-[#2563eb]', label: 'MEDIUM' },
  LOW:       { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', label: 'LOW' },
  AMBIGUOUS: { bg: 'bg-[#f3e8ff]', text: 'text-[#7c3aed]', label: 'AMBIGUOUS' },
  NONE:      { bg: 'bg-[#f1f5f9]', text: 'text-[#94a3b8]', label: 'NONE' },
};

const STATUS_STYLES: Record<EmailStatus, { bg: string; text: string }> = {
  NEW:         { bg: 'bg-[#eff6ff]', text: 'text-[#2563eb]' },
  SEEN:        { bg: 'bg-[#f1f5f9]', text: 'text-[#64748b]' },
  IN_PROGRESS: { bg: 'bg-[#ecfeff]', text: 'text-[#0891b2]' },
  WAITING:     { bg: 'bg-[#fffbeb]', text: 'text-[#d97706]' },
  RESOLVED:    { bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]' },
  ESCALATED:   { bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]' },
};

const ALL_STATUSES: EmailStatus[] = ['NEW', 'SEEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'ESCALATED'];
const ALL_CONFIDENCES: MatchConfidence[] = ['HIGH', 'MEDIUM', 'LOW', 'AMBIGUOUS', 'NONE'];

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function looksLikeHtml(str: string): boolean {
  return /(<[a-zA-Z][^>]*>)/i.test(str);
}

function EmailIframe({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      srcDoc={html}
      className="w-full border-none block"
      style={{ minHeight: 420 }}
      sandbox="allow-same-origin allow-popups"
      title={title}
      onLoad={(e) => {
        const iframe = e.currentTarget;
        try {
          const h = iframe.contentDocument?.documentElement?.scrollHeight;
          if (h && h > 0) iframe.style.height = h + 'px';
        } catch { /* cross-origin guard */ }
      }}
    />
  );
}

export default function AirlineEmailInbox({ currentUser, claims, onOpenClaim }: Props) {
  const [emails, setEmails] = useState<AirlineEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AirlineEmail | null>(null);
  const [attachments, setAttachments] = useState<AirlineEmailAttachment[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('');
  const [confidenceFilter, setConfidenceFilter] = useState<MatchConfidence | ''>('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  // Compose/reply
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Manual claim linking
  const [linkingClaim, setLinkingClaim] = useState(false);
  const [linkClaimId, setLinkClaimId] = useState('');

  const loadEmails = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('airline_emails')
      .select('*')
      .order('received_at', { ascending: false, nullsFirst: false });
    if (data) setEmails(data as AirlineEmail[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  useEffect(() => {
    if (!selected) { setAttachments([]); return; }
    supabase
      .from('airline_email_attachments')
      .select('*')
      .eq('email_id', selected.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAttachments(data as AirlineEmailAttachment[]);
      });
  }, [selected]);

  async function triggerSync() {
    setSyncing(true);
    setSyncResult('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(GMAIL_SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.ok) {
        setSyncResult(`Synced ${result.synced ?? 0} new email(s) (${result.mode})`);
        await loadEmails();
      } else {
        setSyncResult(`Sync error: ${result.error || 'unknown'}`);
      }
    } catch (e) {
      setSyncResult(`Sync failed: ${String(e)}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(''), 5000);
  }

  async function updateStatus(email: AirlineEmail, status: EmailStatus) {
    await supabase.from('airline_emails').update({ email_status: status }).eq('id', email.id);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, email_status: status } : e));
    if (selected?.id === email.id) setSelected({ ...email, email_status: status });
  }

  async function updateField(email: AirlineEmail, field: string, value: string) {
    await supabase.from('airline_emails').update({ [field]: value || null }).eq('id', email.id);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, [field]: value } : e));
    if (selected?.id === email.id) setSelected({ ...email, [field]: value });
  }

  async function linkClaim(email: AirlineEmail, claimId: string) {
    if (!claimId) return;
    const claim = claims.find(c => c.id === claimId);
    await supabase.from('airline_emails').update({
      claim_id: claimId,
      matching_confidence: 'HIGH',
      matched_fields: { manual: claim?.claim_ref || '' },
    }).eq('id', email.id);
    // Record timeline event
    await supabase.from('claim_status_history').insert({
      claim_id: claimId,
      field_name: 'airline_email',
      to_status: `${email.direction}:${email.subject}`,
      source: 'staff',
      changed_by: currentUser?.id,
      reason: `Manually linked by staff`,
    });
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, claim_id: claimId, matching_confidence: 'HIGH' } : e));
    if (selected?.id === email.id) setSelected({ ...email, claim_id: claimId, matching_confidence: 'HIGH' });
    setLinkingClaim(false);
    setLinkClaimId('');
  }

  function openReply(email: AirlineEmail) {
    setComposing(true);
    setSelected(null);
    setDraft({
      to: email.from_address,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `\n\n--- Original message ---\nFrom: ${email.from_address}\nSubject: ${email.subject}\n\n${email.body_text.substring(0, 500)}`,
    });
    setSendError('');
  }

  async function sendEmail() {
    if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          to: draft.to.trim(),
          subject: draft.subject.trim(),
          body: draft.body.trim(),
          claim_id: selected?.claim_id || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed to send');
      setComposing(false);
      setDraft({ to: '', subject: '', body: '' });
      await loadEmails();
    } catch (e) {
      setSendError(String(e));
    }
    setSending(false);
  }

  // ── Filtering ────────────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filtered = emails.filter(e => {
    if (directionFilter !== 'all' && e.direction !== directionFilter) return false;
    if (statusFilter && e.email_status !== statusFilter) return false;
    if (confidenceFilter && e.matching_confidence !== confidenceFilter) return false;
    if (showUnmatchedOnly && e.claim_id) return false;
    if (q && ![e.subject, e.from_address, e.to_address, e.snippet, e.from_name].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  const unmatchedCount = emails.filter(e => !e.claim_id && e.direction === 'inbound').length;
  const newCount = emails.filter(e => e.email_status === 'NEW').length;

  const matchedClaim = selected?.claim_id ? claims.find(c => c.id === selected.claim_id) : null;

  return (
    <div className="flex h-full bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
      {/* Left pane — email list */}
      <div className={`flex flex-col border-r border-[#e2e8f0] transition-all ${selected || composing ? 'w-[340px] shrink-0' : 'flex-1'}`}>

        {/* Header */}
        <div className="px-3 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-[#2563eb]" />
              <span className="text-[13px] font-bold text-[#0f172a]">Airline Emails</span>
              {newCount > 0 && <span className="bg-[#2563eb] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{newCount}</span>}
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#2563eb] text-white rounded-lg text-[10px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
          {syncResult && <div className="text-[10px] text-[#64748b] mb-1.5">{syncResult}</div>}
          {unmatchedCount > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#ea580c] font-medium">
              <AlertTriangle className="w-3 h-3" />
              {unmatchedCount} unmatched email{unmatchedCount !== 1 ? 's' : ''} in queue
            </div>
          )}
        </div>

        {/* Search + filters */}
        <div className="px-3 py-2 border-b border-[#e2e8f0] space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94a3b8]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-7 pr-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs outline-none focus:border-[#2563eb]"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value as any)}
              className="text-[10px] border border-[#e2e8f0] rounded-md px-1.5 py-1 bg-white outline-none cursor-pointer"
            >
              <option value="all">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as EmailStatus | '')}
              className="text-[10px] border border-[#e2e8f0] rounded-md px-1.5 py-1 bg-white outline-none cursor-pointer"
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value as MatchConfidence | '')}
              className="text-[10px] border border-[#e2e8f0] rounded-md px-1.5 py-1 bg-white outline-none cursor-pointer"
            >
              <option value="">All confidence</option>
              {ALL_CONFIDENCES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setShowUnmatchedOnly(!showUnmatchedOnly)}
              className={`text-[10px] px-2 py-1 rounded-md border cursor-pointer ${showUnmatchedOnly ? 'bg-[#fff7ed] border-[#fed7aa] text-[#ea580c] font-semibold' : 'border-[#e2e8f0] text-[#64748b] bg-white'}`}
            >
              Unmatched only
            </button>
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f1f5f9]">
          {loading ? (
            <div className="p-6 text-center text-[#94a3b8] text-[12px]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Inbox className="w-8 h-8 text-[#e2e8f0] mx-auto mb-2" />
              <div className="text-[12px] text-[#94a3b8]">No airline emails found.</div>
              <div className="mt-1 text-[11px] text-[#64748b]">Click "Sync Now" to pull emails from Gmail.</div>
            </div>
          ) : filtered.map(e => {
            const conf = CONFIDENCE_STYLES[e.matching_confidence];
            const st = STATUS_STYLES[e.email_status];
            const isInbound = e.direction === 'inbound';
            const dateStr = isInbound ? e.received_at : e.sent_at;
            return (
              <div
                key={e.id}
                onClick={() => { setSelected(e); if (e.email_status === 'NEW') updateStatus(e, 'SEEN'); }}
                className={`flex items-start gap-2.5 px-3 py-3 cursor-pointer transition-colors hover:bg-[#f8fafc] ${selected?.id === e.id ? 'bg-[#eff6ff]' : ''} ${e.email_status === 'NEW' ? 'bg-[#fafbff]' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isInbound ? 'bg-[#dbeafe]' : 'bg-[#d1fae5]'}`}>
                  {isInbound ? <ArrowDownLeft className="w-3.5 h-3.5 text-[#2563eb]" /> : <ArrowUpRight className="w-3.5 h-3.5 text-[#059669]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-[12px] truncate ${e.email_status === 'NEW' ? 'font-bold text-[#0f172a]' : 'font-medium text-[#374151]'}`}>
                      {isInbound ? (e.from_name || e.from_address) : `To: ${e.to_address}`}
                    </span>
                    <span className="text-[10px] text-[#94a3b8] shrink-0">{timeAgo(dateStr)}</span>
                  </div>
                  <div className={`text-[11px] truncate mb-1 ${e.email_status === 'NEW' ? 'font-semibold text-[#1e293b]' : 'text-[#475569]'}`}>{e.subject || '(no subject)'}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>{e.email_status}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>{conf.label}</span>
                    {e.has_attachments && <Paperclip className="w-3 h-3 text-[#64748b]" />}
                    {e.claim_id && <Link2 className="w-3 h-3 text-[#16a34a]" />}
                  </div>
                </div>
                {e.email_status === 'NEW' && <div className="w-2 h-2 rounded-full bg-[#2563eb] shrink-0 mt-1.5" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right pane — email detail */}
      {selected && !composing && (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-start justify-between gap-3">
            <div className="font-bold text-[14px] text-[#0f172a] leading-snug flex-1">{selected.subject || '(no subject)'}</div>
            <button onClick={() => setSelected(null)} className="shrink-0 bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b] p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sender / recipient info */}
          <div className="px-5 py-3 border-b border-[#f1f5f9] flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${selected.direction === 'inbound' ? 'bg-[#dbeafe] text-[#2563eb]' : 'bg-[#d1fae5] text-[#059669]'}`}>
              {selected.direction === 'inbound' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-semibold text-[12px] text-[#0f172a]">
                {selected.direction === 'inbound' ? `From: ${selected.from_name || selected.from_address}` : `To: ${selected.to_address}`}
              </div>
              <div className="text-[10px] text-[#94a3b8]">{selected.direction === 'inbound' ? selected.from_address : selected.to_address}</div>
              {selected.cc_address && <div className="text-[10px] text-[#94a3b8]">Cc: {selected.cc_address}</div>}
              <div className="text-[10px] text-[#94a3b8]">{timeAgo(selected.direction === 'inbound' ? selected.received_at : selected.sent_at)}</div>
            </div>
          </div>

          {/* Matching + workflow bar */}
          <div className="px-5 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc] space-y-2">
            {/* Matching */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Match:</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${CONFIDENCE_STYLES[selected.matching_confidence].bg} ${CONFIDENCE_STYLES[selected.matching_confidence].text}`}>
                {selected.matching_confidence}
              </span>
              {matchedClaim ? (
                <button
                  onClick={() => onOpenClaim?.(matchedClaim.id)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  <Link2 className="w-3 h-3" />
                  {matchedClaim.claim_ref} — {matchedClaim.passenger_first_name} {matchedClaim.passenger_last_name}
                </button>
              ) : selected.matched_claim_refs.length > 0 ? (
                <span className="text-[11px] text-[#7c3aed] font-medium">
                  Ambiguous: {selected.matched_claim_refs.join(', ')}
                </span>
              ) : (
                <span className="text-[11px] text-[#94a3b8]">No claim matched</span>
              )}
              {Object.keys(selected.matched_fields).length > 0 && (
                <span className="text-[10px] text-[#64748b]">
                  ({Object.entries(selected.matched_fields).map(([k, v]) => `${k}: ${v}`).join(', ')})
                </span>
              )}
            </div>

            {/* Manual link */}
            {linkingClaim ? (
              <div className="flex items-center gap-2">
                <select
                  value={linkClaimId}
                  onChange={e => setLinkClaimId(e.target.value)}
                  className="text-[11px] border border-[#e2e8f0] rounded-md px-2 py-1 bg-white outline-none flex-1"
                >
                  <option value="">Select claim...</option>
                  {claims.map(c => (
                    <option key={c.id} value={c.id}>{c.claim_ref} — {c.passenger_first_name} {c.passenger_last_name} ({c.airline})</option>
                  ))}
                </select>
                <button onClick={() => linkClaimId && linkClaim(selected, linkClaimId)} className="text-[10px] px-2 py-1 bg-[#16a34a] text-white rounded-md border-none cursor-pointer font-semibold">Link</button>
                <button onClick={() => setLinkingClaim(false)} className="text-[10px] px-2 py-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-md cursor-pointer">Cancel</button>
              </div>
            ) : (
              !selected.claim_id && (
                <button
                  onClick={() => setLinkingClaim(true)}
                  className="flex items-center gap-1 text-[10px] text-[#2563eb] font-semibold bg-transparent border-none cursor-pointer hover:underline p-0"
                >
                  <Link2 className="w-3 h-3" /> Link to claim manually
                </button>
              )
            )}

            {/* Status + assignment + next action */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selected.email_status}
                onChange={e => updateStatus(selected, e.target.value as EmailStatus)}
                className="text-[10px] border border-[#e2e8f0] rounded-md px-1.5 py-1 bg-white outline-none cursor-pointer font-semibold"
              >
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                value={selected.next_action || ''}
                onChange={e => updateField(selected, 'next_action', e.target.value)}
                placeholder="Next action..."
                className="text-[10px] border border-[#e2e8f0] rounded-md px-2 py-1 bg-white outline-none flex-1 min-w-[120px]"
              />
              <input
                type="date"
                value={selected.due_at ? selected.due_at.split('T')[0] : ''}
                onChange={e => updateField(selected, 'due_at', e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="text-[10px] border border-[#e2e8f0] rounded-md px-1.5 py-1 bg-white outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {selected.body_html ? (
              <EmailIframe html={selected.body_html} title="Email content" />
            ) : selected.body_text ? (
              looksLikeHtml(selected.body_text) ? (
                <EmailIframe html={selected.body_text} title="Email content" />
              ) : (
                <div className="text-[13px] text-[#374151] whitespace-pre-line leading-relaxed px-5 py-4">{selected.body_text}</div>
              )
            ) : (
              <div className="px-5 py-4 text-[12px] text-[#94a3b8] italic">No message body available.</div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="px-5 py-3 border-t border-[#f1f5f9]">
                <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" /> Attachments ({attachments.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {attachments.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg">
                      <Paperclip className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
                      <span className="text-[12px] text-[#374151] font-medium truncate flex-1">{a.file_name}</span>
                      <span className="text-[10px] text-[#94a3b8] shrink-0">{(a.file_size / 1024).toFixed(0)} KB</span>
                      {a.claim_id && <Link2 className="w-3 h-3 text-[#16a34a] shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            {selected.direction === 'inbound' && (
              <button
                onClick={() => openReply(selected)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
              >
                <Reply className="w-3.5 h-3.5" /> Reply via Gmail
              </button>
            )}
            <button
              onClick={() => { setComposing(true); setSelected(null); setDraft({ to: '', subject: '', body: '' }); setSendError(''); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0]"
            >
              <Send className="w-3.5 h-3.5" /> Compose
            </button>
          </div>
        </div>
      )}

      {/* Compose pane */}
      {composing && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <span className="font-bold text-[13px] text-[#0f172a]">New Email (via Gmail)</span>
            <button onClick={() => { setComposing(false); }} className="bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-5 flex flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">From</label>
              <div className="px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[12px] text-[#64748b]">
                {currentUser?.full_name || 'ClaimVelo'} &lt;Gmail&gt;
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">To</label>
              <input
                value={draft.to}
                onChange={e => setDraft(d => ({ ...d, to: e.target.value }))}
                placeholder="recipient@example.com"
                type="email"
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Subject</label>
              <input
                value={draft.subject}
                onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
                placeholder="Enter subject..."
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Message</label>
              <textarea
                value={draft.body}
                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                placeholder="Write your message..."
                className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] resize-none font-sans min-h-[180px] bg-white whitespace-pre-wrap"
              />
            </div>
            {sendError && (
              <div className="bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[11px] rounded-lg px-3 py-2">{sendError}</div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            <button
              onClick={sendEmail}
              disabled={sending || !draft.to || !draft.subject || !draft.body}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Sending...' : 'Send via Gmail'}
            </button>
            <button
              onClick={() => { setComposing(false); }}
              className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {!selected && !composing && <div className="hidden" />}
    </div>
  );
}
