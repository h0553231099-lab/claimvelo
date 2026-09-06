import { ClaimStatusHistory } from '../types';
import {
  PlusCircle, ArrowRightLeft, CheckCircle, Flag, UserCheck,
  Paperclip, Gavel, HelpCircle, Mail,
} from 'lucide-react';

interface Props {
  events: ClaimStatusHistory[];
  isAdmin: boolean;
}

// Icon + colour per event type — keeps the timeline scannable at a glance.
const EVENT_META: Record<string, { icon: typeof PlusCircle; bg: string; ring: string; label: string }> = {
  status:           { icon: ArrowRightLeft, bg: 'bg-[#2563eb]', ring: 'border-[#2563eb]',  label: 'Status' },
  eligibility_status:{ icon: CheckCircle,    bg: 'bg-[#059669]', ring: 'border-[#059669]',  label: 'Eligibility' },
  priority:         { icon: Flag,            bg: 'bg-[#ea580c]', ring: 'border-[#ea580c]',  label: 'Priority' },
  assigned_to:      { icon: UserCheck,       bg: 'bg-[#7c3aed]', ring: 'border-[#7c3aed]',  label: 'Assignment' },
  document_upload:  { icon: Paperclip,       bg: 'bg-[#0891b2]', ring: 'border-[#0891b2]',  label: 'Document' },
  override:         { icon: Gavel,           bg: 'bg-[#92400e]', ring: 'border-[#92400e]',  label: 'Override' },
  info_request:     { icon: HelpCircle,      bg: 'bg-[#6366f1]', ring: 'border-[#6366f1]',  label: 'Info Request' },
  airline_email:     { icon: Paperclip,       bg: 'bg-[#0d9488]', ring: 'border-[#0d9488]',  label: 'Airline Email' },
  customer_email:    { icon: Mail,            bg: 'bg-[#4f46e5]', ring: 'border-[#4f46e5]',  label: 'Customer Email' },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function sourceLabel(source: string): string {
  if (source === 'insert') return 'Created';
  if (source === 'staff') return 'Staff';
  return 'System';
}

export default function ClaimTimeline({ events, isAdmin }: Props) {
  // Filter override events for admin-only visibility.
  const visible = events.filter(e => isAdmin || e.field_name !== 'override');

  // Chronological order — oldest first (top → bottom = past → present).
  const ordered = [...visible].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (ordered.length === 0) {
    return (
      <div className="p-5">
        <div className="text-[11px] text-[#94a3b8]">No events recorded yet.</div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <PlusCircle className="w-3 h-3" />Event Timeline
      </div>
      <ul className="list-none">
        {ordered.map((h, i) => {
          const meta = EVENT_META[h.field_name] || EVENT_META.status;
          const Icon = meta.icon;
          const isLast = i === ordered.length - 1;
          const isInitial = h.source === 'insert';

          // Human-readable description of what changed.
          let description: string;
          if (h.field_name === 'document_upload') {
            description = h.reason
              ? `${h.to_status} — ${h.reason}`
              : `Uploaded: ${h.to_status}`;
          } else if (h.field_name === 'info_request') {
            description = h.reason || `Requested: ${h.to_status}`;
          } else if (h.field_name === 'airline_email') {
            description = h.reason || h.to_status;
          } else if (h.field_name === 'assigned_to') {
            description = h.from_status
              ? `${h.from_status} → ${h.to_status}`
              : `Assigned to ${h.to_status}`;
          } else if (isInitial) {
            description = `Initial: ${h.to_status}`;
          } else if (h.from_status) {
            description = `${h.from_status} → ${h.to_status}`;
          } else {
            description = h.to_status;
          }

          return (
            <li key={h.id} className="flex gap-2.5 pb-3 relative last:pb-0">
              {!isLast && (
                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[#e2e8f0]" />
              )}
              <div className={`w-[23px] h-[23px] rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 z-10 ${meta.bg} ${meta.ring} text-white`}>
                <Icon className="w-2.5 h-2.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#64748b] bg-[#f1f5f9] px-1.5 py-0.5 rounded">
                    {meta.label}
                  </span>
                </div>
                <div className="font-semibold text-[12px] text-[#0f172a]">
                  {description}
                </div>
                <div className="text-[10px] text-[#64748b] mt-0.5 flex items-center gap-1.5">
                  <span>{formatTimestamp(h.created_at)}</span>
                  <span className="text-[#cbd5e1]">·</span>
                  <span>{sourceLabel(h.source)}</span>
                  {h.actor_name && (
                    <>
                      <span className="text-[#cbd5e1]">·</span>
                      <span className="font-medium text-[#475569]">{h.actor_name}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
