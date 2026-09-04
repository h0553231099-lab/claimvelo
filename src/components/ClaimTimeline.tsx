import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ClaimStatusHistory, ClaimFile, UserProfile } from '../types';
import {
  PlusCircle, ArrowUpRight, ShieldCheck, Flag, UserCheck,
  CheckCircle, UserCog, FileText, Gavel, Clock,
} from 'lucide-react';

// ── Event types ─────────────────────────────────────────────────────────────
type EventType =
  | 'created' | 'status' | 'eligibility' | 'priority' | 'assignment'
  | 'review_status' | 'review_assignment' | 'document' | 'override';

interface TimelineEvent {
  id: string;
  type: EventType;
  label: string;
  timestamp: string;
  actor?: string;
  details?: string;
}

interface Props {
  claimId: string;
  claimCreatedAt: string;
  claimFiles: ClaimFile[];
  isAdmin: boolean;
  workers: { id: string; full_name: string }[];
  currentUser?: UserProfile;
  refreshKey: number;
}

const EVENT_ICON: Record<EventType, typeof PlusCircle> = {
  created: PlusCircle,
  status: ArrowUpRight,
  eligibility: ShieldCheck,
  priority: Flag,
  assignment: UserCheck,
  review_status: CheckCircle,
  review_assignment: UserCog,
  document: FileText,
  override: Gavel,
};

const EVENT_COLOR: Record<EventType, string> = {
  created: '#2563eb',
  status: '#2563eb',
  eligibility: '#059669',
  priority: '#ea580c',
  assignment: '#6366f1',
  review_status: '#7c3aed',
  review_assignment: '#7c3aed',
  document: '#64748b',
  override: '#d97706',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ClaimTimeline({
  claimId, claimCreatedAt, claimFiles, isAdmin, workers, currentUser, refreshKey,
}: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId, refreshKey]);

  function resolveName(uuid: string | null): string | undefined {
    if (!uuid) return undefined;
    if (uuid === currentUser?.id) return currentUser?.full_name || 'You';
    const w = workers.find(w => w.id === uuid);
    return w?.full_name || undefined;
  }

  function sourceLabel(source: string): string {
    if (source === 'staff') return 'Staff';
    if (source === 'insert') return 'Created';
    return 'System';
  }

  async function loadTimeline() {
    setLoading(true);
    const all: TimelineEvent[] = [];

    // 1. Claim creation (from the claim row itself)
    all.push({
      id: 'claim-created',
      type: 'created',
      label: 'Claim created',
      timestamp: claimCreatedAt,
    });

    // 2. Status history — status, eligibility, priority, assignment, review
    const { data: history } = await supabase
      .from('claim_status_history')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });

    if (history) {
      for (const h of history as ClaimStatusHistory[]) {
        // Skip the initial status insert — the "Claim created" event covers it
        if (h.source === 'insert' && h.field_name === 'status') continue;

        const actor = h.source === 'staff' ? resolveName(h.changed_by) : sourceLabel(h.source);
        const fromVal = h.from_status || '—';
        const toVal = h.to_status || '—';

        let type: EventType;
        let label: string;

        switch (h.field_name) {
          case 'status':
            type = 'status';
            label = `Status: ${fromVal} → ${toVal}`;
            break;
          case 'eligibility_status':
            type = 'eligibility';
            label = `Eligibility: ${fromVal} → ${toVal}`;
            break;
          case 'priority':
            type = 'priority';
            label = `Priority: ${fromVal} → ${toVal}`;
            break;
          case 'assigned_to': {
            type = 'assignment';
            const fromName = h.from_status ? resolveName(h.from_status) : null;
            const toName = h.to_status ? resolveName(h.to_status) : null;
            label = `Assignment: ${fromName || 'Unassigned'} → ${toName || 'Unassigned'}`;
            break;
          }
          case 'review_status':
            type = 'review_status';
            label = `Review status: ${fromVal} → ${toVal}`;
            break;
          case 'review_assigned_to': {
            type = 'review_assignment';
            const fromName = h.from_status ? resolveName(h.from_status) : null;
            const toName = h.to_status ? resolveName(h.to_status) : null;
            label = `Review assigned: ${fromName || 'Unassigned'} → ${toName || 'Unassigned'}`;
            break;
          }
          default:
            continue;
        }

        all.push({
          id: h.id,
          type,
          label,
          timestamp: h.created_at,
          actor,
          details: h.reason || undefined,
        });
      }
    }

    // 3. Document uploads (from claim_files — already loaded by parent)
    for (const f of claimFiles) {
      all.push({
        id: `file-${f.id}`,
        type: 'document',
        label: `Document uploaded: ${f.file_name}`,
        timestamp: f.created_at,
        actor: resolveName(f.uploaded_by),
        details: f.note || undefined,
      });
    }

    // 4. Eligibility overrides (from audit_log — admin only)
    //    Workers cannot read audit_log (RLS), so skip entirely for them.
    if (isAdmin) {
      const { data: audit } = await supabase
        .from('audit_log')
        .select('id, user_email, role, action, old_values, new_values, created_at')
        .eq('entity_id', claimId)
        .order('created_at', { ascending: true });

      if (audit) {
        for (const a of audit as {
          id: string; user_email: string | null; role: string | null;
          action: string; old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null; created_at: string;
        }[]) {
          if (a.action === 'claim.override') {
            all.push({
              id: `audit-${a.id}`,
              type: 'override',
              label: 'Eligibility override applied',
              timestamp: a.created_at,
              actor: a.user_email || 'System',
              details: (a.new_values?.override_reason as string) || undefined,
            });
          }
        }
      }
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEvents(all);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-5 text-center text-[#94a3b8] text-[12px]">Loading timeline…</div>;
  }

  if (events.length === 0) {
    return <div className="p-5 text-center text-[#94a3b8] text-[12px]">No timeline events recorded.</div>;
  }

  return (
    <div className="p-4">
      <ul className="list-none">
        {events.map((ev, i) => {
          const Icon = EVENT_ICON[ev.type];
          const color = EVENT_COLOR[ev.type];
          return (
            <li key={ev.id} className="flex gap-3 pb-4 relative last:pb-0">
              {i < events.length - 1 && (
                <div
                  className="absolute left-[11px] top-7 bottom-0 w-px"
                  style={{ backgroundColor: '#e2e8f0' }}
                />
              )}
              <div
                className="w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10"
                style={{ backgroundColor: `${color}15`, border: `2px solid ${color}` }}
              >
                <Icon className="w-3 h-3" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[12px] text-[#0f172a] leading-snug">
                  {ev.label}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-[#94a3b8]" />
                  <span className="text-[10px] text-[#64748b]">{fmtDate(ev.timestamp)}</span>
                  {ev.actor && (
                    <span className="text-[10px] text-[#94a3b8]">· by {ev.actor}</span>
                  )}
                </div>
                {ev.details && (
                  <div className="mt-1 text-[11px] text-[#475569] bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-2.5 py-1.5">
                    {ev.details}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
