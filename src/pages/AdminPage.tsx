import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Claim, ClaimStatus, AdminView, UserProfile } from '../types';
import { supabase, sendClaimEmail, insertNotification, SEND_STAFF_EMAIL_URL } from '../lib/supabase';
import { Page } from '../types';
import { Inbox, Reply, Trash2, Search, FileText, X, Upload, Paperclip, UserPlus, Trash, TrendingUp, TrendingDown, PlusCircle, DollarSign, ArrowUpRight, ArrowDownRight, Mail, Send, Pencil } from 'lucide-react';

interface FinanceTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  claim_ref: string | null;
  created_at: string;
}

const INCOME_CATEGORIES = ['Commission', 'Bonus Fee', 'Late Payment Interest', 'Referral', 'Other Income'];
const EXPENSE_CATEGORIES = ['Legal Fees', 'Payroll', 'Software', 'Office & Admin', 'Marketing', 'Court Costs', 'Banking', 'Other Expense'];

interface WorkerProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  agent_code: string;
  created_at: string;
}

interface ClaimFile {
  id: string;
  claim_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  note: string;
  created_at: string;
}

interface Props { onNav: (p: Page) => void; user?: UserProfile; onSignOut?: () => void; }

const STAGES: ClaimStatus[] = ['Untouched','In Progress','Submitted','Waiting','Resolved','Escalated'];
const SB: Record<string, string> = {
  'Untouched':'bg-[#f8fafc] text-[#64748b]',
  'In Progress':'bg-[#eff6ff] text-[#2563eb]',
  'Submitted':'bg-[#ecfeff] text-[#0891b2]',
  'Waiting':'bg-[#fffbeb] text-[#d97706]',
  'Resolved':'bg-[#f0fdf4] text-[#16a34a]',
  'Escalated':'bg-[#fef2f2] text-[#dc2626]',
};
const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

