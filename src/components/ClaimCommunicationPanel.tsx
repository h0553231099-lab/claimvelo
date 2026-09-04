import { useState, useEffect, useRef } from 'react';
import { ClaimCommunication, UserProfile } from '../types';
import { supabase, SEND_CUSTOMER_EMAIL_URL } from '../lib/supabase';
import { Mail, MessageSquare, Send, Clock, ArrowUpRight, ArrowDownLeft, AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  claimId: string;
  claimRef: string;
  claimEmail: string;
  passengerName: string;
  preferredLanguage: string;
  user?: UserProfile | null;
  onRefresh: () => void;
}

export default function ClaimCommunicationPanel({
  claimId, claimRef, claimEmail, passengerName, preferredLanguage, user, onRefresh,
}: Props) {
  const [communications, setCommunications] = useState<ClaimCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeMode, setComposeMode] = useState<'email' | 'portal' | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCommunications();
  }, [claimId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [communications]);

  async function loadCommunications() {
    setLoading(true);
    const { data } = await supabase
      .from('claim_communications')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });
    setCommunications((data as ClaimCommunication[]) || []);
    setLoading(false);

    // Mark inbound messages as read by staff
    const unread = (data || []).filter((c: ClaimCommunication) => c.direction === 'inbound' && !c.read_by_staff);
    if (unread.length > 0) {
      await supabase
        .from('claim_communications')
        .update({ read_by_staff: true })
        .in('id', unread.map(c => c.id));
    }
  }

  async function sendEmail() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_CUSTOMER_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          claim_id: claimId,
          subject: subject.trim(),
          body: body.trim(),
          language: preferredLanguage || 'en',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setSubject('');
      setBody('');
      setComposeMode(null);
      setSuccess('Email sent to customer.');
      loadCommunications();
      onRefresh();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
    setSending(false);
  }

  async function sendPortalReply() {
    if (!body.trim()) {
      setError('Message body is required.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('claim_communications').insert({
        claim_id: claimId,
        direction: 'outbound',
        channel: 'portal',
        subject: subject.trim() || `Re: ${claimRef}`,
        body: body.trim(),
        from_address: user?.email || '',
        to_address: claimEmail,
        from_name: user?.full_name || 'ClaimVelo Team',
        from_user_id: user?.id,
        match_status: 'manual',
        language: preferredLanguage || 'en',
      });
      if (insertErr) throw insertErr;
      setSubject('');
      setBody('');
      setComposeMode(null);
      loadCommunications();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
    setSending(false);
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Customer Communication
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setComposeMode('email'); setSubject(`Update on your claim ${claimRef}`); setError(''); setSuccess(''); }}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
            >
              <Mail className="w-3 h-3" /> Email
            </button>
            <button
              onClick={() => { setComposeMode('portal'); setSubject(''); setError(''); setSuccess(''); }}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#7c3aed] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#6d28d9]"
            >
              <MessageSquare className="w-3 h-3" /> Portal Reply
            </button>
          </div>
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          {claimEmail || 'No email on file'} · Lang: {preferredLanguage || 'en'}
        </div>
      </div>

      {/* Compose form */}
      {composeMode && (
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            {composeMode === 'email' ? <Mail className="w-3.5 h-3.5 text-[#2563eb]" /> : <MessageSquare className="w-3.5 h-3.5 text-[#7c3aed]" />}
            <span className="text-[12px] font-bold text-[#0f172a]">
              {composeMode === 'email' ? 'Send Email to Customer' : 'Reply via Portal Message'}
            </span>
          </div>
          {composeMode === 'email' && (
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] bg-white mb-2"
            />
          )}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={composeMode === 'email' ? 'Email body...' : 'Type your reply to the customer...'}
            className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] bg-white resize-none min-h-[100px]"
          />
          {error && <div className="text-[11px] text-[#dc2626] mt-1.5">{error}</div>}
          {success && <div className="text-[11px] text-[#16a34a] mt-1.5 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{success}</div>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={composeMode === 'email' ? sendEmail : sendPortalReply}
              disabled={sending}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              <Send className="w-3 h-3" /> {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => { setComposeMode(null); setSubject(''); setBody(''); setError(''); }}
              className="px-3 py-1.5 bg-white border border-[#e2e8f0] text-[#64748b] rounded-lg text-[11px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Communication thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="text-center text-[12px] text-[#94a3b8] py-8">Loading communications...</div>
        ) : communications.length === 0 ? (
          <div className="text-center text-[12px] text-[#94a3b8] py-8">
            No customer communications yet. Use the buttons above to send an email or portal message.
          </div>
        ) : (
          <div className="space-y-3">
            {communications.map(comm => {
              const isOutbound = comm.direction === 'outbound';
              return (
                <div key={comm.id} className={`flex gap-2 ${isOutbound ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isOutbound ? 'bg-[#2563eb]' : 'bg-[#f1f5f9] border border-[#e2e8f0]'
                  }`}>
                    {isOutbound ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <ArrowDownLeft className="w-3.5 h-3.5 text-[#475569]" />
                    )}
                  </div>
                  <div className={`flex-1 min-w-0 max-w-[85%]`}>
                    <div className={`px-3 py-2.5 rounded-[10px] ${
                      isOutbound
                        ? 'bg-[#eff6ff] border border-[#bfdbfe]'
                        : 'bg-white border border-[#e2e8f0]'
                    }`}>
                      {/* Header */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          comm.channel === 'email' ? 'bg-[#dbeafe] text-[#2563eb]' : 'bg-[#ede9fe] text-[#7c3aed]'
                        }`}>
                          {comm.channel === 'email' ? 'Email' : 'Portal'}
                        </span>
                        {comm.match_status === 'ambiguous' && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#d97706] bg-[#fef3c7] px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" /> Ambiguous
                          </span>
                        )}
                        {comm.match_status === 'unmatched' && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#dc2626] bg-[#fef2f2] px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" /> Unmatched
                          </span>
                        )}
                      </div>
                      {/* Subject */}
                      {comm.subject && (
                        <div className="text-[12px] font-semibold text-[#0f172a] mb-0.5">{comm.subject}</div>
                      )}
                      {/* Body */}
                      <div className="text-[12px] text-[#334155] whitespace-pre-line">{comm.body}</div>
                      {/* Meta */}
                      <div className="text-[10px] text-[#94a3b8] mt-1.5 flex items-center gap-1.5">
                        <span>{isOutbound ? comm.from_name : comm.from_name || comm.from_address}</span>
                        <span className="text-[#cbd5e1]">·</span>
                        <span>{formatTime(comm.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
