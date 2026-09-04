import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, UserCog, CheckCircle, Clock, AlertCircle, ThumbsUp, ThumbsDown, ArrowUpCircle, FileText, ExternalLink, Gauge } from 'lucide-react';
import type { ReviewNote } from '../types';

interface FlightEvidence {
  claim_id: string;
  data_source: string | null;
  delay_minutes: number | null;
  flight_status: string | null;
  cross_check_status: string | null;
  cross_check_details: Record<string, unknown> | null;
  decision: string | null;
  decision_reason: string | null;
  operating_carrier: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
  confidence_score: number | null;
}

interface ReviewClaim {
  id: string;
  claim_ref: string;
  flight_number: string;
  flight_date: string;
  departure: string;
  arrival: string;
  issue_type: string;
  airline_reason: string;
  status: string;
  review_reason_code: string;
  review_assigned_to: string | null;
  review_status: string | null;
  review_decision: string | null;
  review_decision_reason: string | null;
  review_decided_at: string | null;
  jurisdiction: string;
  operating_carrier: string;
  operating_carrier_name: string;
  operating_carrier_source: string;
  email: string;
  passenger_first_name: string;
  passenger_last_name: string;
  created_at: string;
  airline: string;
}

interface WorkerProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Props {
  onOpenClaim?: (claimId: string) => void;
}

const REVIEW_REASONS: Record<string, string> = {
  NO_PROVIDER_DATA: 'No Provider Data',
  FLIGHT_MISMATCH: 'Flight Mismatch',
  PROVIDER_CONFLICT: 'Provider Conflict',
  PROVIDER_CARRIER_CONFLICT: 'Carrier Conflict',
  CANCELLED_MISSING_NOTICE: 'Cancelled — Missing Notice',
  CANCELLED_REPLACEMENT_UNVERIFIED: 'Cancelled — Replacement Unverified',
  CANCELLED_PASSENGER_DECLINED: 'Cancelled — Passenger Declined',
  DENIED_BOARDING_INCOMPLETE: 'Denied Boarding — Incomplete',
  DENIED_BOARDING_REQUIRES_EVIDENCE: 'Denied Boarding — Needs Evidence',
  JURISDICTION_UNKNOWN_CARRIER: 'Unknown Carrier Jurisdiction',
  EXTRAORDINARY_CIRCUMSTANCES: 'Extraordinary Circumstances',
  INCOMPLETE_EVIDENCE: 'Incomplete Evidence',
  COORDS_UNAVAILABLE: 'Coordinates Unavailable',
  CONNECTING_MISSING_SEGMENT_DATA: 'Connecting — Missing Segment',
  BRAZIL_MANUAL_REVIEW: 'Brazil — Manual Review',
};

// SLA thresholds in hours from claim creation
const SLA_THRESHOLDS = { warning: 48, overdue: 72 };

function getSlaStatus(createdAt: string): { label: string; color: string; hours: number } {
  const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  if (hours >= SLA_THRESHOLDS.overdue) return { label: 'Overdue', color: 'text-[#dc2626] bg-[#fef2f2]', hours };
  if (hours >= SLA_THRESHOLDS.warning) return { label: 'Approaching', color: 'text-[#ea580c] bg-[#fff7ed]', hours };
  return { label: 'On Track', color: 'text-[#16a34a] bg-[#f0fdf4]', hours };
}

