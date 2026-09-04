import { Plane, Ban, UserX, GitBranch } from 'lucide-react';

export type IssueType = 'Delay' | 'Cancellation' | 'Denied Boarding' | 'Missed Connection';

interface Props {
  value: IssueType | '';
  onChange: (v: IssueType) => void;
}

const OPTIONS: { type: IssueType; label: string; desc: string; icon: typeof Plane }[] = [
  { type: 'Delay', label: 'Flight Delay', desc: 'Arrived 3+ hours late', icon: Plane },
  { type: 'Cancellation', label: 'Cancellation', desc: 'Flight was cancelled', icon: Ban },
  { type: 'Denied Boarding', label: 'Denied Boarding', desc: 'Overbooking or denied boarding', icon: UserX },
  { type: 'Missed Connection', label: 'Missed Connection', desc: 'Connecting flight missed', icon: GitBranch },
];

export default function IssueTypeSelector({ value, onChange }: Props) {
  return (
    <div>
      <div className="font-bold text-[15px] text-[#0f172a] mb-1">What happened? <span className="text-[#dc2626]">*</span></div>
      <div className="text-[12px] text-[#64748b] mb-3">Select the type of disruption you experienced.</div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ type, label, desc, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 text-left cursor-pointer transition-all bg-white ${value === type ? 'border-[#0f2744] bg-[#f0f4ff]' : 'border-[#e2e8f0] hover:border-[#94a3b8]'}`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${value === type ? 'bg-[#0f2744] text-white' : 'bg-[#f1f5f9] text-[#64748b]'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#0f172a]">{label}</div>
              <div className="text-[12px] text-[#64748b]">{desc}</div>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${value === type ? 'border-[#0f2744]' : 'border-[#cbd5e1]'}`}>
              {value === type && <div className="w-2 h-2 rounded-full bg-[#0f2744]" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
