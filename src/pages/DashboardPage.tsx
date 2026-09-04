import { useState, useEffect, useRef } from 'react';
import { Page, UserProfile, Claim, ClaimStatus, InfoRequest } from '../types';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/language';
import { Plane, Plus, RefreshCw, Upload, FileText, AlertTriangle, CheckCircle, Clock, Paperclip } from 'lucide-react';
import CustomerMessages from '../components/CustomerMessages';

interface Props { onNav: (p: Page) => void; user?: UserProfile | null; }

const STAGES: ClaimStatus[] = ['Untouched', 'In Progress', 'Submitted', 'Waiting', 'Resolved', 'Escalated'];

const STATUS_STYLE: Record<ClaimStatus, string> = {
  'Untouched':   'bg-[#f8fafc] text-[#64748b]',
  'In Progress': 'bg-[#eff6ff] text-[#2563eb]',
  'Submitted':   'bg-[#ecfeff] text-[#0891b2]',
  'Waiting':     'bg-[#fffbeb] text-[#d97706]',
  'Resolved':    'bg-[#f0fdf4] text-[#16a34a]',
  'Escalated':   'bg-[#fef2f2] text-[#dc2626]',
  'Pending Check': 'bg-[#fff7ed] text-[#ea580c]',
  'Eligible':    'bg-[#ecfdf5] text-[#059669]',
  'Not Eligible': 'bg-[#f1f5f9] text-[#64748b]',
  'Not Eligible - Expired': 'bg-[#f8fafc] text-[#94a3b8]',
  'Force Majeure': 'bg-[#fef3c7] text-[#92400e]',
};

const STAGE_LABELS: Record<ClaimStatus, string> = {
  'Untouched':   'Received — being reviewed',
  'In Progress': 'Being actively worked on',
  'Submitted':   'Sent to airline',
  'Waiting':     'Awaiting airline response',
  'Resolved':    'Compensation confirmed',
  'Escalated':   'Escalated to legal team',
};