function confidenceColor(score: number): string {
  if (score >= 80) return 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]';
  if (score >= 50) return 'text-[#ea580c] bg-[#fff7ed] border-[#fed7aa]';
  return 'text-[#dc2626] bg-[#fef2f2] border-[#fecaca]';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ReviewQueue({ onOpenClaim }: Props) {
  const [claims, setClaims] = useState<ReviewClaim[]>([]);
  const [evidence, setEvidence] = useState<Record<string, FlightEvidence>>({});
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReviewClaim | null>(null);
  const [filterReason, setFilterReason] = useState('');
  const [filterSla, setFilterSla] = useState('');
  const [search, setSearch] = useState('');

  // Review notes
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Review decision
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);

  useEffect(() => {
    loadClaims();
    loadWorkers();
  }, []);

  useEffect(() => {
    if (selected) {
      loadNotes(selected.id);
      setDecisionReason(selected.review_decision_reason || '');
    } else {
      setNotes([]);
      setNewNote('');
      setDecisionReason('');
    }
  }, [selected?.id]);

  async function loadClaims() {
    setLoading(true);
    const { data } = await supabase
      .from('claims')
      .select('id, claim_ref, flight_number, flight_date, departure, arrival, issue_type, airline_reason, status, review_reason_code, review_assigned_to, review_status, review_decision, review_decision_reason, review_decided_at, jurisdiction, operating_carrier, operating_carrier_name, operating_carrier_source, email, passenger_first_name, passenger_last_name, created_at, airline')
      .eq('eligibility_status', 'Pending Check')
      .order('created_at', { ascending: false });
    if (data) setClaims(data as ReviewClaim[]);

    if (data && data.length > 0) {
      const claimIds = data.map((c: ReviewClaim) => c.id);
      const { data: evData } = await supabase
        .from('flight_evidence')
        .select('claim_id, data_source, delay_minutes, flight_status, cross_check_status, cross_check_details, decision, decision_reason, scheduled_arrival, actual_arrival, confidence_score')
        .in('claim_id', claimIds);
      if (evData) {
        const evMap: Record<string, FlightEvidence> = {};
        for (const ev of evData as FlightEvidence[]) {
          evMap[ev.claim_id] = ev;
        }
        setEvidence(evMap);
      }
    }
    setLoading(false);
  }

  async function loadWorkers() {
    const { data } = await supabase
      .from('worker_profiles')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'super_admin', 'worker']);
    if (data) setWorkers(data as WorkerProfile[]);
  }

  async function loadNotes(claimId: string) {
    setNotesLoading(true);
    const { data } = await supabase
      .from('review_notes')
      .select('id, claim_id, note, created_by, created_at')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false });
    // Resolve author names
    let notesWithNames = (data || []) as ReviewNote[];
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(n => n.created_by).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        const nameMap: Record<string, string> = {};
        for (const p of (profiles || [])) nameMap[p.id] = p.full_name;
        notesWithNames = notesWithNames.map(n => ({ ...n, author_name: n.created_by ? nameMap[n.created_by] || null : null }));
      }
    }
    setNotes(notesWithNames);
    setNotesLoading(false);
  }

  async function addNote() {
    if (!selected || !newNote.trim()) return;
    setNoteSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('review_notes')
      .insert({ claim_id: selected.id, note: newNote.trim(), created_by: user?.id })
      .select('id, claim_id, note, created_by, created_at')
      .single();
    if (data) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single();
      setNotes(prev => [{ ...data, author_name: profile?.full_name || null }, ...prev]);
      setNewNote('');
    }
    setNoteSaving(false);
  }

  async function assignClaim(claimId: string, workerId: string) {
    await supabase.from('claims').update({
      review_assigned_to: workerId || null,
      review_status: workerId ? 'in_review' : 'pending',
    }).eq('id', claimId);
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, review_assigned_to: workerId || null, review_status: workerId ? 'in_review' : 'pending' } : c));
    if (selected?.id === claimId) setSelected(prev => prev ? { ...prev, review_assigned_to: workerId || null, review_status: workerId ? 'in_review' : 'pending' } : null);
  }

  async function setReviewStatus(claimId: string, status: string) {
    await supabase.from('claims').update({
      review_status: status,
      review_completed_at: status === 'completed' ? new Date().toISOString() : null,
    }).eq('id', claimId);
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, review_status: status } : c));
    if (selected?.id === claimId) setSelected(prev => prev ? { ...prev, review_status: status } : null);
  }

  async function submitDecision(decision: 'approved' | 'rejected' | 'escalated') {
    if (!selected) return;
    setDecisionSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('claims').update({
      review_decision: decision,
      review_decision_reason: decisionReason.trim() || null,
      review_decided_by: user?.id,
      review_decided_at: new Date().toISOString(),
      review_status: 'completed',
      review_completed_at: new Date().toISOString(),
    }).eq('id', selected.id);
    setClaims(prev => prev.map(c => c.id === selected.id ? { ...c, review_decision: decision, review_decision_reason: decisionReason.trim() || null, review_decided_at: new Date().toISOString(), review_status: 'completed' } : c));
    setSelected(prev => prev ? { ...prev, review_decision: decision, review_decision_reason: decisionReason.trim() || null, review_decided_at: new Date().toISOString(), review_status: 'completed' } : null);
    setDecisionSaving(false);
  }

  const filtered = claims.filter(c => {
    if (filterReason && c.review_reason_code !== filterReason) return false;
    if (filterSla) {
      const sla = getSlaStatus(c.created_at);
      if (filterSla === 'overdue' && sla.label !== 'Overdue') return false;
      if (filterSla === 'warning' && sla.label !== 'Approaching') return false;
      if (filterSla === 'ontrack' && sla.label !== 'On Track') return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (![c.claim_ref, c.flight_number, c.email, c.passenger_first_name, c.passenger_last_name].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selectedEvidence = selected ? evidence[selected.id] : null;
  const checklist = selectedEvidence?.cross_check_details as Record<string, unknown> | null;
  const checklistItems = Array.isArray(checklist?.checklist) ? (checklist!.checklist as Array<{ item: string; status: string }>) : [];
  const selectedSla = selected ? getSlaStatus(selected.created_at) : null;

  return (
    <div className="flex h-full bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
      {/* Left: claim list */}
      <div className={`flex flex-col border-r border-[#e2e8f0] ${selected ? 'w-[340px] shrink-0' : 'flex-1'}`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-[#ea580c]" />
            <span className="font-bold text-[14px] text-[#0f172a]">Review Queue</span>
            <span className="ml-auto text-[11px] font-semibold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[120px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94a3b8]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-3 py-1.5 bg-white border border-[#e2e8f0] rounded-lg text-xs outline-none focus:border-[#2563eb]"
              />
            </div>
            <select
              value={filterReason}
              onChange={e => setFilterReason(e.target.value)}
              className="px-2 py-1.5 bg-white border border-[#e2e8f0] rounded-lg text-xs outline-none focus:border-[#2563eb] cursor-pointer"
            >
              <option value="">All reasons</option>
              {Object.entries(REVIEW_REASONS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <select
              value={filterSla}
              onChange={e => setFilterSla(e.target.value)}
              className="px-2 py-1.5 bg-white border border-[#e2e8f0] rounded-lg text-xs outline-none focus:border-[#2563eb] cursor-pointer"
            >
              <option value="">All SLA</option>
              <option value="ontrack">On Track</option>
              <option value="warning">Approaching</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f1f5f9]">
          {loading ? (
            <div className="p-6 text-center text-[#94a3b8] text-[12px]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-8 h-8 text-[#e2e8f0] mx-auto mb-2" />
              <div className="text-[12px] text-[#94a3b8]">No claims pending review.</div>
            </div>
          ) : filtered.map(c => {
            const sla = getSlaStatus(c.created_at);
            const ev = evidence[c.id];
            return (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              className={`px-3 py-3 cursor-pointer transition-colors hover:bg-[#f8fafc] ${selected?.id === c.id ? 'bg-[#eff6ff]' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold text-[#0f172a]">{c.claim_ref}</span>
                <div className="flex items-center gap-1">
                  {ev?.confidence_score != null && (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${confidenceColor(ev.confidence_score)}`}>
                      <Gauge className="w-2.5 h-2.5" />{ev.confidence_score}
                    </span>
                  )}
                  <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${sla.color}`}>{sla.hours}h</span>
                </div>
              </div>
              <div className="text-[11px] text-[#64748b] mb-0.5">{c.flight_number} · {c.departure} → {c.arrival}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#94a3b8]">
                  {c.review_reason_code ? (REVIEW_REASONS[c.review_reason_code] || c.review_reason_code) : 'No reason code'}
                </span>
                {c.review_status === 'in_review' && <span className="text-[9px] font-bold text-[#2563eb] bg-[#eff6ff] px-1.5 py-0.5 rounded-full">IN REVIEW</span>}
                {c.review_status === 'completed' && <span className="text-[9px] font-bold text-[#16a34a] bg-[#f0fdf4] px-1.5 py-0.5 rounded-full">DONE</span>}
                {c.review_decision && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.review_decision === 'approved' ? 'text-[#16a34a] bg-[#f0fdf4]' : c.review_decision === 'rejected' ? 'text-[#dc2626] bg-[#fef2f2]' : 'text-[#ea580c] bg-[#fff7ed]'}`}>
                    {c.review_decision.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <div className="font-bold text-[14px] text-[#0f172a]">{selected.claim_ref}</div>
              <div className="text-[11px] text-[#64748b]">{selected.passenger_first_name} {selected.passenger_last_name} · {selected.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {onOpenClaim && (
                <button
                  onClick={() => onOpenClaim(selected.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8]"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Detail
                </button>
              )}
              <button onClick={() => setSelected(null)} className="text-[#94a3b8] hover:text-[#64748b] cursor-pointer border-none bg-transparent">✕</button>
            </div>
          </div>

          <div className="flex-1 p-5 flex flex-col gap-4">
            {/* SLA / Aging */}
            {selectedSla && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                <Clock className="w-4 h-4 text-[#64748b] shrink-0" />
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Review Aging / SLA</div>
                  <div className="text-[12px] text-[#0f172a]">
                    Created {timeAgo(selected.created_at)} · {selectedSla.hours}h elapsed
                  </div>
                </div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${selectedSla.color}`}>
                  {selectedSla.label}
                </span>
              </div>
            )}

            {/* Flight info */}
            <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
              <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Flight</div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div><span className="text-[#94a3b8]">Number:</span> <span className="font-semibold text-[#0f172a]">{selected.flight_number}</span></div>
                <div><span className="text-[#94a3b8]">Date:</span> <span className="font-semibold text-[#0f172a]">{selected.flight_date}</span></div>
                <div><span className="text-[#94a3b8]">Route:</span> <span className="font-semibold text-[#0f172a]">{selected.departure} → {selected.arrival}</span></div>
                <div><span className="text-[#94a3b8]">Issue:</span> <span className="font-semibold text-[#0f172a]">{selected.issue_type}</span></div>
              </div>
            </div>

            {/* Jurisdiction + carrier */}
            <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
              <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Jurisdiction & Carrier</div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div><span className="text-[#94a3b8]">Jurisdiction:</span> <span className="font-semibold text-[#0f172a]">{selected.jurisdiction || '—'}</span></div>
                <div><span className="text-[#94a3b8]">Operating carrier:</span> <span className="font-semibold text-[#0f172a]">{selected.operating_carrier || '—'}</span></div>
                <div><span className="text-[#94a3b8]">Carrier name:</span> <span className="font-semibold text-[#0f172a]">{selected.operating_carrier_name || '—'}</span></div>
                <div><span className="text-[#94a3b8]">Source:</span> <span className="font-semibold text-[#0f172a]">{selected.operating_carrier_source || '—'}</span></div>
              </div>
            </div>

            {/* Evidence summary with confidence score */}
            {selectedEvidence && (
              <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Flight Evidence</div>
                  {selectedEvidence.confidence_score != null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${confidenceColor(selectedEvidence.confidence_score)}`}>
                      <Gauge className="w-3 h-3" /> Confidence: {selectedEvidence.confidence_score}/100
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
                  <div><span className="text-[#94a3b8]">Data source:</span> <span className="font-semibold text-[#0f172a]">{selectedEvidence.data_source || '—'}</span></div>
                  <div><span className="text-[#94a3b8]">Delay:</span> <span className="font-semibold text-[#0f172a]">{selectedEvidence.delay_minutes != null ? `${selectedEvidence.delay_minutes}min` : '—'}</span></div>
                  <div><span className="text-[#94a3b8]">Status:</span> <span className="font-semibold text-[#0f172a]">{selectedEvidence.flight_status || '—'}</span></div>
                  <div><span className="text-[#94a3b8]">Cross-check:</span> <span className="font-semibold text-[#0f172a]">{selectedEvidence.cross_check_status || '—'}</span></div>
                </div>
                {/* Evidence checklist */}
                {checklistItems.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Evidence Checklist</div>
                    <div className="flex flex-col gap-1">
                      {checklistItems.map(item => (
                        <div key={item.item} className="flex items-center gap-2 text-[11px]">
                          {item.status === 'passed' ? <CheckCircle className="w-3 h-3 text-[#16a34a]" /> : item.status === 'missing' ? <AlertCircle className="w-3 h-3 text-[#dc2626]" /> : <Clock className="w-3 h-3 text-[#94a3b8]" />}
                          <span className={item.status === 'passed' ? 'text-[#16a34a]' : item.status === 'missing' ? 'text-[#dc2626]' : 'text-[#94a3b8]'}>
                            {item.item.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Decision reason */}
                {selectedEvidence.decision_reason && (
                  <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
                    <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">Decision Reason</div>
                    <div className="text-[11px] text-[#374151]">{selectedEvidence.decision_reason}</div>
                  </div>
                )}
              </div>
            )}

            {/* Staff assignment */}
            <div className="border border-[#e2e8f0] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <UserCog className="w-3.5 h-3.5 text-[#64748b]" />
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Staff Assignment</span>
              </div>
              <select
                value={selected.review_assigned_to || ''}
                onChange={e => assignClaim(selected.id, e.target.value)}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] bg-white cursor-pointer mb-2"
              >
                <option value="">Unassigned</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.full_name} ({w.email})</option>
                ))}
              </select>
              {/* Review status */}
              <div className="flex gap-2">
                {[
                  { val: 'pending', label: 'Pending', color: 'text-[#ea580c] bg-[#fff7ed] border-[#fed7aa]' },
                  { val: 'in_review', label: 'In Review', color: 'text-[#2563eb] bg-[#eff6ff] border-[#dbeafe]' },
                  { val: 'completed', label: 'Completed', color: 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]' },
                ].map(({ val, label, color }) => (
                  <button
                    key={val}
                    onClick={() => setReviewStatus(selected.id, val)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all ${selected.review_status === val ? color : 'text-[#94a3b8] bg-white border-[#e2e8f0] hover:border-[#cbd5e1]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Review decision workflow */}
            <div className="border border-[#e2e8f0] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-3.5 h-3.5 text-[#64748b]" />
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Review Decision</span>
                {selected.review_decision && (
                  <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full ${selected.review_decision === 'approved' ? 'text-[#16a34a] bg-[#f0fdf4]' : selected.review_decision === 'rejected' ? 'text-[#dc2626] bg-[#fef2f2]' : 'text-[#ea580c] bg-[#fff7ed]'}`}>
                    {selected.review_decision.toUpperCase()}
                    {selected.review_decided_at && ` · ${timeAgo(selected.review_decided_at)}`}
                  </span>
                )}
              </div>
              <textarea
                value={decisionReason}
                onChange={e => setDecisionReason(e.target.value)}
                placeholder="Decision reason (optional)..."
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb] resize-none mb-2 min-h-[60px]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submitDecision('approved')}
                  disabled={decisionSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#16a34a] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#15803d] disabled:opacity-60"
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => submitDecision('rejected')}
                  disabled={decisionSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#dc2626] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#b91c1c] disabled:opacity-60"
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Reject
                </button>
                <button
                  onClick={() => submitDecision('escalated')}
                  disabled={decisionSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#ea580c] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#c2410c] disabled:opacity-60"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" /> Escalate
                </button>
              </div>
            </div>

            {/* Review notes */}
            <div className="border border-[#e2e8f0] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-[#64748b]" />
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Review Notes</span>
                {notes.length > 0 && <span className="text-[9px] font-semibold text-[#64748b] bg-[#f1f5f9] px-1.5 py-0.5 rounded-full">{notes.length}</span>}
              </div>
              {/* Add note */}
              <div className="flex gap-2 mb-3">
                <input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-1.5 border border-[#e2e8f0] rounded-lg text-[12px] outline-none focus:border-[#2563eb]"
                />
                <button
                  onClick={addNote}
                  disabled={noteSaving || !newNote.trim()}
                  className="px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-[11px] font-semibold border-none cursor-pointer hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {noteSaving ? '...' : 'Add'}
                </button>
              </div>
              {/* Notes list */}
              {notesLoading ? (
                <div className="text-[11px] text-[#94a3b8]">Loading notes...</div>
              ) : notes.length === 0 ? (
                <div className="text-[11px] text-[#94a3b8] italic">No notes yet.</div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                  {notes.map(n => (
                    <div key={n.id} className="px-3 py-2 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                      <div className="text-[12px] text-[#374151]">{n.note}</div>
                      <div className="text-[10px] text-[#94a3b8] mt-1">
                        {n.author_name || 'Unknown'} · {timeAgo(n.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-[#e2e8f0] mx-auto mb-2" />
            <div className="text-[13px] text-[#94a3b8]">Select a claim to review</div>
          </div>
        </div>
      )}
    </div>
  );
}
