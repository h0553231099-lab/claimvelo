import { Trash2, Plus } from 'lucide-react';

export interface SegmentData {
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  segment_order: number;
}

interface Props {
  isSingleBooking: boolean | null;
  setIsSingleBooking: (v: boolean | null) => void;
  segments: SegmentData[];
  setSegments: (v: SegmentData[]) => void;
}

export default function ConnectingFlightFields({ isSingleBooking, setIsSingleBooking, segments, setSegments }: Props) {
  function addSegment() {
    setSegments([...segments, {
      flight_number: '',
      flight_date: '',
      origin: '',
      destination: '',
      segment_order: segments.length + 1,
    }]);
  }

  function updateSegment(idx: number, field: keyof SegmentData, value: string) {
    const updated = [...segments];
    (updated[idx] as Record<string, unknown>)[field] = field === 'segment_order' ? Number(value) : value;
    setSegments(updated);
  }

  function removeSegment(idx: number) {
    const updated = segments.filter((_, i) => i !== idx).map((s, i) => ({ ...s, segment_order: i + 1 }));
    setSegments(updated);
  }

  return (
    <div className="border-2 border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-4 bg-[#fafbfc]">
      <div className="font-bold text-[14px] text-[#0f172a]">Connecting Flight Details</div>

      {/* Single booking */}
      <div>
        <div className="text-[12px] font-semibold text-[#374151] mb-2">Were all flights on a single booking? <span className="text-[#dc2626]">*</span></div>
        <div className="flex gap-2">
          {[
            { val: true, label: 'Yes, single booking' },
            { val: false, label: 'No, separate bookings' },
          ].map(({ val, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setIsSingleBooking(val)}
              className={`flex-1 px-4 py-3 rounded-xl border-2 text-[14px] font-medium cursor-pointer transition-all ${isSingleBooking === val ? 'border-[#0f2744] bg-[#f0f4ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#94a3b8]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Segments */}
      <div className="flex flex-col gap-3">
        {segments.map((seg, idx) => (
          <div key={idx} className="border border-[#e2e8f0] rounded-lg p-3 bg-white flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider">Flight {idx + 1}</span>
              {segments.length > 1 && (
                <button type="button" onClick={() => removeSegment(idx)} className="text-[#dc2626] hover:bg-[#fee2e2] rounded p-1 cursor-pointer border-none">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={seg.flight_number}
                onChange={e => updateSegment(idx, 'flight_number', e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                placeholder="Flight #"
                maxLength={7}
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white"
              />
              <input
                type="date"
                value={seg.flight_date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => updateSegment(idx, 'flight_date', e.target.value)}
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white"
              />
              <input
                value={seg.origin}
                onChange={e => updateSegment(idx, 'origin', e.target.value.toUpperCase().slice(0, 3))}
                placeholder="Origin (e.g. LHR)"
                maxLength={3}
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white"
              />
              <input
                value={seg.destination}
                onChange={e => updateSegment(idx, 'destination', e.target.value.toUpperCase().slice(0, 3))}
                placeholder="Dest (e.g. JFK)"
                maxLength={3}
                className="px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] outline-none focus:border-[#0f2744] bg-white"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addSegment}
          className="flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-[#cbd5e1] rounded-lg text-[13px] font-semibold text-[#64748b] cursor-pointer hover:border-[#0f2744] hover:text-[#0f2744] transition-colors bg-white"
        >
          <Plus className="w-4 h-4" /> Add another flight
        </button>
      </div>
    </div>
  );
}
