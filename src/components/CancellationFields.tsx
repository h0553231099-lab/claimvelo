interface Props {
  cancellationNoticeDate: string;
  setCancellationNoticeDate: (v: string) => void;
  cancellationNoticeSource: string;
  setCancellationNoticeSource: (v: string) => void;
  replacementOffered: boolean;
  setReplacementOffered: (v: boolean) => void;
  replacementAccepted: boolean;
  setReplacementAccepted: (v: boolean) => void;
  replacementFlightNumber: string;
  setReplacementFlightNumber: (v: string) => void;
}

export default function CancellationFields({
  cancellationNoticeDate, setCancellationNoticeDate,
  cancellationNoticeSource, setCancellationNoticeSource,
  replacementOffered, setReplacementOffered,
  replacementAccepted, setReplacementAccepted,
  replacementFlightNumber, setReplacementFlightNumber,
}: Props) {
  return (
    <div className="border-2 border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-4 bg-[#fafbfc]">
      <div className="font-bold text-[14px] text-[#0f172a]">Cancellation Details</div>

      {/* Notice date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-[#374151]">When were you notified? <span className="text-[#dc2626]">*</span></label>
        <input
          type="date"
          value={cancellationNoticeDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={e => setCancellationNoticeDate(e.target.value)}
          className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors"
        />
      </div>

      {/* Notice source */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-[#374151]">How were you notified?</label>
        <select
          value={cancellationNoticeSource}
          onChange={e => setCancellationNoticeSource(e.target.value)}
          className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors"
        >
          <option value="">Select...</option>
          <option value="email">Email</option>
          <option value="sms">SMS / Text</option>
          <option value="phone">Phone call</option>
          <option value="airport">At the airport</option>
          <option value="app">Airline app</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Replacement offered */}
      <div>
        <div className="text-[12px] font-semibold text-[#374151] mb-2">Were you offered a replacement flight?</div>
        <div className="flex gap-2">
          {[
            { val: true, label: 'Yes' },
            { val: false, label: 'No' },
          ].map(({ val, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setReplacementOffered(val); if (!val) { setReplacementAccepted(false); setReplacementFlightNumber(''); } }}
              className={`flex-1 px-4 py-3 rounded-xl border-2 text-[14px] font-medium cursor-pointer transition-all ${replacementOffered === val ? 'border-[#0f2744] bg-[#f0f4ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#94a3b8]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Replacement accepted + flight number (conditional) */}
      {replacementOffered && (
        <>
          <div>
            <div className="text-[12px] font-semibold text-[#374151] mb-2">Did you accept the replacement flight?</div>
            <div className="flex gap-2">
              {[
                { val: true, label: 'Yes' },
                { val: false, label: 'No' },
              ].map(({ val, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setReplacementAccepted(val)}
                  className={`flex-1 px-4 py-3 rounded-xl border-2 text-[14px] font-medium cursor-pointer transition-all ${replacementAccepted === val ? 'border-[#0f2744] bg-[#f0f4ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#94a3b8]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {replacementAccepted && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#374151]">Replacement flight number <span className="text-[#dc2626]">*</span></label>
              <input
                value={replacementFlightNumber}
                onChange={e => setReplacementFlightNumber(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                placeholder="e.g. BA245"
                maxLength={7}
                className="px-4 py-3 border-2 border-[#e2e8f0] rounded-xl text-[14px] outline-none focus:border-[#0f2744] bg-white transition-colors"
              />
              <div className="text-[11px] text-[#94a3b8]">We'll verify this flight against aviation data automatically.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