function ClaimTimeline({ status }: { status: ClaimStatus }) {
  const current = STAGES.indexOf(status);
  return (
    <div className="relative pl-6 mt-4">
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-[#e2e8f0]" />
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="relative mb-4 last:mb-0">
            <div className={`absolute -left-[15px] top-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[9px] z-10 transition-all
              ${done ? 'bg-[#16a34a] border-[#16a34a] text-white'
              : active ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'bg-white border-[#e2e8f0]'}`}>
              {done ? '✓' : active ? '→' : ''}
            </div>
            <div className={`text-[13px] font-semibold leading-tight
              ${active ? 'text-[#2563eb]' : done ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
              {s}
            </div>
            {active && (
              <div className="text-[11px] text-[#2563eb] mt-0.5">{STAGE_LABELS[s]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage({ onNav, user }: Props) {
  const { t } = useLang();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [infoRequests, setInfoRequests] = useState<InfoRequest[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }
    supabase
      .from('claims')
      .select('*')
      .or(`email.eq.${user.email},customer_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setClaims(data as Claim[]);
          if (data.length > 0) setSelected(data[0] as Claim);
        }
        setLoading(false);
      });
  }, [user?.email]);

  useEffect(() => {
    if (!selected) { setInfoRequests([]); return; }
    setReqLoading(true);
    supabase.from('claim_info_requests').select('*').eq('claim_id', selected.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setInfoRequests(data as InfoRequest[] || []);
        setReqLoading(false);
      });
  }, [selected]);

  async function uploadResponseFile(file: File, requestId: string) {
    if (!selected) return;
    setUploading(true);
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${selected.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('claim-files').upload(path, file);
    if (upErr) { setUploading(false); return; }
    await supabase.from('claim_files').insert({
      claim_id: selected.id,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || ext,
      storage_path: path,
      note: 'Response to info request',
      info_request_id: requestId,
    });
    // Refresh requests
    const { data } = await supabase.from('claim_info_requests').select('*').eq('claim_id', selected.id).order('created_at', { ascending: false });
    if (data) setInfoRequests(data as InfoRequest[]);
    setUploading(false);
  }

  const name = user?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="max-w-[860px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="text-xl font-extrabold">{t('dashboard.title')}</div>
          <div className="text-[13px] text-[#64748b]">
            {user ? `${t('dashboard.welcome')}, ${name}` : t('dashboard.signin_prompt')}
          </div>
        </div>
        <button
          onClick={() => onNav('claim')}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-[10px] text-xs font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('dashboard.new_claim')}
        </button>
      </div>

      {/* Not signed in */}
      {!user && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 text-center">
          <div className="w-12 h-12 bg-[#eff6ff] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane className="w-6 h-6 text-[#2563eb]" />
          </div>
          <div className="font-bold text-[15px] mb-2">{t('dashboard.signin_prompt')}</div>
          <div className="text-[13px] text-[#64748b] mb-5">{t('dashboard.signin_sub')}</div>
          <div className="flex gap-2.5 justify-center">
            <button onClick={() => onNav('signin')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[10px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">{t('signin.btn.signin')}</button>
            <button onClick={() => onNav('claim')} className="px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[10px] text-[13px] font-semibold cursor-pointer hover:bg-[#e2e8f0]">{t('nav.claim')}</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {user && loading && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 flex items-center justify-center gap-2 text-[#64748b] text-[13px]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading your claims...
        </div>
      )}

      {/* No claims */}
      {user && !loading && claims.length === 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-10 text-center">
          <div className="w-12 h-12 bg-[#f0fdf4] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plane className="w-6 h-6 text-[#16a34a]" />
          </div>
          <div className="font-bold text-[15px] mb-2">{t('dashboard.no_claims')}</div>
          <div className="text-[13px] text-[#64748b] mb-5">{t('dashboard.no_claims_sub')}</div>
          <button onClick={() => onNav('claim')} className="px-4 py-2 bg-[#2563eb] text-white rounded-[10px] text-[13px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]">{t('dashboard.start')}</button>
        </div>
      )}

      {/* Claims list + detail */}
      {user && !loading && claims.length > 0 && (
        <div className="flex flex-col md:flex-row gap-4">

          {/* List — hidden on mobile when a claim is selected */}
          <div className={`md:w-[260px] md:shrink-0 flex flex-col gap-2 ${selected ? 'hidden md:flex' : 'flex'}`}>
            {claims.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3.5 rounded-[10px] border cursor-pointer transition-all ${
                  selected?.id === c.id
                    ? 'bg-[#eff6ff] border-[#2563eb]'
                    : 'bg-white border-[#e2e8f0] hover:border-[#93c5fd]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-[#2563eb]">{c.claim_ref}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </div>
                <div className="font-semibold text-[12px] text-[#0f172a] truncate">{c.airline}</div>
                <div className="text-[11px] text-[#64748b]">{c.departure} → {c.arrival}</div>
                <div className="text-[10px] text-[#94a3b8] mt-1">{c.created_at?.split('T')[0]}</div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="flex-1 bg-white border border-[#e2e8f0] rounded-[14px] p-4 sm:p-6 min-w-0">
              {/* Back button on mobile */}
              <button
                onClick={() => setSelected(null)}
                className="md:hidden mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#2563eb] bg-transparent border-none cursor-pointer p-0"
              >
                {t('dashboard.back')}
              </button>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[11px] text-[#64748b] mb-0.5">{selected.claim_ref}</div>
                  <div className="font-bold text-[16px] text-[#0f172a]">
                    {selected.airline} · {selected.flight_number || '—'}
                  </div>
                  <div className="text-[13px] text-[#64748b] mt-0.5">
                    {selected.departure} → {selected.arrival}
                    {selected.flight_date && ` · ${selected.flight_date}`}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-[10px] text-[11px] font-semibold ${STATUS_STYLE[selected.status]}`}>
                    {selected.status}
                  </span>
                  {selected.eligibility_status && (
                    <div className="mt-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-[8px] text-[10px] font-semibold ${STATUS_STYLE[selected.eligibility_status as ClaimStatus] || 'bg-[#f8fafc] text-[#64748b]'}`}>
                        {selected.eligibility_status}
                      </span>
                    </div>
                  )}
                  <div className="text-[11px] font-bold text-[#16a34a] mt-1.5">{selected.amount}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5 p-3 sm:p-3.5 bg-[#f8fafc] rounded-[10px]">
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">{t('dashboard.filed')}</div>
                  <div className="text-[11px] sm:text-[12px] font-semibold">{selected.created_at?.split('T')[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">{t('dashboard.issue')}</div>
                  <div className="text-[11px] sm:text-[12px] font-semibold truncate">{selected.issue_type || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748b] mb-0.5">{t('dashboard.loa')}</div>
                  <div className={`text-[11px] sm:text-[12px] font-semibold ${selected.loa_signed ? 'text-[#16a34a]' : 'text-[#d97706]'}`}>
                    {selected.loa_signed ? t('dashboard.loa_signed') : t('dashboard.loa_unsigned')}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1">{t('dashboard.progress')}</div>
              <ClaimTimeline status={selected.status} />

              {/* Info Requests */}
              {infoRequests.length > 0 && (
                <div className="mt-5">
                  <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Information Requests</div>
                  <div className="space-y-2.5">
                    {infoRequests.map(req => {
                      const isOverdue = req.status === 'requested' && req.due_at && new Date(req.due_at).getTime() < Date.now();
                      const displayStatus = isOverdue ? 'overdue' : req.status;
                      const statusMeta: Record<string, { icon: typeof Clock; bg: string; text: string; label: string }> = {
                        requested: { icon: Clock, bg: 'bg-[#eff6ff]', text: 'text-[#2563eb]', label: 'Awaiting your response' },
                        received:  { icon: CheckCircle, bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]', label: 'Received — thank you!' },
                        overdue:   { icon: AlertTriangle, bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]', label: 'Overdue — please respond' },
                        cancelled: { icon: CheckCircle, bg: 'bg-[#f8fafc]', text: 'text-[#64748b]', label: 'Cancelled' },
                      };
                      const meta = statusMeta[displayStatus] || statusMeta.requested;
                      const StatusIcon = meta.icon;

                      return (
                        <div key={req.id} className="p-3.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-[10px]">
                          <div className="flex items-start gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                              <StatusIcon className={`w-3.5 h-3.5 ${meta.text}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[#0f172a]">{req.title}</div>
                              <div className={`text-[11px] font-medium mt-0.5 ${meta.text}`}>{meta.label}</div>
                              {req.description && (
                                <div className="text-[12px] text-[#64748b] mt-1.5">{req.description}</div>
                              )}
                              {req.due_at && req.status === 'requested' && (
                                <div className="text-[11px] text-[#94a3b8] mt-1">
                                  Due: {new Date(req.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                                </div>
                              )}
                              {req.status === 'requested' && (
                                <div className="mt-2.5">
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={e => {
                                      const f = e.target.files?.[0];
                                      if (f) uploadResponseFile(f, req.id);
                                      e.target.value = '';
                                    }}
                                  />
                                  <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[12px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    {uploading ? 'Uploading...' : req.request_type === 'document' ? 'Upload Document' : 'Provide Information'}
                                  </button>
                                </div>
                              )}
                              {req.fulfilled_at && (
                                <div className="text-[11px] text-[#16a34a] mt-1.5 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Received on {new Date(req.fulfilled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Customer Messages */}
              <CustomerMessages claim={selected} user={user} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
