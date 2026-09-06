import { useState, useEffect, useRef } from 'react';
import { Claim, ClaimCommunication, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { Send, MessageSquare, Mail, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface Props {
  claim: Claim;
  user?: UserProfile | null;
}

export default function CustomerMessages({ claim, user }: Props) {
  const [communications, setCommunications] = useState<ClaimCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCommunications();
  }, [claim.id]);

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
      .eq('claim_id', claim.id)
      .order('created_at', { ascending: true });
    setCommunications((data as ClaimCommunication[]) || []);
    setLoading(false);

    // Mark outbound messages as read by customer
    const unread = (data || []).filter((c: ClaimCommunication) => c.direction === 'outbound' && !c.read_by_customer);
    if (unread.length > 0) {
      await supabase
        .from('claim_communications')
        .update({ read_by_customer: true })
        .in('id', unread.map(c => c.id));
    }
  }

  async function sendMessage() {
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('claim_communications').insert({
        claim_id: claim.id,
        direction: 'inbound',
        channel: 'portal',
        subject: `Message about ${claim.claim_ref}`,
        body: body.trim(),
        from_address: user?.email || claim.email,
        to_address: 'support@claimvelo.com',
        from_name: user?.full_name || `${claim.passenger_first_name} ${claim.passenger_last_name}`.trim(),
        from_user_id: user?.id,
        match_status: 'matched',
        language: claim.preferred_language || 'en',
      });
      if (insertErr) throw insertErr;
      setBody('');
      loadCommunications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
    setSending(false);
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[#2563eb]" />
        <div className="text-[13px] font-bold text-[#0f172a]">Messages</div>
        <div className="text-[11px] text-[#94a3b8]">— Send us a message about this claim</div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden">
        {/* Thread */}
        <div ref={scrollRef} className="h-[280px] overflow-y-auto px-4 py-3 bg-[#f8fafc]">
          {loading ? (
            <div className="text-center text-[12px] text-[#94a3b8] py-8">Loading messages...</div>
          ) : communications.length === 0 ? (
            <div className="text-center text-[12px] text-[#94a3b8] py-8">
              No messages yet. Send a message below and our team will respond.
            </div>
          ) : (
            <div className="space-y-3">
              {communications.map(comm => {
                const isOutbound = comm.direction === 'outbound';
                const isCustomer = !isOutbound; // inbound = from customer
                return (
                  <div key={comm.id} className={`flex gap-2 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isCustomer ? 'bg-[#2563eb]' : 'bg-white border border-[#e2e8f0]'
                    }`}>
                      {isCustomer ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-white" />
                      ) : (
                        comm.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-[#475569]" /> : <ArrowDownLeft className="w-3.5 h-3.5 text-[#475569]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 max-w-[80%]">
                      <div className={`px-3 py-2.5 rounded-[10px] ${
                        isCustomer
                          ? 'bg-[#2563eb] text-white'
                          : 'bg-white border border-[#e2e8f0]'
                      }`}>
                        {comm.channel === 'email' && !isCustomer && (
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-[#dbeafe] text-[#2563eb] px-1.5 py-0.5 rounded">Email</span>
                          </div>
                        )}
                        {comm.subject && !isCustomer && (
                          <div className="text-[12px] font-semibold mb-0.5">{comm.subject}</div>
                        )}
                        <div className="text-[12px] whitespace-pre-line">{comm.body}</div>
                        <div className={`text-[10px] mt-1.5 ${isCustomer ? 'text-blue-100' : 'text-[#94a3b8]'}`}>
                          {formatTime(comm.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-3 py-2.5 border-t border-[#e2e8f0] bg-white">
          {error && <div className="text-[11px] text-[#dc2626] mb-1.5">{error}</div>}
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message to our team..."
              className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] resize-none min-h-[40px] max-h-[80px]"
              rows={2}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !body.trim()}
              className="flex items-center justify-center w-9 h-9 bg-[#2563eb] text-white rounded-lg border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
