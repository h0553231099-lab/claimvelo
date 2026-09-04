interface Props {
  boardingType: string;
  setBoardingType: (v: string) => void;
  confirmedReservation: boolean | null;
  setConfirmedReservation: (v: boolean | null) => void;
  checkedInOnTime: boolean | null;
  setCheckedInOnTime: (v: boolean | null) => void;
  denialReason: string;
  setDenialReason: (v: string) => void;
}

function YesNoButtons({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[
        { val: true, label: 'Yes' },
        { val: false, label: 'No' },
      ].map(({ val, label }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          className={`flex-1 px-4 py-3 rounded-xl border-2 text-[14px] font-medium cursor-pointer transition-all ${value === val ? 'border-[#0f2744] bg-[#f0f4ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#94a3b8]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function DeniedBoardingFields({
  boardingType, setBoardingType,
  confirmedReservation, setConfirmedReservation,
  checkedInOnTime, setCheckedInOnTime,
  denialReason, setDenialReason,
}: Props) {
  return (
    <div className="border-2 border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-4 bg-[#fafbfc]">
      <div className="font-bold text-[14px] text-[#0f172a]">Denied Boarding Details</div>

      {/* Boarding type */}
      <div>
        <div className="text-[12px] font-semibold text-[#374151] mb-2">Was it voluntary or involuntary? <span className="text-[#dc2626]">*</span></div>
        <div className="flex gap-2">
          {[
            { val: 'involuntary', label: 'Involuntary (Overbooking)' },
            { val: 'voluntary', label: 'Voluntary (Accepted offer)' },
          ].map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => setBoardingType(val)}
              className={`flex-1 px-4 py-3 rounded-xl border-2 text-[14px] font-medium cursor-pointer transition-all ${boardingType === val ? 'border-[#0f2744] bg-[#f0f4ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#94a3b8]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Confirmed reservation */}
      <div>
        <div className="text-[12px] font-semibold text-[#374151] mb-2">Did you have a confirmed reservation? <span className="text-[#dc2626]">*</span></div>
        <YesNoButtons value={confirmedReservation} onChange={setConfirmedReservation} />
      </div>

      {/* Checked in on time */}
      <div>
        <div className="text-[12px] font-semibold text-[#374151] mb-2">Did you check in on time? <span className="text-[#dc2626]">*</span></div>
        <YesNoButtons value={checkedInOnTime} onChange={setCheckedInOnTime} />
      </div>

      {/* Denial reason */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-[#374151]">Reason for denial</label>
        <select
          value={denialReason}
          onChange={e => setDenialReason(e.target.value)}
          className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors"
        >
          <option value="">Select...</option>
          <option value="overbooking">Overbooking</option>
          <option value="health">Health reasons</option>
          <option value="safety">Safety concerns</option>
          <option value="security">Security reasons</option>
          <option value="documents">Travel documents</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
  );
}