function Badge({ status }: { status: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold ${SB[status] || 'bg-[#f8fafc] text-[#64748b]'}`}>{status}</span>;
}

const AV_TITLES: Record<AdminView, string> = {
  dash:'Dashboard', claims:'All Claims', crm:'CRM Kanban',
  inbox:'Inbox', notifs:'Notifications', analytics:'Analytics',
  automation:'Automation', users:'Users & Roles', settings:'Settings',
  finance:'Income & Expenses', qr:'Agent QR Codes',
};

interface DbNotification {
  id: string;
  type: string;
  claim_ref: string;
  claim_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

interface InternalMessage {
  id: string;
  subject: string;
  body: string;
  from_user_id: string | null;
  from_name: string;
  to_user_id: string | null;
  claim_id: string | null;
  parent_id: string | null;
  read_by: string[];
  created_at: string;
}

interface StaffEmail {
  id: string;
  to_address: string;
  to_user_id: string | null;
  from_address: string;
  from_name: string;
  subject: string;
  body_text: string;
  body_html: string;
  read_by: string[];
  received_at: string;
  raw_payload?: { data?: { attachments?: { filename: string; content_type: string }[] } };
}

function timeAgo(iso: string) {
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

function InternalInbox({ currentUser }: { currentUser?: UserProfile }) {
  const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const [tab, setTab] = useState<'inbox' | 'support' | 'staff'>(isAdminUser ? 'support' : 'inbox');

  // @claimvelo.com emails
  const [emails, setEmails] = useState<StaffEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<StaffEmail | null>(null);

  // Internal staff messages
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState<InternalMessage | null>(null);
  const [replyTo, setReplyTo] = useState<InternalMessage | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [sending, setSending] = useState(false);

  // Email compose/reply state
  const [emailComposing, setEmailComposing] = useState(false);
  const [emailReplyTo, setEmailReplyTo] = useState<StaffEmail | null>(null);
  const [emailDraft, setEmailDraft] = useState({ to: '', subject: '', body: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailSendError, setEmailSendError] = useState('');

  const [search, setSearch] = useState('');

  useEffect(() => { loadEmails(); loadMessages(); }, []);

  async function loadEmails() {
    setEmailsLoading(true);
    const { data } = await supabase
      .from('staff_emails')
      .select('*')
      .order('received_at', { ascending: false });
    if (data) setEmails(data as StaffEmail[]);
    setEmailsLoading(false);
  }

  async function loadMessages() {
    setMsgsLoading(true);
    const { data } = await supabase
      .from('internal_messages')
      .select('*')
      .is('parent_id', null)
      .order('created_at', { ascending: false });
    if (data) setMessages(data as InternalMessage[]);
    setMsgsLoading(false);
  }

  async function markEmailRead(email: StaffEmail) {
    if (!currentUser?.id || email.read_by.includes(currentUser.id)) return;
    const newReadBy = [...email.read_by, currentUser.id];
    await supabase.from('staff_emails').update({ read_by: newReadBy }).eq('id', email.id);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read_by: newReadBy } : e));
    if (selectedEmail?.id === email.id) setSelectedEmail({ ...email, read_by: newReadBy });
  }

  async function markMsgRead(msg: InternalMessage) {
    if (!currentUser?.id || msg.read_by.includes(currentUser.id)) return;
    const newReadBy = [...msg.read_by, currentUser.id];
    await supabase.from('internal_messages').update({ read_by: newReadBy }).eq('id', msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_by: newReadBy } : m));
    if (selectedMsg?.id === msg.id) setSelectedMsg({ ...msg, read_by: newReadBy });
  }

  async function deleteEmail(id: string) {
    await supabase.from('staff_emails').delete().eq('id', id);
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedEmail?.id === id) setSelectedEmail(null);
  }

  async function sendMessage() {
    if (!draft.subject.trim() || !draft.body.trim()) return;
    setSending(true);
    await supabase.from('internal_messages').insert({
      subject: replyTo ? `Re: ${replyTo.subject}` : draft.subject.trim(),
      body: draft.body.trim(),
      from_user_id: currentUser?.id,
      from_name: currentUser?.full_name || currentUser?.email || 'Unknown',
      to_user_id: null,
      parent_id: replyTo?.id || null,
      read_by: currentUser?.id ? [currentUser.id] : [],
    });
    await loadMessages();
    setSending(false);
    setComposing(false);
    setReplyTo(null);
    setDraft({ subject: '', body: '' });
  }

  async function deleteMessage(id: string) {
    await supabase.from('internal_messages').delete().eq('id', id);
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selectedMsg?.id === id) setSelectedMsg(null);
  }

  function openReplyEmail(email: StaffEmail) {
    setEmailReplyTo(email);
    setEmailComposing(true);
    setSelectedEmail(null);
    setEmailDraft({
      to: email.from_address,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `\n\n--- Original message ---\nFrom: ${email.from_name} <${email.from_address}>\n${email.body_text}`,
    });
    setEmailSendError('');
  }

  function openComposeEmail() {
    setEmailReplyTo(null);
    setEmailComposing(true);
    setSelectedEmail(null);
    setEmailDraft({ to: '', subject: '', body: '' });
    setEmailSendError('');
  }

  async function sendExternalEmail() {
    if (!emailDraft.to.trim() || !emailDraft.subject.trim() || !emailDraft.body.trim()) return;
    setEmailSending(true);
    setEmailSendError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_STAFF_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          to: emailDraft.to.trim(),
          subject: emailDraft.subject.trim(),
          body: emailDraft.body.trim(),
          fromName: currentUser?.full_name || 'ClaimVelo',
          fromAddress: currentUser?.claimvelo_email || 'support@claimvelo.com',
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed to send');
      setEmailComposing(false);
      setEmailReplyTo(null);
      setEmailDraft({ to: '', subject: '', body: '' });
    } catch (err) {
      setEmailSendError(String(err));
    }
    setEmailSending(false);
  }

  const q = search.toLowerCase();
  const myAddress = currentUser?.claimvelo_email || '';
  const isAdmin = isAdminUser;

  const personalEmails = emails.filter(e => e.to_address !== 'support@claimvelo.com');
  const supportEmails = emails.filter(e => e.to_address === 'support@claimvelo.com');

  const activeEmailList = tab === 'support' ? supportEmails : personalEmails;
  const filteredEmails = activeEmailList.filter(e =>
    !q || [e.subject, e.from_name, e.from_address, e.body_text].join(' ').toLowerCase().includes(q)
  );
  const filteredMsgs = messages.filter(m =>
    !q || [m.subject, m.body, m.from_name].join(' ').toLowerCase().includes(q)
  );

  const emailUnread = personalEmails.filter(e => !e.read_by.includes(currentUser?.id || '')).length;
  const supportUnread = supportEmails.filter(e => !e.read_by.includes(currentUser?.id || '')).length;
  const msgUnread = messages.filter(m => !m.read_by.includes(currentUser?.id || '')).length;

  const showDetailPane = (tab === 'inbox' || tab === 'support') ? (!!selectedEmail || emailComposing) : (!!selectedMsg || composing);

  return (
    <div className="flex h-full bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
      {/* Left pane */}
      <div className={`flex flex-col border-r border-[#e2e8f0] transition-all ${showDetailPane ? 'w-[300px] shrink-0' : 'flex-1'}`}>

        {/* Address banner */}
        {myAddress && (
          <div className="px-3 py-2 bg-[#eff6ff] border-b border-[#dbeafe] flex items-center gap-2">
            <Inbox className="w-3.5 h-3.5 text-[#2563eb] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-[#2563eb] uppercase tracking-wider">Your Email Address</div>
              <div className="text-[12px] font-bold text-[#1e3a8a] truncate">{myAddress}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#e2e8f0]">
          <button
            onClick={() => { setTab('inbox'); setSelectedMsg(null); setComposing(false); setSelectedEmail(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold border-none cursor-pointer transition-colors ${tab === 'inbox' ? 'text-[#2563eb] border-b-2 border-[#2563eb] bg-white' : 'text-[#64748b] bg-[#f8fafc] hover:bg-white'}`}
          >
            <Inbox className="w-3.5 h-3.5" />
            My Inbox
            {emailUnread > 0 && <span className="ml-0.5 bg-[#2563eb] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{emailUnread}</span>}
          </button>
          {isAdmin && (
            <button
              onClick={() => { setTab('support'); setSelectedMsg(null); setComposing(false); setSelectedEmail(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold border-none cursor-pointer transition-colors ${tab === 'support' ? 'text-[#2563eb] border-b-2 border-[#2563eb] bg-white' : 'text-[#64748b] bg-[#f8fafc] hover:bg-white'}`}
            >
              <Mail className="w-3.5 h-3.5" />
              Support
              {supportUnread > 0 && <span className="ml-0.5 bg-[#16a34a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{supportUnread}</span>}
            </button>
          )}
          <button
            onClick={() => { setTab('staff'); setSelectedEmail(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold border-none cursor-pointer transition-colors ${tab === 'staff' ? 'text-[#2563eb] border-b-2 border-[#2563eb] bg-white' : 'text-[#64748b] bg-[#f8fafc] hover:bg-white'}`}
          >
            <Reply className="w-3.5 h-3.5" />
            Staff
            {msgUnread > 0 && <span className="ml-0.5 bg-[#dc2626] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{msgUnread}</span>}
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-[#e2e8f0] flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94a3b8]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs outline-none focus:border-[#2563eb]"
            />
          </div>
          {tab === 'staff' && (
            <button
              onClick={() => { setComposing(true); setSelectedMsg(null); setReplyTo(null); setDraft({ subject: '', body: '' }); }}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
            >
              + New
            </button>
          )}
          {(tab === 'inbox' || tab === 'support') && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={openComposeEmail}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
              >
                <Send className="w-3 h-3" /> Send Email
              </button>
              <button onClick={loadEmails} className="shrink-0 px-2.5 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[11px] text-[#64748b] font-semibold cursor-pointer hover:bg-[#e2e8f0]">
                ↻
              </button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f1f5f9]">
          {(tab === 'inbox' || tab === 'support') && (
            emailsLoading ? (
              <div className="p-6 text-center text-[#94a3b8] text-[12px]">Loading...</div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="w-8 h-8 text-[#e2e8f0] mx-auto mb-2" />
                <div className="text-[12px] text-[#94a3b8]">{search ? 'No emails match your search.' : 'No emails yet.'}</div>
                {!search && (
                  <div className="mt-2 text-[11px] text-[#64748b]">
                    Emails sent to <span className="font-semibold text-[#2563eb]">{tab === 'support' ? 'support@claimvelo.com' : myAddress}</span> will appear here.
                  </div>
                )}
              </div>
            ) : filteredEmails.map(e => {
              const isUnread = !e.read_by.includes(currentUser?.id || '');
              return (
                <div
                  key={e.id}
                  onClick={() => { setSelectedEmail(e); markEmailRead(e); }}
                  className={`flex items-start gap-2.5 px-3 py-3 cursor-pointer transition-colors hover:bg-[#f8fafc] ${selectedEmail?.id === e.id ? 'bg-[#eff6ff]' : ''} ${isUnread ? 'bg-[#fafbff]' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#dbeafe] flex items-center justify-center text-[11px] font-bold text-[#2563eb] shrink-0 mt-0.5">
                    {(e.from_name || e.from_address || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-[12px] truncate ${isUnread ? 'font-bold text-[#0f172a]' : 'font-medium text-[#374151]'}`}>
                        {e.from_name || e.from_address}
                      </span>
                      <span className="text-[10px] text-[#94a3b8] shrink-0">{timeAgo(e.received_at)}</span>
                    </div>
                    <div className={`text-[11px] truncate mb-0.5 ${isUnread ? 'font-semibold text-[#1e293b]' : 'text-[#475569]'}`}>{e.subject || '(no subject)'}</div>
                    <div className="text-[10px] text-[#94a3b8] truncate">{e.body_text}</div>
                  </div>
                  {isUnread && <div className="w-2 h-2 rounded-full bg-[#2563eb] shrink-0 mt-1.5" />}
                </div>
              );
            })
          )}

          {tab === 'staff' && (
            msgsLoading ? (
              <div className="p-6 text-center text-[#94a3b8] text-[12px]">Loading...</div>
            ) : filteredMsgs.length === 0 ? (
              <div className="p-8 text-center">
                <Reply className="w-8 h-8 text-[#e2e8f0] mx-auto mb-2" />
                <div className="text-[12px] text-[#94a3b8]">{search ? 'No messages match your search.' : 'No staff messages yet. Click "+ New" to compose.'}</div>
              </div>
            ) : filteredMsgs.map(m => {
              const isUnread = !m.read_by.includes(currentUser?.id || '');
              return (
                <div
                  key={m.id}
                  onClick={() => { setSelectedMsg(m); markMsgRead(m); setComposing(false); }}
                  className={`flex items-start gap-2.5 px-3 py-3 cursor-pointer transition-colors hover:bg-[#f8fafc] ${selectedMsg?.id === m.id ? 'bg-[#eff6ff]' : ''} ${isUnread ? 'bg-[#fafbff]' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#e2e8f0] flex items-center justify-center text-[11px] font-bold text-[#64748b] shrink-0 mt-0.5">
                    {(m.from_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-[12px] truncate ${isUnread ? 'font-bold text-[#0f172a]' : 'font-medium text-[#374151]'}`}>{m.from_name || 'Unknown'}</span>
                      <span className="text-[10px] text-[#94a3b8] shrink-0">{timeAgo(m.created_at)}</span>
                    </div>
                    <div className={`text-[11px] truncate mb-0.5 ${isUnread ? 'font-semibold text-[#1e293b]' : 'text-[#475569]'}`}>{m.subject}</div>
                    <div className="text-[10px] text-[#94a3b8] truncate">{m.body}</div>
                  </div>
                  {isUnread && <div className="w-2 h-2 rounded-full bg-[#dc2626] shrink-0 mt-1.5" />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail / Compose pane */}
      {(tab === 'inbox' || tab === 'support') && selectedEmail && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-start justify-between gap-3">
            <div className="font-bold text-[14px] text-[#0f172a] leading-snug">{selectedEmail.subject || '(no subject)'}</div>
            <button onClick={() => setSelectedEmail(null)} className="shrink-0 bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b] p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-3 border-b border-[#f1f5f9] flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#dbeafe] flex items-center justify-center text-[13px] font-bold text-[#2563eb] shrink-0">
              {(selectedEmail.from_name || selectedEmail.from_address || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[12px] text-[#0f172a]">{selectedEmail.from_name || selectedEmail.from_address}</div>
              <div className="text-[10px] text-[#94a3b8]">From: {selectedEmail.from_address}</div>
              <div className="text-[10px] text-[#94a3b8]">To: {selectedEmail.to_address}</div>
            </div>
            <div className="text-[10px] text-[#94a3b8] shrink-0 mt-0.5">{timeAgo(selectedEmail.received_at)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {selectedEmail.body_html ? (
              <div className="text-[13px] text-[#374151] leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} />
            ) : selectedEmail.body_text ? (
              <div className="text-[13px] text-[#374151] whitespace-pre-line leading-relaxed">{selectedEmail.body_text}</div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-[12px] text-[#94a3b8] italic">No message body available.</div>
                {(() => {
                  const attachments = selectedEmail.raw_payload?.data?.attachments;
                  return attachments && attachments.length > 0 ? (
                    <div>
                      <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Attachments ({attachments.length})</div>
                      <div className="flex flex-col gap-1.5">
                        {attachments.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg">
                            <Paperclip className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
                            <span className="text-[12px] text-[#374151] font-medium truncate">{a.filename}</span>
                            <span className="text-[10px] text-[#94a3b8] shrink-0">{a.content_type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            <button
              onClick={() => openReplyEmail(selectedEmail)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
            >
              <Reply className="w-3.5 h-3.5" /> Reply
            </button>
            <button
              onClick={() => deleteEmail(selectedEmail.id)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#dc2626] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#fee2e2] ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {(tab === 'inbox' || tab === 'support') && emailComposing && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <span className="font-bold text-[13px] text-[#0f172a]">
              {emailReplyTo ? `Reply: ${emailReplyTo.subject}` : 'New Email'}
            </span>
            <button onClick={() => { setEmailComposing(false); setEmailReplyTo(null); }} className="bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-5 flex flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">From</label>
              <div className="px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[12px] text-[#64748b]">
                {currentUser?.full_name || 'You'} &lt;{currentUser?.claimvelo_email || 'support@claimvelo.com'}&gt;
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">To</label>
              <input
                value={emailDraft.to}
                onChange={e => setEmailDraft(d => ({ ...d, to: e.target.value }))}
                placeholder="recipient@example.com"
                type="email"
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Subject</label>
              <input
                value={emailDraft.subject}
                onChange={e => setEmailDraft(d => ({ ...d, subject: e.target.value }))}
                placeholder="Enter subject..."
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Message</label>
              <textarea
                value={emailDraft.body}
                onChange={e => setEmailDraft(d => ({ ...d, body: e.target.value }))}
                placeholder="Write your message..."
                className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] resize-none font-sans min-h-[180px] bg-white"
              />
            </div>
            {emailSendError && (
              <div className="bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[11px] rounded-lg px-3 py-2">
                {emailSendError}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            <button
              onClick={sendExternalEmail}
              disabled={emailSending || !emailDraft.to || !emailDraft.subject || !emailDraft.body}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {emailSending ? 'Sending...' : 'Send Email'}
            </button>
            <button
              onClick={() => { setEmailComposing(false); setEmailReplyTo(null); }}
              className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {tab === 'staff' && composing && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <span className="font-bold text-[13px] text-[#0f172a]">{replyTo ? `Reply: ${replyTo.subject}` : 'New Staff Message'}</span>
            <button onClick={() => { setComposing(false); setReplyTo(null); }} className="bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-5 flex flex-col gap-3">
            {!replyTo && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Subject</label>
                <input
                  value={draft.subject}
                  onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
                  placeholder="Enter subject..."
                  className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb]"
                />
              </div>
            )}
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Message</label>
              <textarea
                value={draft.body}
                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                placeholder="Write your message..."
                className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] resize-none font-sans min-h-[200px]"
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            <button
              onClick={sendMessage}
              disabled={sending}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {sending ? 'Sending...' : 'Send to All Staff'}
            </button>
            <button onClick={() => { setComposing(false); setReplyTo(null); }} className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#374151] rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[#e2e8f0]">
              Discard
            </button>
          </div>
        </div>
      )}

      {tab === 'staff' && selectedMsg && !composing && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-start justify-between gap-3">
            <div className="font-bold text-[14px] text-[#0f172a] leading-snug">{selectedMsg.subject}</div>
            <button onClick={() => setSelectedMsg(null)} className="shrink-0 bg-transparent border-none cursor-pointer text-[#94a3b8] hover:text-[#64748b] p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-3 border-b border-[#f1f5f9] flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#e2e8f0] flex items-center justify-center text-[12px] font-bold text-[#64748b] shrink-0">
              {(selectedMsg.from_name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[12px] text-[#0f172a]">{selectedMsg.from_name}</div>
              <div className="text-[10px] text-[#94a3b8]">Broadcast to all staff</div>
            </div>
            <div className="text-[10px] text-[#94a3b8] shrink-0">{timeAgo(selectedMsg.created_at)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="text-[13px] text-[#374151] whitespace-pre-line leading-relaxed">{selectedMsg.body}</div>
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] flex gap-2">
            <button
              onClick={() => { setReplyTo(selectedMsg); setComposing(true); setDraft({ subject: `Re: ${selectedMsg.subject}`, body: `\n\n--- Original ---\n${selectedMsg.body}` }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
            >
              <Reply className="w-3.5 h-3.5" /> Reply
            </button>
            {selectedMsg.from_user_id === currentUser?.id && (
              <button
                onClick={() => deleteMessage(selectedMsg.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] text-[#dc2626] rounded-lg text-[11px] font-semibold cursor-pointer hover:bg-[#fee2e2]"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state for detail pane */}
      {!showDetailPane && (
        <div className="hidden" />
      )}
    </div>
  );
}

function LOAPreview({ claim }: { claim: Claim }) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const fullName = `${claim.passenger_first_name} ${claim.passenger_last_name}`;

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 mt-4" style={{ fontFamily: "'Times New Roman', serif", fontSize: '12px', lineHeight: 1.75, color: '#1a1a1a' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-5 pb-3 border-b-2 border-[#2563eb]" style={{ fontFamily: 'sans-serif' }}>
        <div>
          <div className="text-[15px] font-extrabold text-[#2563eb]">ClaimVelo</div>
          <div className="text-[10px] text-[#64748b]">Flight Compensation Specialists</div>
        </div>
        <div className="text-right text-[10px] text-[#64748b]" style={{ fontFamily: 'sans-serif' }}>
          ClaimVelo Ltd.<br />1265 55th St, Brooklyn, NY 11219<br />support@claimvelo.com<br />{today}
        </div>
      </div>

      <div className="text-[11px] font-bold text-center mb-4 uppercase tracking-[0.1em] text-[#2563eb]" style={{ fontFamily: 'sans-serif' }}>
        Letter of Authority & Assignment of Rights
      </div>

      <p className="mb-2.5">
        I, <strong className="text-[#2563eb]">{fullName}</strong>, hereby authorise <strong>ClaimVelo Ltd.</strong> to act as my authorised representative in connection with my flight compensation claim against <strong className="text-[#2563eb]">{claim.airline}</strong>.
      </p>

      <div className="my-3 px-3 py-2.5 bg-[#f8fafc] rounded border border-[#e2e8f0] text-[11px]" style={{ fontFamily: 'sans-serif' }}>
        <strong className="block mb-1 text-[10px] uppercase text-[#64748b]">Flight Details</strong>
        Flight: <strong>{claim.flight_number || '—'}</strong> | Date: <strong>{claim.flight_date || '—'}</strong> | Route: <strong>{claim.departure}</strong> → <strong>{claim.arrival}</strong><br />
        Issue: <strong>{claim.issue_type}</strong> | Compensation: <strong>€600</strong> (EC 261/2004)
      </div>

      <div className="my-3 px-3 py-2.5 bg-[#f8fafc] rounded border border-[#e2e8f0] text-[11px]" style={{ fontFamily: 'sans-serif' }}>
        <strong className="block mb-1 text-[10px] uppercase text-[#64748b]">Passenger Details</strong>
        Name: <strong>{fullName}</strong> | DOB: <strong>{claim.dob || '—'}</strong><br />
        Email: <strong>{claim.email}</strong> | Address: <strong>{claim.address || '—'}</strong>
      </div>

      <p className="mb-2"><strong>Scope of Authority:</strong> I authorise the Company to communicate with the Airline, access flight records, instruct legal counsel, commence court proceedings, and receive compensation on my behalf.</p>
      <p className="mb-2"><strong>Fee Agreement:</strong> I agree to pay a success fee of <strong>30% (+VAT)</strong> of compensation received (or <strong>50% (+VAT)</strong> if legal representation is required). No fee if unsuccessful.</p>
      <p className="mb-2"><strong>GDPR:</strong> I consent to processing of my personal data for the purpose of this claim.</p>

      <div className="grid grid-cols-2 gap-6 mt-5">
        <div className="border-t border-[#333] pt-1.5 text-[10px] text-[#64748b]">
          <div className="font-semibold text-[11px] text-[#0f172a] mb-1">{fullName}</div>
          {claim.signature_data ? (
            <div className="h-14 flex items-center justify-start">
              <img src={claim.signature_data} alt="signature" style={{ maxHeight: 56, maxWidth: '100%' }} />
            </div>
          ) : (
            <div className={`h-10 border border-dashed border-[#e2e8f0] rounded flex items-center justify-center ${claim.loa_signed ? 'bg-[#f0fdf4]' : 'bg-[#f8fafc]'}`}>
              {claim.loa_signed ? <span className="text-[#16a34a] text-[11px] font-semibold">✓ Signed</span> : <span className="text-[#64748b] text-[11px]">Not signed</span>}
            </div>
          )}
          <div className="mt-1">Date: {claim.created_at?.split('T')[0] || today}</div>
        </div>
        <div className="border-t border-[#333] pt-1.5 text-[10px] text-[#64748b]">
          <div className="font-semibold text-[11px] text-[#0f172a] mb-1">ClaimVelo Ltd.</div>
          <div className="h-10 border border-dashed border-[#e2e8f0] rounded flex items-center justify-center italic text-[11px] text-[#64748b]">Authorised Signature</div>
          <div className="mt-1">Date: {today}</div>
        </div>
      </div>

      <div className="mt-5 pt-2 border-t border-[#e2e8f0] text-[9px] text-center text-[#94a3b8]" style={{ fontFamily: 'sans-serif' }}>
        ClaimVelo Ltd. registered in England & Wales. Co. No. 12345678. 12 Aviation House, London EC1A 1BB.
      </div>
    </div>
  );
}

export default function AdminPage({ onNav, user, onSignOut }: Props) {
  const [av, setAv] = useState<AdminView>('dash');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [panel, setPanel] = useState<Claim | null>(null);
  const [panelTab, setPanelTab] = useState<'details' | 'loa' | 'files'>('details');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Workers state
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerForm, setWorkerForm] = useState({ email: '', full_name: '', role: 'worker', agent_code: '' });
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerError, setWorkerError] = useState('');

  // Sales managers state
  const [showAddSales, setShowAddSales] = useState(false);
  const [salesForm, setSalesForm] = useState({ email: '', full_name: '' });
  const [salesSaving, setSalesSaving] = useState(false);
  const [salesError, setSalesError] = useState('');
  const [salesSuccess, setSalesSuccess] = useState('');

  // Agents state
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [agentForm, setAgentForm] = useState({ email: '', full_name: '', agent_code: '' });
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentSuccess, setAgentSuccess] = useState('');

  // Claim files state
  const [claimFiles, setClaimFiles] = useState<ClaimFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileNote, setFileNote] = useState('');
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QR generator state
  const [qrAgentName, setQrAgentName] = useState('');
  const [qrAgentId, setQrAgentId] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function generateQR() {
    const id = qrAgentId.trim() || 'AGT-001';
    const url = `${window.location.origin}/claim?agent=${encodeURIComponent(id)}`;
    const dataUrl = await QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    setQrDataUrl(dataUrl);
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.download = `claimvelo-qr-${qrAgentId || 'agent'}.png`;
    a.href = qrDataUrl;
    a.click();
  }

  // Finance state
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeFilter, setFinanceFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [financeSearch, setFinanceSearch] = useState('');
  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    currency: 'EUR',
    date: new Date().toISOString().split('T')[0],
    claim_ref: '',
  });
  const [txSaving, setTxSaving] = useState(false);
  const [txError, setTxError] = useState('');
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<string | null>(null);

  const isWorker = user?.role === 'worker' || user?.role === 'seo_worker';
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Send email to claimant state
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSendResult, setEmailSendResult] = useState<'success' | 'error' | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);

  async function loadNotifications() {
    setNotifsLoading(true);
    // Trigger stale check first
    await supabase.rpc('generate_stale_notifications');
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data as DbNotification[]);
    setNotifsLoading(false);
  }

  async function markNotifRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllNotifsRead() {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  useEffect(() => {
    if (!user) return;
    supabase.from('claims').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setClaims(data as Claim[]);
    });
    loadNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!user || isWorker) return;
    supabase.from('worker_profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setWorkers(data as WorkerProfile[]);
    });
  }, [user?.id, isWorker]);

  useEffect(() => {
    setNoteText(panel?.notes || '');
    setEmailPanelOpen(false);
    setEmailSubject('');
    setEmailBody('');
    setEmailSendResult(null);
  }, [panel?.id]);

  useEffect(() => {
    if (!panel) { setClaimFiles([]); return; }
    setFilesLoading(true);
    supabase.from('claim_files').select('*').eq('claim_id', panel.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setClaimFiles(data as ClaimFile[]);
        setFilesLoading(false);
      });
  }, [panel]);

  async function sendClaimantEmail() {
    if (!panel || !emailSubject.trim() || !emailBody.trim()) return;
    setEmailSending(true);
    setEmailSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_STAFF_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          to: panel.email,
          subject: emailSubject.trim(),
          body: emailBody.trim(),
          fromName: user?.full_name || 'ClaimVelo Team',
          fromAddress: user?.claimvelo_email || 'support@claimvelo.com',
        }),
      });
      setEmailSendResult(res.ok ? 'success' : 'error');
      if (res.ok) { setEmailSubject(''); setEmailBody(''); }
    } catch {
      setEmailSendResult('error');
    }
    setEmailSending(false);
  }

  async function addWorker() {
    if (!workerForm.email.trim() || !workerForm.full_name.trim()) {
      setWorkerError('Email and name are required.');
      return;
    }
    setWorkerSaving(true);
    setWorkerError('');
    const { error } = await supabase.from('worker_profiles').insert({
      email: workerForm.email.trim(),
      full_name: workerForm.full_name.trim(),
      role: workerForm.role,
      agent_code: workerForm.agent_code.trim().toUpperCase(),
      status: 'pending',
      created_by: user?.id,
    });
    if (error) {
      setWorkerError(error.message);
    } else {
      const { data } = await supabase.from('worker_profiles').select('*').order('created_at', { ascending: false });
      if (data) setWorkers(data as WorkerProfile[]);
      setShowAddWorker(false);
      setWorkerForm({ email: '', full_name: '', role: 'worker' });
    }
    setWorkerSaving(false);
  }

  async function removeWorker(id: string) {
    await supabase.from('worker_profiles').delete().eq('id', id);
    setWorkers(w => w.filter(x => x.id !== id));
  }

  async function addSalesPerson() {
    if (!salesForm.email.trim() || !salesForm.full_name.trim()) {
      setSalesError('Email and full name are required.');
      return;
    }
    setSalesSaving(true);
    setSalesError('');
    setSalesSuccess('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ email: salesForm.email.trim(), fullName: salesForm.full_name.trim(), role: 'sales_manager' }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Failed to create account');
      setSalesSuccess(`Account created! Welcome email sent to ${salesForm.email.trim()}.`);
      setSalesForm({ email: '', full_name: '' });
      setShowAddSales(false);
    } catch (e: unknown) {
      setSalesError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setSalesSaving(false);
  }

  async function addAgent() {
    if (!agentForm.email.trim() || !agentForm.full_name.trim()) {
      setAgentError('Email and full name are required.');
      return;
    }
    setAgentSaving(true);
    setAgentError('');
    setAgentSuccess('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          email: agentForm.email.trim(),
          fullName: agentForm.full_name.trim(),
          role: 'agent',
          agentCode: agentForm.agent_code.trim().toUpperCase() || undefined,
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Failed to create account');
      setAgentSuccess(`Agent account created! Welcome email sent to ${agentForm.email.trim()}.`);
      setAgentForm({ email: '', full_name: '', agent_code: '' });
      setShowAddAgent(false);
      // Refresh worker list
      const { data } = await supabase.from('worker_profiles').select('*').order('created_at', { ascending: false });
      if (data) setWorkers(data as WorkerProfile[]);
    } catch (e: unknown) {
      setAgentError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setAgentSaving(false);
  }

  async function deleteClaim(id: string) {
    await supabase.from('claim_files').delete().eq('claim_id', id);
    await supabase.from('claims').delete().eq('id', id);
    setClaims(cl => cl.filter(c => c.id !== id));
    setPanel(null);
    setConfirmDelete(null);
  }

  async function uploadFile(file: File) {
    if (!panel) return;
    setFileUploading(true);
    const path = `claim-files/${panel.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('claim-files').upload(path, file, { upsert: false });
    if (upErr) {
      // Store as metadata-only if storage bucket not configured
    }
    const { error: dbErr } = await supabase.from('claim_files').insert({
      claim_id: panel.id,
      uploaded_by: user?.id,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      storage_path: upErr ? '' : path,
      note: fileNote.trim(),
    });
    if (!dbErr) {
      const { data } = await supabase.from('claim_files').select('*').eq('claim_id', panel.id).order('created_at', { ascending: false });
      if (data) setClaimFiles(data as ClaimFile[]);
      setFileNote('');
    }
    setFileUploading(false);
  }

  async function deleteFile(fileId: string, storagePath: string) {
    if (storagePath) await supabase.storage.from('claim-files').remove([storagePath]);
    await supabase.from('claim_files').delete().eq('id', fileId);
    setClaimFiles(f => f.filter(x => x.id !== fileId));
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  async function loadFinance() {
    setFinanceLoading(true);
    const { data } = await supabase
      .from('finance_transactions')
      .select('*')
      .order('date', { ascending: false });
    if (data) setFinanceTransactions(data as FinanceTransaction[]);
    setFinanceLoading(false);
  }

  async function saveTx() {
    if (!txForm.description.trim() || !txForm.amount || !txForm.category) {
      setTxError('Category, description and amount are required.');
      return;
    }
    const amt = parseFloat(txForm.amount);
    if (isNaN(amt) || amt <= 0) { setTxError('Amount must be a positive number.'); return; }
    setTxSaving(true); setTxError('');
    const { error } = await supabase.from('finance_transactions').insert({
      type: txForm.type,
      category: txForm.category,
      description: txForm.description.trim(),
      amount: amt,
      currency: txForm.currency,
      date: txForm.date,
      claim_ref: txForm.claim_ref.trim() || null,
      created_by: user?.id || null,
    });
    if (error) { setTxError(error.message); }
    else {
      await loadFinance();
      setShowAddTx(false);
      setTxForm({ type: 'income', category: '', description: '', amount: '', currency: 'EUR', date: new Date().toISOString().split('T')[0], claim_ref: '' });
    }
    setTxSaving(false);
  }

  async function deleteTx(id: string) {
    await supabase.from('finance_transactions').delete().eq('id', id);
    setFinanceTransactions(t => t.filter(x => x.id !== id));
    setConfirmDeleteTx(null);
  }

  useEffect(() => {
    if (av === 'finance') loadFinance();
  }, [av]);

  const filtered = claims.filter(c => {
    const q = search.toLowerCase();
    return (!q || [c.claim_ref, c.passenger_first_name, c.passenger_last_name, c.airline, c.departure, c.arrival].join(' ').toLowerCase().includes(q))
      && (!statusFilter || c.status === statusFilter);
  });

  async function saveNote() {
    if (!panel) return;
    setNoteSaving(true);
    await supabase.from('claims').update({ notes: noteText }).eq('id', panel.id);
    setClaims(cl => cl.map(c => c.id === panel.id ? { ...c, notes: noteText } : c));
    setPanel(p => p?.id === panel.id ? { ...p, notes: noteText } : p);
    setNoteSaving(false);
  }

  async function updateStatus(id: string, ns: ClaimStatus) {
    const oldClaim = claims.find(c => c.id === id);
    await supabase.from('claims').update({ status: ns }).eq('id', id);
    setClaims(cl => cl.map(c => c.id === id ? { ...c, status: ns } : c));
    setPanel(p => p?.id === id ? { ...p, status: ns } : p);
    if (oldClaim && oldClaim.status !== ns) {
      const passengerName = `${oldClaim.passenger_first_name} ${oldClaim.passenger_last_name}`.trim();
      insertNotification({
        type: 'status_changed',
        claim_ref: oldClaim.claim_ref,
        claim_id: oldClaim.id,
        message: `${oldClaim.claim_ref} — ${passengerName} moved from ${oldClaim.status} to ${ns}`,
      });
      if (oldClaim.email) {
        sendClaimEmail({
          type: 'status_changed',
          to: oldClaim.email,
          passengerName,
          claimRef: oldClaim.claim_ref,
          airline: oldClaim.airline,
          route: `${oldClaim.departure} → ${oldClaim.arrival}`,
          amount: oldClaim.amount,
          oldStatus: oldClaim.status,
          newStatus: ns,
        });
      }
    }
  }

  const sidebarMainItems: AdminView[] = isWorker ? ['dash','claims'] : ['dash','claims','crm'];
  const sidebarSystemItems: AdminView[] = isWorker
    ? ['inbox','notifs']
    : ['inbox','notifs','analytics','automation','users','qr','settings'];
  const sidebarFinanceItems: AdminView[] = isWorker ? [] : ['finance'];

  return (
    <div className="flex h-[calc(100vh-58px)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[205px] bg-white border-r border-[#e2e8f0] flex flex-col shrink-0 overflow-y-auto">
        <div className="px-3.5 py-3.5 border-b border-[#e2e8f0] font-bold text-[13px] text-[#2563eb] flex items-center gap-1.5">
          ✈ {isWorker ? 'Worker Portal' : 'Admin CRM'}
        </div>
        <div className="p-1.5 flex-1">
          <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider px-2 pt-1.5 pb-0.5">Main</div>
          {sidebarMainItems.map(id => (
            <button key={id} onClick={() => setAv(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] cursor-pointer text-[12px] font-medium border-none w-full text-left mb-0.5 transition-colors ${av===id?'bg-[#eff6ff] text-[#2563eb]':'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'}`}>
              <span>{id==='dash'?'📊':id==='claims'?'📋':'🗂'}</span>
              {AV_TITLES[id]}
              {id==='claims' && <span className="ml-auto bg-[#2563eb] text-white text-[9px] font-bold px-1 py-0.5 rounded-[7px]">{claims.length}</span>}
            </button>
          ))}
          <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider px-2 pt-3 pb-0.5">
            {isWorker ? 'Communication' : 'System'}
          </div>
          {sidebarSystemItems.map(id => (
            <button key={id} onClick={() => setAv(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] cursor-pointer text-[12px] font-medium border-none w-full text-left mb-0.5 transition-colors ${av===id?'bg-[#eff6ff] text-[#2563eb]':'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'}`}>
              <span>{id==='inbox'?'📥':id==='notifs'?'🔔':id==='analytics'?'📈':id==='automation'?'⚙️':id==='users'?'👥':id==='qr'?'🔳':'🔧'}</span>
              {AV_TITLES[id]}
              {id==='notifs' && notifications.filter(n => !n.read).length > 0 && <span className="ml-auto bg-[#2563eb] text-white text-[9px] font-bold px-1 py-0.5 rounded-[7px]">{notifications.filter(n => !n.read).length}</span>}
            </button>
          ))}
          {sidebarFinanceItems.length > 0 && (
            <>
              <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider px-2 pt-3 pb-0.5">Finance</div>
              {sidebarFinanceItems.map(id => (
                <button key={id} onClick={() => setAv(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] cursor-pointer text-[12px] font-medium border-none w-full text-left mb-0.5 transition-colors ${av===id?'bg-[#f0fdf4] text-[#16a34a]':'bg-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'}`}>
                  <span>💰</span>
                  {AV_TITLES[id]}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="px-3.5 py-2.5 border-t border-[#e2e8f0]">
          <div className="text-[11px] text-[#64748b] mb-1.5">{user?.email || (isWorker ? 'worker@claimvelo.com' : 'admin@claimvelo.com')}</div>
          {onSignOut && (
            <button onClick={onSignOut} className="text-[11px] text-[#dc2626] hover:underline cursor-pointer bg-transparent border-none p-0">Sign out</button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-4 h-12 flex items-center gap-2 shrink-0">
          <span className="font-semibold text-[13px]">{AV_TITLES[av]}</span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => onNav('home')} className="px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[10px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">← Website</button>
            {!isWorker && <button className="px-2.5 py-1 bg-[#2563eb] text-white rounded-[10px] text-xs font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">+ New Claim</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">

          {/* DASHBOARD */}
          {av === 'dash' && (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {(() => {
                  const total = claims.length;
                  const resolved = claims.filter(c=>c.status==='Resolved').length;
                  const pending = claims.filter(c=>c.status==='Untouched'||c.status==='In Progress').length;
                  const successRate = total > 0 ? Math.round(resolved/total*100) : 0;
                  return [
                    { l:'Total Claims', v: total, c:'text-[#2563eb]', d: total === 0 ? 'No claims yet' : `${total} total` },
                    { l:'Resolved', v: resolved, c:'text-[#16a34a]', d: total > 0 ? `${successRate}% success rate` : 'No claims yet' },
                    { l:'Compensation Paid', v: '—', c:'text-[#b45309]', d:'From finance records' },
                    { l:'Pending', v: pending, c:'text-[#d97706]', d: pending === 0 ? 'None pending' : `${pending} active` },
                  ];
                })().map(s => (
                  <div key={s.l} className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3.5">
                    <div className="text-[11px] text-[#64748b] mb-0.5">{s.l}</div>
                    <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
                    <div className="text-[10px] mt-0.5 text-[#64748b]">{s.d}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4 mb-3.5">
                <div className="flex items-center mb-3.5">
                  <span className="font-bold text-[13px]">Recent Claims</span>
                  <button onClick={() => setAv('claims')} className="ml-auto px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">View all →</button>
                </div>
                <table className="w-full border-collapse">
                  <thead><tr>
                    {['ID','Passenger','Route','Airline','Amount','Status'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {claims.slice(0,5).map(c => (
                      <tr key={c.id} onClick={() => { setPanel(c); }} className="hover:bg-[#f8fafc] cursor-pointer">
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold text-[#2563eb]">{c.claim_ref}</td>
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{c.passenger_first_name} {c.passenger_last_name}</td>
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{c.departure}→{c.arrival}</td>
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{c.airline}</td>
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold">{c.amount}</td>
                        <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs"><Badge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ALL CLAIMS */}
          {av === 'claims' && (
            <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
              <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." className="px-2.5 py-1.5 border border-[#e2e8f0] rounded-[7px] text-xs outline-none w-[170px] bg-[#f8fafc] focus:border-[#2563eb]" />
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="px-2.5 py-1.5 border border-[#e2e8f0] rounded-[7px] text-xs outline-none bg-white cursor-pointer">
                  <option value="">All statuses</option>
                  {STAGES.map(s=><option key={s}>{s}</option>)}
                </select>
                <span className="ml-auto text-[11px] text-[#64748b]">{filtered.length} claims</span>
              </div>
              <table className="w-full border-collapse">
                <thead><tr>
                  {['ID','Passenger','Route','Airline','Issue','Amount','Status','Filed',''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-[#f8fafc] group">
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold text-[#2563eb] cursor-pointer" onClick={() => setPanel(c)}>{c.claim_ref}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs cursor-pointer" onClick={() => setPanel(c)}>{c.passenger_first_name} {c.passenger_last_name}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs cursor-pointer" onClick={() => setPanel(c)}>{c.departure}→{c.arrival}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs cursor-pointer" onClick={() => setPanel(c)}>{c.airline}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs max-w-[120px] truncate cursor-pointer" onClick={() => setPanel(c)}>{c.issue_type}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold cursor-pointer" onClick={() => setPanel(c)}>{c.amount}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs cursor-pointer" onClick={() => setPanel(c)}><Badge status={c.status} /></td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs text-[#64748b] cursor-pointer" onClick={() => setPanel(c)}>{c.created_at?.split('T')[0]}</td>
                      <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">
                        {!isWorker && (
                          confirmDelete === c.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={e => { e.stopPropagation(); deleteClaim(c.id); }}
                                className="px-2 py-0.5 bg-[#dc2626] text-white rounded text-[10px] font-semibold border-none cursor-pointer hover:bg-[#b91c1c]"
                              >Confirm</button>
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                                className="px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] rounded text-[10px] font-semibold border-none cursor-pointer hover:bg-[#e2e8f0]"
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmDelete(c.id); }}
                              className="p-1 text-[#94a3b8] hover:text-[#dc2626] bg-transparent border-none cursor-pointer rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete claim"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* KANBAN */}
          {av === 'crm' && (
            <div>
              <div className="text-xs text-[#64748b] mb-2.5">Click any card to open claim details and update status</div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {STAGES.map(s => {
                  const cards = claims.filter(c => c.status === s);
                  return (
                    <div key={s} className="flex-none w-[190px] bg-[#f8fafc] rounded-[10px] p-2.5">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="font-bold text-[11px]">{s}</span>
                        <span className="bg-[#e2e8f0] rounded-[7px] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]">{cards.length}</span>
                      </div>
                      {cards.map(c => {
                        const agentWorker = c.agent && c.agent !== '—' ? workers.find(w => w.agent_code === c.agent) : null;
                        return (
                          <div key={c.id} onClick={() => { setPanel(c); }} className="bg-white border border-[#e2e8f0] rounded-[7px] p-2.5 mb-1.5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all">
                            <div className="text-[10px] text-[#64748b]">{c.claim_ref}</div>
                            <div className="font-semibold text-xs my-0.5">{c.passenger_first_name} {c.passenger_last_name}</div>
                            <div className="text-[11px] text-[#64748b] mb-1">✈ {c.departure}→{c.arrival}</div>
                            {agentWorker && (
                              <div className="text-[10px] text-[#2563eb] font-semibold mb-1.5 truncate">
                                👤 {agentWorker.full_name}
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <Badge status={c.status} />
                              <span className="font-bold text-[11px]">{c.amount}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* INTERNAL INBOX */}
          {av === 'inbox' && (
            <div className="h-[calc(100vh-58px-48px-32px)]">
              <InternalInbox currentUser={user} />
            </div>
          )}

          {/* NOTIFICATIONS */}
          {av === 'notifs' && (() => {
            const unreadCount = notifications.filter(n => !n.read).length;
            const notifIcon = (type: string) => {
              if (type === 'new_claim') return { icon: '🆕', bg: '#f0fdf4' };
              if (type === 'stale_in_progress') return { icon: '⏰', bg: '#eff6ff' };
              if (type === 'stale_waiting') return { icon: '⚠️', bg: '#fffbeb' };
              if (type === 'status_changed') return { icon: '🔄', bg: '#f8fafc' };
              return { icon: '🔔', bg: '#f8fafc' };
            };
            const notifTitle = (type: string) => {
              if (type === 'new_claim') return 'New Claim';
              if (type === 'stale_in_progress') return 'Stale — In Progress';
              if (type === 'stale_waiting') return 'Stale — Waiting';
              if (type === 'status_changed') return 'Status Changed';
              return 'Notification';
            };
            return (
              <div>
                <div className="flex items-center mb-3">
                  <span className="text-[13px] text-[#64748b]">{unreadCount} unread</span>
                  <button onClick={loadNotifications} className="ml-2 px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">Refresh</button>
                  {unreadCount > 0 && <button onClick={markAllNotifsRead} className="ml-auto px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">Mark all read</button>}
                </div>
                {notifsLoading ? (
                  <div className="text-[13px] text-[#64748b] py-8 text-center">Loading…</div>
                ) : notifications.length === 0 ? (
                  <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-10 text-center text-[13px] text-[#94a3b8]">No notifications yet</div>
                ) : (
                  <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
                    {notifications.map(n => {
                      const { icon, bg } = notifIcon(n.type);
                      return (
                        <div
                          key={n.id}
                          onClick={() => markNotifRead(n.id)}
                          className={`flex items-start gap-2.5 px-4 py-3 border-b border-[#e2e8f0] last:border-none cursor-pointer hover:bg-[#f8fafc] transition-colors ${!n.read ? 'bg-[#eff6ff]' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] shrink-0" style={{ background: bg }}>{icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-[#0f172a]">{notifTitle(n.type)}</span>
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] shrink-0" />}
                            </div>
                            <div className="text-[11px] text-[#374151] mt-0.5 leading-snug">{n.message}</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">{timeAgo(n.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ANALYTICS */}
          {av === 'analytics' && !isWorker && (() => {
            const total = claims.length;
            const resolved = claims.filter(c=>c.status==='Resolved').length;
            const winRate = total > 0 ? Math.round(resolved/total*100) : 0;
            // Claims per month (last 12 months)
            const now = new Date();
            const monthCounts = Array.from({length:12}, (_,i) => {
              const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1);
              return { label: MONTHS[d.getMonth()], count: claims.filter(c => { const cd = new Date(c.created_at); return cd.getFullYear()===d.getFullYear()&&cd.getMonth()===d.getMonth(); }).length };
            });
            const mx2 = Math.max(...monthCounts.map(m=>m.count), 1);
            // By status
            const statusData: [string, string, string][] = [
              ['Resolved','#16a34a'],['In Progress','#2563eb'],['Waiting','#d97706'],['Escalated','#dc2626'],
            ].map(([s,c]) => {
              const cnt = claims.filter(cl=>cl.status===s).length;
              const pct = total > 0 ? Math.round(cnt/total*100) : 0;
              return [s, `${pct}%`, c];
            });
            // Top airlines
            const airlineMap: Record<string, {total:number,resolved:number}> = {};
            claims.forEach(c => {
              if (!c.airline) return;
              if (!airlineMap[c.airline]) airlineMap[c.airline] = {total:0,resolved:0};
              airlineMap[c.airline].total++;
              if (c.status==='Resolved') airlineMap[c.airline].resolved++;
            });
            const topAirlines = Object.entries(airlineMap).sort((a,b)=>b[1].total-a[1].total).slice(0,5).map(([name,d]) => ({
              name, claims: d.total, winRate: d.total > 0 ? Math.round(d.resolved/d.total*100) : 0,
            }));
            return (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-3.5">
                {[
                  { l:'Total Claims', v: total, color: '' },
                  { l:'Resolved', v: resolved, color: '' },
                  { l:'Win Rate', v: `${winRate}%`, color: 'text-[#16a34a]' },
                  { l:'Pending', v: claims.filter(c=>c.status==='Untouched'||c.status==='In Progress').length, color: 'text-[#b45309]' },
                ].map(({l,v,color}) => (
                  <div key={l} className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3.5">
                    <div className="text-[11px] text-[#64748b] mb-0.5">{l}</div>
                    <div className={`text-xl font-bold ${color}`}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
                <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                  <div className="font-bold text-[13px] mb-3.5">Claims per Month</div>
                  {total === 0 ? (
                    <div className="text-[12px] text-[#64748b] text-center py-8">No claims yet</div>
                  ) : (
                  <div className="flex items-end gap-1.5 h-[110px]">
                    {monthCounts.map(({label,count},i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="text-[9px] font-bold">{count > 0 ? count : ''}</div>
                        <div className="w-full bg-[#bfdbfe] rounded-t-sm hover:bg-[#2563eb] transition-colors cursor-pointer" style={{height:`${Math.round(count/mx2*90)}px`}} />
                        <div className="text-[9px] text-[#64748b]">{label}</div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
                <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                  <div className="font-bold text-[13px] mb-3.5">By Status</div>
                  {total === 0 ? (
                    <div className="text-[12px] text-[#64748b] text-center py-8">No claims yet</div>
                  ) : (
                  <div className="flex flex-col gap-2">
                    {statusData.map(([l,p,c]) => (
                      <div key={l}>
                        <div className="flex justify-between text-[11px] mb-0.5"><span>{l}</span><span>{p}</span></div>
                        <div className="h-1.5 bg-[#e2e8f0] rounded-sm"><div className="h-full rounded-sm" style={{width:p, background:c}} /></div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              </div>
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                <div className="font-bold text-[13px] mb-3.5">Top Airlines</div>
                <table className="w-full border-collapse">
                  <thead><tr>{['Airline','Claims','Win Rate'].map(h=><th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>)}</tr></thead>
                  <tbody>
                    {topAirlines.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-4 text-xs text-[#64748b] text-center">No data yet</td></tr>
                    ) : topAirlines.map(({name,claims:cnt,winRate:wr}) => (
                      <tr key={name}><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{name}</td><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{cnt}</td><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs"><span className="inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold bg-[#f0fdf4] text-[#16a34a]">{wr}%</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {/* AUTOMATION */}
          {av === 'automation' && !isWorker && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                {[['Active Rules','4','text-[#2563eb]'],['Paused Rules','1','text-[#d97706]']].map(([l,v,c]) => (
                  <div key={l} className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3.5"><div className="text-[11px] text-[#64748b] mb-0.5">{l}</div><div className={`text-xl font-bold ${c}`}>{v}</div></div>
                ))}
              </div>
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                <div className="flex items-center mb-3.5"><span className="font-bold text-[13px]">Automation Rules</span><button className="ml-auto px-2.5 py-1 bg-[#2563eb] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8]">+ New Rule</button></div>
                <table className="w-full border-collapse">
                  <thead><tr>{['Rule','Trigger','Action','Status'].map(h=><th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>)}</tr></thead>
                  <tbody>
                    {[['Welcome Email','New claim','Email passenger',true],['42-Day Reminder','Unresolved 42d','Alert + email',true],['Missing Docs','Docs incomplete 7d','Email passenger',true],['Resolved Confirm','Status → Resolved','Payout email',true],['High-Volume Alert','>10 claims/day','Slack + email',false]].map(([r,tr,a,active]) => (
                      <tr key={r as string}><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold">{r}</td><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{tr}</td><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">{a}</td><td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs"><span className={`inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold ${active?'bg-[#f0fdf4] text-[#16a34a]':'bg-[#fffbeb] text-[#d97706]'}`}>{active?'● Active':'⏸ Paused'}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* USERS */}
          {av === 'users' && !isWorker && (
            <div className="max-w-[780px]">
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4 mb-3.5">
                <div className="flex items-center mb-3.5">
                  <span className="font-bold text-[13px]">Workers</span>
                  <span className="ml-2 text-[10px] text-[#64748b]">{workers.length} member{workers.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => { setShowAddWorker(true); setWorkerError(''); }}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-[#2563eb] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8]"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add Worker
                  </button>
                </div>

                {/* Add worker form */}
                {showAddWorker && (
                  <div className="mb-4 p-3.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px]">
                    <div className="font-semibold text-[12px] text-[#0f172a] mb-3">New Worker</div>
                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Full Name</label>
                        <input
                          value={workerForm.full_name}
                          onChange={e => setWorkerForm(f => ({ ...f, full_name: e.target.value }))}
                          placeholder="Jane Smith"
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb] bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Email</label>
                        <input
                          value={workerForm.email}
                          onChange={e => setWorkerForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="jane@company.com"
                          type="email"
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb] bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Agent / Referral Code</label>
                        <input
                          value={workerForm.agent_code}
                          onChange={e => setWorkerForm(f => ({ ...f, agent_code: e.target.value.toUpperCase() }))}
                          placeholder="e.g. GFF"
                          maxLength={12}
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb] bg-white font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Role</label>
                        <select
                          value={workerForm.role}
                          onChange={e => setWorkerForm(f => ({ ...f, role: e.target.value }))}
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb] bg-white"
                        >
                          <option value="worker">Worker</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    {workerError && <div className="text-[11px] text-[#dc2626] mb-2">{workerError}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={addWorker}
                        disabled={workerSaving}
                        className="px-3 py-1.5 bg-[#2563eb] text-white border-none rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
                      >
                        {workerSaving ? 'Saving...' : 'Add Worker'}
                      </button>
                      <button
                        onClick={() => { setShowAddWorker(false); setWorkerError(''); setWorkerForm({ email: '', full_name: '', role: 'worker', agent_code: '' }); }}
                        className="px-3 py-1.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {workers.length === 0 ? (
                  <div className="text-center py-10 text-[#94a3b8] text-[13px]">No workers added yet. Click "Add Worker" to get started.</div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Name', 'Email', 'Agent Code', 'Role', 'Status', 'Added', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map(w => (
                        <tr key={w.id} className="hover:bg-[#f8fafc]">
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-semibold">{w.full_name || '—'}</td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs text-[#64748b]">{w.email}</td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-mono font-semibold text-[#0f172a]">{w.agent_code || '—'}</td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">
                            <span className={`inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold ${w.role === 'admin' ? 'bg-[#fffbeb] text-[#b45309]' : 'bg-[#eff6ff] text-[#2563eb]'}`}>
                              {w.role.charAt(0).toUpperCase() + w.role.slice(1)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">
                            <span className={`inline-flex px-2 py-0.5 rounded-[10px] text-[10px] font-semibold ${w.status === 'active' ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fffbeb] text-[#d97706]'}`}>
                              {w.status === 'active' ? '● Active' : '● Pending'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs text-[#64748b]">{w.created_at?.split('T')[0]}</td>
                          <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs">
                            <button
                              onClick={() => removeWorker(w.id)}
                              className="p-1 text-[#94a3b8] hover:text-[#dc2626] bg-transparent border-none cursor-pointer rounded transition-colors"
                              title="Remove worker"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* SALES MANAGERS (inside users view) */}
          {av === 'users' && !isWorker && (
            <div className="max-w-[780px] mt-4 flex flex-col gap-4">

              {/* Sales Managers card */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                <div className="flex items-center mb-3.5">
                  <span className="font-bold text-[13px]">Sales Managers</span>
                  <span className="ml-2 text-[10px] text-[#64748b]">External sales partners</span>
                  <button
                    onClick={() => { setShowAddSales(true); setSalesError(''); setSalesSuccess(''); }}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-[#0369a1] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#075985]"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add Sales Manager
                  </button>
                </div>

                {salesSuccess && (
                  <div className="mb-3 px-3 py-2.5 bg-[#f0fdf4] border border-[#86efac] text-[#166534] text-[12px] rounded-[8px]">{salesSuccess}</div>
                )}

                {showAddSales && (
                  <div className="mb-4 p-3.5 bg-[#f0f9ff] border border-[#bae6fd] rounded-[8px]">
                    <div className="font-semibold text-[12px] text-[#0f172a] mb-1">New Sales Manager</div>
                    <div className="text-[11px] text-[#64748b] mb-3">A welcome email with a temporary password will be sent automatically.</div>
                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Full Name</label>
                        <input
                          value={salesForm.full_name}
                          onChange={e => setSalesForm(f => ({ ...f, full_name: e.target.value }))}
                          placeholder="Jane Smith"
                          className="px-2.5 py-2 border border-[#bae6fd] rounded-[7px] text-[12px] outline-none focus:border-[#0369a1] bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Email Address</label>
                        <input
                          value={salesForm.email}
                          onChange={e => setSalesForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="jane@example.com"
                          type="email"
                          className="px-2.5 py-2 border border-[#bae6fd] rounded-[7px] text-[12px] outline-none focus:border-[#0369a1] bg-white"
                        />
                      </div>
                    </div>
                    {salesError && <div className="text-[11px] text-[#dc2626] mb-2">{salesError}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={addSalesPerson}
                        disabled={salesSaving}
                        className="px-3 py-1.5 bg-[#0369a1] text-white border-none rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#075985] disabled:opacity-60"
                      >
                        {salesSaving ? 'Sending...' : 'Create & Send Welcome Email'}
                      </button>
                      <button
                        onClick={() => { setShowAddSales(false); setSalesError(''); setSalesForm({ email: '', full_name: '' }); }}
                        className="px-3 py-1.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showAddSales && !salesSuccess && (
                  <div className="text-[12px] text-[#94a3b8] py-3 text-center">
                    Sales managers get their own login portal and a temporary password via email.
                  </div>
                )}
              </div>

              {/* Agents card */}
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                <div className="flex items-center mb-3.5">
                  <span className="font-bold text-[13px]">Agents</span>
                  <span className="ml-2 text-[10px] text-[#64748b]">Referral agents</span>
                  <button
                    onClick={() => { setShowAddAgent(true); setAgentError(''); setAgentSuccess(''); }}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-[#16a34a] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#15803d]"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add Agent
                  </button>
                </div>

                {agentSuccess && (
                  <div className="mb-3 px-3 py-2.5 bg-[#f0fdf4] border border-[#86efac] text-[#166534] text-[12px] rounded-[8px]">{agentSuccess}</div>
                )}

                {showAddAgent && (
                  <div className="mb-4 p-3.5 bg-[#f0fdf4] border border-[#86efac] rounded-[8px]">
                    <div className="font-semibold text-[12px] text-[#0f172a] mb-1">New Agent</div>
                    <div className="text-[11px] text-[#64748b] mb-3">A welcome email with their temp password and referral QR code will be sent automatically.</div>
                    <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Full Name</label>
                        <input
                          value={agentForm.full_name}
                          onChange={e => setAgentForm(f => ({ ...f, full_name: e.target.value }))}
                          placeholder="Jane Smith"
                          className="px-2.5 py-2 border border-[#86efac] rounded-[7px] text-[12px] outline-none focus:border-[#16a34a] bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Email Address</label>
                        <input
                          value={agentForm.email}
                          onChange={e => setAgentForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="jane@example.com"
                          type="email"
                          className="px-2.5 py-2 border border-[#86efac] rounded-[7px] text-[12px] outline-none focus:border-[#16a34a] bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider">Agent / Referral Code</label>
                        <input
                          value={agentForm.agent_code}
                          onChange={e => setAgentForm(f => ({ ...f, agent_code: e.target.value.toUpperCase() }))}
                          placeholder="e.g. AGT-001"
                          maxLength={12}
                          className="px-2.5 py-2 border border-[#86efac] rounded-[7px] text-[12px] outline-none focus:border-[#16a34a] bg-white font-mono"
                        />
                      </div>
                    </div>
                    {agentError && <div className="text-[11px] text-[#dc2626] mb-2">{agentError}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={addAgent}
                        disabled={agentSaving}
                        className="px-3 py-1.5 bg-[#16a34a] text-white border-none rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#15803d] disabled:opacity-60"
                      >
                        {agentSaving ? 'Sending...' : 'Create & Send Welcome Email'}
                      </button>
                      <button
                        onClick={() => { setShowAddAgent(false); setAgentError(''); setAgentForm({ email: '', full_name: '', agent_code: '' }); }}
                        className="px-3 py-1.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showAddAgent && !agentSuccess && (
                  <div className="text-[12px] text-[#94a3b8] py-3 text-center">
                    Agents get their own login, a temporary password, and their referral QR code via email.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* QR CODES */}
          {av === 'qr' && !isWorker && (
            <div className="max-w-[700px]">
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 mb-4">
                <div className="font-bold text-[13px] text-[#0f172a] mb-4">Generate Agent QR Code</div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Agent Name</label>
                    <input
                      value={qrAgentName}
                      onChange={e => { setQrAgentName(e.target.value); setQrDataUrl(null); }}
                      placeholder="e.g. Jane Smith"
                      className="px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb] bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Agent / Referral Code</label>
                    <input
                      value={qrAgentId}
                      onChange={e => { setQrAgentId(e.target.value.toUpperCase()); setQrDataUrl(null); }}
                      placeholder="e.g. AGT-001"
                      maxLength={12}
                      className="px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] font-mono outline-none focus:border-[#2563eb] bg-white"
                    />
                  </div>
                </div>
                <button
                  onClick={generateQR}
                  disabled={!qrAgentId.trim()}
                  className="px-4 py-2 bg-[#2563eb] text-white border-none rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
                >
                  Generate QR Code
                </button>
              </div>

              {qrDataUrl && (
                <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 flex items-start gap-6">
                  <div className="shrink-0">
                    <img src={qrDataUrl} alt="Agent QR Code" width={220} height={220} className="border border-[#e2e8f0] rounded-[8px]" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-[14px] text-[#0f172a] mb-0.5">{qrAgentName || 'Agent'}</div>
                    <div className="text-[12px] text-[#64748b] mb-1">Code: <span className="font-mono font-semibold text-[#0f172a]">{qrAgentId}</span></div>
                    <div className="text-[11px] text-[#94a3b8] mb-4">Passengers who scan this QR code will have your referral code pre-filled on their claim.</div>
                    <button
                      onClick={downloadQR}
                      className="px-3.5 py-1.5 bg-[#f0fdf4] border border-[#86efac] text-[#166534] rounded-[7px] text-[12px] font-semibold cursor-pointer hover:bg-[#dcfce7] transition-colors"
                    >
                      Download PNG
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 mt-4">
                <div className="font-bold text-[13px] text-[#0f172a] mb-3">Claims by Agent Code</div>
                {(() => {
                  const agentCounts: Record<string, number> = {};
                  claims.forEach(c => { if (c.agent && c.agent !== '—') agentCounts[c.agent] = (agentCounts[c.agent] || 0) + 1; });
                  const entries = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]);
                  if (!entries.length) return <div className="text-[12px] text-[#94a3b8]">No claims with agent codes yet.</div>;
                  return (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Agent Code', 'Agent Name', 'Claims', 'Share'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(([code, count]) => {
                          const w = workers.find(w => w.agent_code === code);
                          return (
                          <tr key={code} className="hover:bg-[#f8fafc]">
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-mono font-semibold">{code}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs text-[#0f172a]">{w ? w.full_name : <span className="text-[#94a3b8]">Unknown</span>}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs font-bold text-[#2563eb]">{count}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-xs text-[#64748b]">{claims.length ? Math.round(count / claims.length * 100) + '%' : '—'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          )}

          {/* FINANCE */}
          {av === 'finance' && !isWorker && (() => {
            const allTx = financeTransactions;
            const filtered = allTx.filter(t => {
              const matchType = financeFilter === 'all' || t.type === financeFilter;
              const q = financeSearch.toLowerCase();
              const matchQ = !q || [t.description, t.category, t.claim_ref || ''].join(' ').toLowerCase().includes(q);
              return matchType && matchQ;
            });
            const totalIncome = allTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
            const totalExpense = allTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
            const net = totalIncome - totalExpense;
            const fmtAmt = (n: number, cur = 'EUR') => {
              const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : '€';
              return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };
            return (
              <div>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#f0fdf4] flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4 text-[#16a34a]" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#64748b] mb-0.5">Total Income</div>
                      <div className="text-[18px] font-bold text-[#16a34a]">{fmtAmt(totalIncome)}</div>
                    </div>
                  </div>
                  <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#fef2f2] flex items-center justify-center shrink-0">
                      <ArrowDownRight className="w-4 h-4 text-[#dc2626]" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#64748b] mb-0.5">Total Expenses</div>
                      <div className="text-[18px] font-bold text-[#dc2626]">{fmtAmt(totalExpense)}</div>
                    </div>
                  </div>
                  <div className={`bg-white border rounded-[10px] px-4 py-3.5 flex items-center gap-3 ${net >= 0 ? 'border-[#bbf7d0]' : 'border-[#fecaca]'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${net >= 0 ? 'bg-[#f0fdf4]' : 'bg-[#fef2f2]'}`}>
                      <DollarSign className={`w-4 h-4 ${net >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`} />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#64748b] mb-0.5">Net Profit / Loss</div>
                      <div className={`text-[18px] font-bold ${net >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{net >= 0 ? '+' : ''}{fmtAmt(net)}</div>
                    </div>
                  </div>
                </div>

                {/* Toolbar */}
                <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <div className="flex rounded-[7px] overflow-hidden border border-[#e2e8f0]">
                      {(['all','income','expense'] as const).map(f => (
                        <button key={f} onClick={() => setFinanceFilter(f)}
                          className={`px-3 py-1.5 text-[11px] font-semibold border-none cursor-pointer transition-colors capitalize ${financeFilter===f?'bg-[#0f2744] text-white':'bg-white text-[#64748b] hover:bg-[#f8fafc]'}`}>
                          {f === 'all' ? 'All' : f === 'income' ? '↑ Income' : '↓ Expenses'}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94a3b8]" />
                      <input
                        value={financeSearch}
                        onChange={e => setFinanceSearch(e.target.value)}
                        placeholder="Search..."
                        className="pl-7 pr-3 py-1.5 border border-[#e2e8f0] rounded-[7px] text-[11px] outline-none focus:border-[#0f2744] bg-[#f8fafc] w-[160px]"
                      />
                    </div>
                    <span className="text-[11px] text-[#64748b]">{filtered.length} records</span>
                    <button
                      onClick={() => { setShowAddTx(true); setTxError(''); }}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#0f2744] text-white border-none rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#1a3a5c]"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Transaction
                    </button>
                  </div>

                  {/* Add form */}
                  {showAddTx && (
                    <div className="mb-4 p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px]">
                      <div className="font-semibold text-[12px] text-[#0f172a] mb-3">New Transaction</div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Type</label>
                          <div className="flex rounded-[7px] overflow-hidden border border-[#e2e8f0]">
                            {(['income','expense'] as const).map(t => (
                              <button key={t} onClick={() => setTxForm(f => ({ ...f, type: t, category: '' }))}
                                className={`flex-1 py-2 text-[11px] font-semibold border-none cursor-pointer capitalize transition-colors ${txForm.type===t?(t==='income'?'bg-[#16a34a] text-white':'bg-[#dc2626] text-white'):'bg-white text-[#64748b] hover:bg-[#f8fafc]'}`}>
                                {t === 'income' ? '↑ Income' : '↓ Expense'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Category</label>
                          <select
                            value={txForm.category}
                            onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))}
                            className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#0f2744] bg-white"
                          >
                            <option value="">Select category…</option>
                            {(txForm.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 mb-3">
                        <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Description</label>
                        <input
                          value={txForm.description}
                          onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="e.g. Commission on CLM-000012"
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#0f2744] bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Amount</label>
                          <div className="flex items-center border border-[#e2e8f0] rounded-[7px] overflow-hidden bg-white focus-within:border-[#0f2744]">
                            <span className="px-2.5 py-2 text-[12px] text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0]">
                              {txForm.currency === 'GBP' ? '£' : txForm.currency === 'USD' ? '$' : '€'}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={txForm.amount}
                              onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                              placeholder="0.00"
                              className="flex-1 px-2 py-2 text-[12px] outline-none bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Currency</label>
                          <select
                            value={txForm.currency}
                            onChange={e => setTxForm(f => ({ ...f, currency: e.target.value }))}
                            className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#0f2744] bg-white"
                          >
                            <option value="EUR">EUR €</option>
                            <option value="GBP">GBP £</option>
                            <option value="USD">USD $</option>
                            <option value="ILS">ILS ₪</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Date</label>
                          <input
                            type="date"
                            value={txForm.date}
                            onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
                            className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#0f2744] bg-white"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 mb-3">
                        <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Claim Ref <span className="font-normal normal-case text-[#94a3b8]">(optional)</span></label>
                        <input
                          value={txForm.claim_ref}
                          onChange={e => setTxForm(f => ({ ...f, claim_ref: e.target.value }))}
                          placeholder="e.g. CLM-000012"
                          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#0f2744] bg-white"
                        />
                      </div>
                      {txError && <div className="text-[11px] text-[#dc2626] mb-2">{txError}</div>}
                      <div className="flex gap-2">
                        <button onClick={saveTx} disabled={txSaving}
                          className="px-3 py-1.5 bg-[#0f2744] text-white border-none rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#1a3a5c] disabled:opacity-60">
                          {txSaving ? 'Saving…' : 'Save Transaction'}
                        </button>
                        <button onClick={() => { setShowAddTx(false); setTxError(''); }}
                          className="px-3 py-1.5 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#f8fafc]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  {financeLoading ? (
                    <div className="text-center py-10 text-[#94a3b8] text-[12px]">Loading…</div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-10 text-[#94a3b8] text-[12px]">No transactions found.</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Date','Type','Category','Description','Ref','Amount',''].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#64748b] uppercase border-b border-[#e2e8f0] bg-[#f8fafc]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(tx => (
                          <tr key={tx.id} className="hover:bg-[#f8fafc] group">
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-[11px] text-[#64748b] whitespace-nowrap">{tx.date}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0]">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] text-[10px] font-semibold ${tx.type==='income'?'bg-[#f0fdf4] text-[#16a34a]':'bg-[#fef2f2] text-[#dc2626]'}`}>
                                {tx.type==='income' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                {tx.type === 'income' ? 'Income' : 'Expense'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-[11px] text-[#374151]">{tx.category}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-[11px] text-[#374151] max-w-[220px] truncate">{tx.description}</td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0] text-[11px]">
                              {tx.claim_ref
                                ? <span className="text-[#2563eb] font-semibold">{tx.claim_ref}</span>
                                : <span className="text-[#94a3b8]">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 border-b border-[#e2e8f0] text-[12px] font-bold ${tx.type==='income'?'text-[#16a34a]':'text-[#dc2626]'}`}>
                              {tx.type==='income' ? '+' : '−'}{fmtAmt(Number(tx.amount), tx.currency)}
                            </td>
                            <td className="px-3 py-2.5 border-b border-[#e2e8f0]">
                              {confirmDeleteTx === tx.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => deleteTx(tx.id)} className="px-2 py-0.5 bg-[#dc2626] text-white rounded text-[10px] font-semibold border-none cursor-pointer hover:bg-[#b91c1c]">Confirm</button>
                                  <button onClick={() => setConfirmDeleteTx(null)} className="px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] rounded text-[10px] font-semibold border-none cursor-pointer">Cancel</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteTx(tx.id)}
                                  className="p-1 text-[#94a3b8] hover:text-[#dc2626] bg-transparent border-none cursor-pointer rounded opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#f8fafc]">
                          <td colSpan={5} className="px-3 py-2.5 text-[11px] font-bold text-[#374151]">
                            {financeFilter !== 'expense' && financeFilter !== 'income' ? 'Net total' : financeFilter === 'income' ? 'Total income' : 'Total expenses'}
                          </td>
                          <td className={`px-3 py-2.5 text-[12px] font-black ${
                            financeFilter === 'expense'
                              ? 'text-[#dc2626]'
                              : financeFilter === 'income'
                              ? 'text-[#16a34a]'
                              : filtered.reduce((s,t) => s + (t.type==='income'?Number(t.amount):-Number(t.amount)), 0) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                          }`}>
                            {financeFilter === 'all'
                              ? (() => {
                                  const n = filtered.reduce((s,t) => s + (t.type==='income'?Number(t.amount):-Number(t.amount)), 0);
                                  return `${n>=0?'+':''}${fmtAmt(Math.abs(n))}`;
                                })()
                              : fmtAmt(filtered.reduce((s,t) => s + Number(t.amount), 0))
                            }
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}

          {/* SETTINGS */}
          {av === 'settings' && !isWorker && (
            <div className="max-w-[620px]">
              <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-4">
                <div className="font-bold text-[13px] mb-3.5">Company Profile</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-[0.04em]">Company Name</label><input defaultValue="ClaimVelo Ltd." className="px-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb]" /></div>
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-[0.04em]">Commission Rate</label><select className="px-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"><option>25%</option><option>30%</option><option>35%</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-[0.04em]">Support Email</label><input defaultValue="support@claimvelo.com" className="px-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb]" /></div>
                  <div className="flex flex-col gap-1"><label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-[0.04em]">Flight API</label><select className="px-3 py-2.5 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#2563eb] bg-white"><option>Aviationstack</option><option>AeroDataBox</option><option>FlightAware</option></select></div>
                </div>
                <div className="flex flex-col gap-2.5 text-[13px] mt-1">
                  {[['Force HTTPS on all connections',true],['GDPR: anonymise data after 2 years',true],['Two-factor authentication (2FA)',true],['Audit log for all admin actions',false]].map(([l,c]) => (
                    <label key={l as string} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked={c as boolean} className="accent-[#2563eb]" /> {l}</label>
                  ))}
                </div>
                <button className="mt-4 px-2.5 py-1 bg-[#2563eb] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8]">Save Settings</button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Overlay + Panel */}
      {panel && (
        <>
          <div className="fixed inset-0 bg-black/35 z-[300]" onClick={() => { setPanel(null); setPanelTab('details'); }} />
          <div className="fixed top-0 right-0 w-[460px] h-screen bg-white border-l border-[#e2e8f0] z-[301] flex flex-col panel-open overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center gap-2.5 shrink-0">
              <div>
                <div className="text-[10px] text-[#64748b]">{panel.claim_ref}</div>
                <div className="font-bold text-sm">{panel.passenger_first_name} {panel.passenger_last_name}</div>
              </div>
              <Badge status={panel.status} />
              <button onClick={() => { setPanel(null); setPanelTab('details'); }} className="ml-auto bg-transparent border-none text-[#64748b] text-xl cursor-pointer leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#e2e8f0] shrink-0">
              {([
                { id: 'details', label: 'Claim Details' },
                { id: 'loa', label: 'LOA Document', icon: <FileText className="w-3.5 h-3.5" />, badge: panel.loa_signed ? 'Signed' : null },
                { id: 'files', label: 'Files', icon: <Paperclip className="w-3.5 h-3.5" />, badge: claimFiles.length > 0 ? String(claimFiles.length) : null },
              ] as { id: 'details' | 'loa' | 'files'; label: string; icon?: React.ReactNode; badge?: string | null }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setPanelTab(t.id)}
                  className={`flex-1 py-2.5 text-[11px] font-semibold border-none cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${panelTab === t.id ? 'bg-white text-[#2563eb] border-b-2 border-[#2563eb]' : 'bg-[#f8fafc] text-[#64748b] hover:text-[#0f172a]'}`}
                >
                  {t.icon}{t.label}
                  {t.badge && <span className="ml-1 bg-[#f0fdf4] text-[#16a34a] text-[9px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {panelTab === 'details' && (
                <div className="p-5">
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Flight Details</div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[['Route',`${panel.departure}→${panel.arrival}`],['Airline',panel.airline],['Issue',panel.issue_type],['Amount',panel.amount],['Filed',panel.created_at?.split('T')[0]],['Agent', (() => { const w = workers.find(w => w.agent_code && w.agent_code === panel.agent); return w ? `${w.full_name} (${panel.agent})` : (panel.agent || '—'); })()]].map(([l,v]) => (
                        <div key={l}><div className="text-[10px] text-[#64748b] mb-0.5">{l}</div><div className="text-xs font-semibold">{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Status Timeline</div>
                    <ul className="list-none">
                      {STAGES.map((s,i) => {
                        const si = STAGES.indexOf(panel.status);
                        const done = i <= si;
                        return (
                          <li key={s} className="flex gap-2.5 pb-3 relative last:pb-0">
                            {i < STAGES.length - 1 && <div className="absolute left-[9px] top-5 bottom-0 w-px bg-[#e2e8f0]" />}
                            <div className={`w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center text-[8px] shrink-0 mt-0.5 z-10 ${done?'bg-[#2563eb] border-[#2563eb] text-white':'bg-white border-[#e2e8f0]'}`}>{done?'✓':''}</div>
                            <div>
                              <div className="font-semibold text-[11px]">{s}</div>
                              <div className="text-[10px] text-[#64748b] mt-0.5">{i<si?'Completed':i===si?'Current':'Pending'}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Update Status</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {STAGES.map(s => (
                        <button key={s} onClick={() => updateStatus(panel.id, s)}
                          className={`px-2.5 py-1 rounded-[7px] text-xs font-semibold border-none cursor-pointer transition-colors ${s===panel.status?'bg-[#2563eb] text-white':'bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] hover:bg-[#e2e8f0]'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Internal Note</div>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." rows={3} className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-xs resize-none outline-none font-sans focus:border-[#2563eb]" />
                    <button onClick={saveNote} disabled={noteSaving} className="mt-1.5 px-2.5 py-1 bg-[#2563eb] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60">{noteSaving ? 'Saving...' : 'Save Note'}</button>
                  </div>

                  {/* Send Email to Claimant */}
                  <div className="mt-5 pt-4 border-t border-[#e2e8f0]">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Email Claimant</div>
                      <button
                        onClick={() => { setEmailPanelOpen(p => !p); setEmailSendResult(null); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#dbeafe] transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> {emailPanelOpen ? 'Cancel' : 'New Email'}
                      </button>
                    </div>
                    {panel.email && (
                      <div className="text-[11px] text-[#64748b] mb-2">To: <span className="font-semibold text-[#0f172a]">{panel.email}</span></div>
                    )}
                    {emailPanelOpen && (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={e => setEmailSubject(e.target.value)}
                          placeholder="Subject"
                          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-xs outline-none focus:border-[#2563eb] font-sans"
                        />
                        <textarea
                          value={emailBody}
                          onChange={e => setEmailBody(e.target.value)}
                          placeholder="Write your message..."
                          rows={5}
                          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-xs resize-none outline-none focus:border-[#2563eb] font-sans"
                        />
                        {emailSendResult === 'success' && (
                          <div className="text-[11px] text-[#16a34a] font-semibold bg-[#f0fdf4] border border-[#bbf7d0] rounded-[7px] px-3 py-2">Email sent successfully.</div>
                        )}
                        {emailSendResult === 'error' && (
                          <div className="text-[11px] text-[#dc2626] font-semibold bg-[#fef2f2] border border-[#fecaca] rounded-[7px] px-3 py-2">Failed to send. Please try again.</div>
                        )}
                        <button
                          onClick={sendClaimantEmail}
                          disabled={emailSending || !emailSubject.trim() || !emailBody.trim() || !panel.email}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white border-none rounded-[7px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" /> {emailSending ? 'Sending...' : 'Send Email'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isWorker && (
                    <div className="mt-6 pt-4 border-t border-[#e2e8f0]">
                      <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2.5">Danger Zone</div>
                      {confirmDelete === panel.id ? (
                        <div className="flex items-center gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[8px]">
                          <span className="text-[11px] text-[#dc2626] font-semibold flex-1">Permanently delete this claim?</span>
                          <button
                            onClick={() => deleteClaim(panel.id)}
                            className="px-2.5 py-1 bg-[#dc2626] text-white rounded-[7px] text-[11px] font-semibold border-none cursor-pointer hover:bg-[#b91c1c]"
                          >Delete</button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2.5 py-1 bg-white text-[#64748b] border border-[#e2e8f0] rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#f8fafc]"
                          >Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(panel.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#fecaca] text-[#dc2626] rounded-[7px] text-[11px] font-semibold cursor-pointer hover:bg-[#fef2f2] transition-colors"
                        >
                          <Trash className="w-3.5 h-3.5" /> Delete Claim
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {panelTab === 'loa' && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold text-[#64748b]">Letter of Authority — {panel.claim_ref}</div>
                    <button onClick={() => window.print()} className="px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[7px] text-[10px] font-semibold cursor-pointer hover:bg-[#e2e8f0]">Print / PDF</button>
                  </div>
                  <LOAPreview claim={panel} />
                </div>
              )}

              {panelTab === 'files' && (
                <div className="p-4">
                  {/* Upload area */}
                  <div
                    className="border-2 border-dashed border-[#e2e8f0] rounded-[10px] p-5 mb-4 text-center cursor-pointer hover:border-[#2563eb] hover:bg-[#f8fafc] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-5 h-5 text-[#94a3b8] mx-auto mb-1.5" />
                    <div className="text-[12px] font-semibold text-[#0f172a]">{fileUploading ? 'Uploading...' : 'Click to attach a file'}</div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">PDF, images, documents — any format</div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadFile(f); e.target.value = ''; } }}
                  />
                  <div className="mb-3">
                    <input
                      value={fileNote}
                      onChange={e => setFileNote(e.target.value)}
                      placeholder="Optional note for next file..."
                      className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[7px] text-[12px] outline-none focus:border-[#2563eb]"
                    />
                  </div>

                  {/* File list */}
                  {filesLoading ? (
                    <div className="text-center py-6 text-[#94a3b8] text-[12px]">Loading files...</div>
                  ) : claimFiles.length === 0 ? (
                    <div className="text-center py-6 text-[#94a3b8] text-[12px]">No files attached to this claim yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {claimFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-3 p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px]">
                          <div className="w-8 h-8 bg-[#eff6ff] rounded-lg flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-[#2563eb]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[#0f172a] truncate">{f.file_name}</div>
                            <div className="text-[10px] text-[#94a3b8]">{formatBytes(f.file_size)} · {f.created_at?.split('T')[0]}</div>
                            {f.note && <div className="text-[10px] text-[#64748b] mt-0.5 italic">"{f.note}"</div>}
                          </div>
                          <button
                            onClick={() => deleteFile(f.id, f.storage_path)}
                            className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] bg-transparent border-none cursor-pointer rounded transition-colors shrink-0"
                            title="Delete file"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
