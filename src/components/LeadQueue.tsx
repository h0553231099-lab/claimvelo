import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Lead, LeadStatus, LeadFlightSegment, ImportBatch } from '../types';
import { Search, ChevronDown, ChevronRight, Plane, AlertTriangle, Calendar, User, Mail, Phone, Tag, Layers, FileSpreadsheet } from 'lucide-react';

interface WorkerProfile {
  id: string;
  email: string;
  full_name: string;
  agent_code: string;
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  READY: 'bg-[#f0fdf4] text-[#16a34a]',
  WARNING: 'bg-[#fffbeb] text-[#d97706]',
  REVIEW: 'bg-[#fef2f2] text-[#dc2626]',
  FUTURE: 'bg-[#eff6ff] text-[#2563eb]',
  DUPLICATE: 'bg-[#f1f5f9] text-[#64748b]',
};

interface Props {
  workers: WorkerProfile[];
}

export default function LeadQueue({ workers }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [segmentsByLead, setSegmentsByLead] = useState<Record<string, LeadFlightSegment[]>>({});

  const loadLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (batchFilter) query = query.eq('batch_id', batchFilter);
    const { data } = await query;
    setLeads((data as Lead[]) || []);
    setLoading(false);
  }, [statusFilter, batchFilter]);

  const loadBatches = useCallback(async () => {
    const { data } = await supabase
      .from('import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setBatches((data as ImportBatch[]) || []);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  async function toggleLead(leadId: string) {
    if (expandedLead === leadId) {
      setExpandedLead(null);
      return;
    }
    setExpandedLead(leadId);
    if (!segmentsByLead[leadId]) {
      const { data } = await supabase
        .from('lead_flight_segments')
        .select('*')
        .eq('lead_id', leadId)
        .order('segment_order', { ascending: true });
      setSegmentsByLead(prev => ({ ...prev, [leadId]: (data as LeadFlightSegment[]) || [] }));
    }
  }

  const filtered = search.trim()
    ? leads.filter(l => {
        const q = search.toLowerCase();
        return (
          l.passenger_first_name?.toLowerCase().includes(q) ||
          l.passenger_last_name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          l.booking_reference?.toLowerCase().includes(q) ||
          l.route?.toLowerCase().includes(q) ||
          l.agent_code?.toLowerCase().includes(q)
        );
      })
    : leads;

  const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(['READY', 'WARNING', 'REVIEW', 'FUTURE', 'DUPLICATE'] as LeadStatus[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`text-left bg-white border rounded-[10px] p-2.5 transition-all cursor-pointer ${
              statusFilter === s ? 'border-[#2563eb] ring-1 ring-[#2563eb]' : 'border-[#e2e8f0] hover:border-[#cbd5e1]'
            }`}
          >
            <div className={`inline-flex px-1.5 py-0.5 rounded-[6px] text-[9px] font-bold ${STATUS_STYLES[s]}`}>{s}</div>
            <div className="font-bold text-[18px] mt-1">{statusCounts[s] || 0}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white border border-[#e2e8f0] rounded-[10px] p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-[#94a3b8] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search passenger, email, PNR, route..."
            className="w-full pl-8 pr-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none focus:border-[#2563eb]"
          />
        </div>
        <select
          value={batchFilter}
          onChange={e => setBatchFilter(e.target.value)}
          className="px-2.5 py-2 border border-[#e2e8f0] rounded-[8px] text-[12px] outline-none bg-white cursor-pointer"
        >
          <option value="">All batches</option>
          {batches.map(b => (
            <option key={b.id} value={b.id}>{b.file_name || b.id.slice(0, 8)} · {new Date(b.created_at).toLocaleDateString()}</option>
          ))}
        </select>
        {(statusFilter || batchFilter || search) && (
          <button
            onClick={() => { setStatusFilter(''); setBatchFilter(''); setSearch(''); }}
            className="px-2.5 py-2 text-[#64748b] hover:text-[#0f172a] text-[12px] cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Lead list */}
      {loading ? (
        <div className="text-center text-[12px] text-[#64748b] py-8">Loading leads...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[12px] text-[#64748b] py-8 bg-white border border-[#e2e8f0] rounded-[10px]">
          No leads found. Import an Excel file to create leads.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(lead => {
            const agent = lead.agent_code && lead.agent_code !== '—'
              ? workers.find(w => w.agent_code === lead.agent_code) : null;
            const expanded = expandedLead === lead.id;
            const segs = segmentsByLead[lead.id] || [];
            return (
              <div key={lead.id} className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
                <button
                  onClick={() => toggleLead(lead.id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[#f8fafc] cursor-pointer flex items-center gap-2"
                >
                  {expanded ? <ChevronDown className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />}
                  <span className={`inline-flex px-1.5 py-0.5 rounded-[6px] text-[9px] font-bold shrink-0 ${STATUS_STYLES[lead.status]}`}>{lead.status}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[12px] text-[#0f172a] truncate">
                        {lead.passenger_first_name} {lead.passenger_last_name}
                      </span>
                      <span className="text-[10px] text-[#64748b] font-mono shrink-0">{lead.booking_reference}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#64748b] mt-0.5">
                      <span className="flex items-center gap-0.5"><Plane className="w-3 h-3" />{lead.route || '—'}</span>
                      <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{lead.first_flight_date || '—'}</span>
                      <span className="flex items-center gap-0.5"><Layers className="w-3 h-3" />{lead.segment_count} seg</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {agent && <div className="text-[10px] text-[#2563eb] font-semibold">{agent.full_name}</div>}
                    {!lead.email && !lead.phone && <span className="text-[9px] text-[#d97706]">no contact</span>}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-[#e2e8f0] px-3 py-3 bg-[#f8fafc]/50 space-y-2.5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5"><User className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">Passenger:</span><span className="font-medium">{lead.passenger_first_name} {lead.passenger_last_name}</span></div>
                      <div className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">PNR:</span><span className="font-mono font-medium">{lead.booking_reference}</span></div>
                      <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">Email:</span><span className="font-medium">{lead.email || <span className="text-[#d97706]">missing</span>}</span></div>
                      <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">Phone:</span><span className="font-medium">{lead.phone || <span className="text-[#d97706]">missing</span>}</span></div>
                      <div className="flex items-center gap-1.5"><FileSpreadsheet className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">Agent:</span><span className="font-medium">{lead.agent_code !== '—' ? lead.agent_code : 'unassigned'}</span></div>
                      <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-[#94a3b8]" /><span className="text-[#64748b]">Imported:</span><span className="font-medium">{new Date(lead.created_at).toLocaleString()}</span></div>
                    </div>

                    {lead.review_reason && (
                      <div className="flex items-start gap-1.5 text-[11px] text-[#d97706] bg-[#fffbeb] border border-[#fde68a] rounded-[8px] px-2.5 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{lead.review_reason}</span>
                      </div>
                    )}

                    {/* Segments */}
                    <div>
                      <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5">Flight Segments ({segs.length || lead.segment_count})</div>
                      {segs.length === 0 ? (
                        <div className="text-[11px] text-[#94a3b8]">Loading segments...</div>
                      ) : (
                        <div className="space-y-1">
                          {segs.map(s => (
                            <div key={s.id} className="flex items-center gap-2 bg-white border border-[#e2e8f0] rounded-[8px] px-2.5 py-1.5 text-[11px]">
                              <span className="bg-[#eff6ff] text-[#2563eb] font-bold rounded-[6px] px-1.5 py-0.5 text-[9px] shrink-0">{s.segment_order}</span>
                              <span className="font-semibold">{s.flight_number}</span>
                              <span className="text-[#64748b]">{s.flight_date}</span>
                              <span className="font-mono text-[#64748b]">{s.origin}→{s.destination}</span>
                              {s.delay_minutes != null && <span className="text-[#d97706] font-medium">{s.delay_minutes}m</span>}
                              {s.delay_reason && <span className="text-[#94a3b8] truncate">· {s.delay_reason}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] text-[#94a3b8] text-center">{filtered.length} leads{filtered.length !== leads.length && ` (of ${leads.length})`}</div>
    </div>
  );
}
