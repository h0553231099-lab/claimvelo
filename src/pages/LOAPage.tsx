import { Page, ClaimFormData } from '../types';

interface Props { onNav: (p: Page) => void; form: ClaimFormData; sigData: string; }

export default function LOAPage({ onNav }: Props) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const storedSig = sessionStorage.getItem('loa_sig') || '';
  const storedForm: ClaimFormData = (() => {
    try { return JSON.parse(sessionStorage.getItem('loa_form') || '{}'); } catch { return {}; }
  })();

  const form = storedForm;
  const sigData = storedSig;
  const fullName = `${form.firstName || ''} ${form.lastName || ''}`.trim() || 'Passenger Name';

  function printLOA() {
    const sigHtml = sigData
      ? `<img src="${sigData}" alt="signature" style="max-height:60px;max-width:220px;display:block;" />`
      : `<div style="height:60px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;">No signature captured</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Letter of Authority – ClaimVelo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 13px; color: #1a1a1a; line-height: 1.75; padding: 48px 56px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .brand { font-family: Arial, sans-serif; }
    .brand-name { font-size: 18px; font-weight: 800; color: #2563eb; }
    .brand-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .address { font-family: Arial, sans-serif; font-size: 10px; color: #64748b; line-height: 1.6; text-align: right; }
    h1 { font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.1em; color: #2563eb; margin-bottom: 20px; }
    p { margin-bottom: 12px; line-height: 1.85; }
    .highlight { display: inline-block; border-bottom: 1px solid #333; min-width: 160px; font-weight: 600; color: #2563eb; padding: 0 4px; }
    .box { margin: 16px 0; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.7; }
    .box-label { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 28px; }
    .sig-block { border-top: 1px solid #333; padding-top: 6px; font-family: Arial, sans-serif; font-size: 11px; color: #64748b; }
    .sig-name { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .sig-placeholder { height: 60px; border: 1px dashed #e2e8f0; display: flex; align-items: center; justify-content: center; font-style: italic; color: #94a3b8; font-size: 11px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-family: Arial, sans-serif; font-size: 10px; text-align: center; color: #64748b; line-height: 1.6; }
    @media print { body { padding: 24px 32px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-name">ClaimVelo</div>
      <div class="brand-sub">Flight Compensation Specialists</div>
    </div>
    <div class="address">ClaimVelo Ltd.<br />1265 55th St, Brooklyn, NY 11219<br />support@claimvelo.com<br />${today}</div>
  </div>
  <h1>Letter of Authority &amp; Assignment of Rights</h1>
  <p>I, <span class="highlight">${fullName}</span>, hereby authorise <strong>ClaimVelo Ltd.</strong> ("the Company") to act as my authorised representative in connection with my flight compensation claim against <span class="highlight">${form.airline || '___________________'}</span> ("the Airline").</p>
  <div class="box">
    <strong class="box-label">Flight Details</strong>
    Flight: <strong>${form.flight || '___'}</strong> &nbsp;|&nbsp; Date: <strong>${form.fdate || '___'}</strong> &nbsp;|&nbsp; Route: <strong>${form.dep || '___'}</strong> &rarr; <strong>${form.arr || '___'}</strong><br />
    Issue: <strong>${form.issue || '___'}</strong> &nbsp;|&nbsp; Compensation: <strong>&euro;600</strong> per passenger (EC 261/2004)
  </div>
  <div class="box">
    <strong class="box-label">Passenger Details</strong>
    Name: <strong>${fullName}</strong> &nbsp;|&nbsp; DOB: <strong>${form.dob || '___'}</strong><br />
    Email: <strong>${form.email || '___'}</strong> &nbsp;|&nbsp; Address: <strong>${form.address || '___'}</strong>
  </div>
  <p><strong>Scope of Authority:</strong> I authorise the Company to communicate with the Airline, access flight records, instruct legal counsel, commence court proceedings, and receive compensation on my behalf.</p>
  <p><strong>Fee Agreement:</strong> I agree to pay a success fee of <strong>50% (+VAT)</strong> of compensation received. No fee if unsuccessful.</p>
  <p><strong>GDPR:</strong> I consent to processing of my personal data for the purpose of this claim, per ClaimVelo's Privacy Policy.</p>
  <div class="sigs">
    <div class="sig-block">
      <div class="sig-name">${fullName}</div>
      ${sigHtml}
      <div style="margin-top:4px;">Date: ${today}</div>
    </div>
    <div class="sig-block">
      <div class="sig-name">ClaimVelo Ltd.</div>
      <div class="sig-placeholder">Authorised Signature</div>
      <div style="margin-top:4px;">Date: ${today}</div>
    </div>
  </div>
  <div class="footer">ClaimVelo Ltd. registered in England &amp; Wales. Co. No. 12345678. 12 Aviation House, London EC1A 1BB.<br />Governed by laws of England &amp; Wales. EC Regulation 261/2004 / UK261 claims specialists.</div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="max-w-[780px] mx-auto px-5 py-8">
      <div className="flex gap-2 mb-5">
        <button onClick={() => onNav('claim')} className="px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[10px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">← Back to Claim</button>
        <button onClick={printLOA} className="px-2.5 py-1 bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] rounded-[10px] text-xs font-semibold cursor-pointer hover:bg-[#e2e8f0]">Print / Save PDF</button>
        <button className="ml-auto px-2.5 py-1 bg-[#2563eb] text-white border-none rounded-[10px] text-xs font-semibold cursor-pointer hover:bg-[#1d4ed8]">Send to Passenger</button>
      </div>

      <div
        className="bg-white border border-[#e2e8f0] rounded-[10px] p-9"
        style={{ fontFamily: "'Times New Roman', serif", lineHeight: 1.75, color: '#1a1a1a', fontSize: '13px' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-7 pb-4 border-b-2 border-[#2563eb]">
          <div>
            <div className="text-[18px] font-extrabold text-[#2563eb]" style={{ fontFamily: '-apple-system, sans-serif' }}>ClaimVelo</div>
            <div className="text-[11px] text-[#64748b] mt-0.5" style={{ fontFamily: '-apple-system, sans-serif' }}>Flight Compensation Specialists</div>
          </div>
          <div className="text-right text-[10px] text-[#64748b] leading-relaxed" style={{ fontFamily: '-apple-system, sans-serif' }}>
            ClaimVelo Ltd.<br />
            12 Aviation House, London EC1A 1BB<br />
            support@claimvelo.com<br />
            {today}
          </div>
        </div>

        {/* Title */}
        <div className="text-sm font-bold text-center mb-5 uppercase tracking-[0.1em] text-[#2563eb]" style={{ fontFamily: '-apple-system, sans-serif' }}>
          Letter of Authority & Assignment of Rights
        </div>

        <p className="mb-3" style={{ lineHeight: 1.85 }}>
          I, <span className="inline-block border-b border-[#333] min-w-[160px] font-semibold text-[#2563eb] px-1">{fullName}</span>, hereby authorise <strong>ClaimVelo Ltd.</strong> ("the Company") to act as my authorised representative in connection with my flight compensation claim against <span className="inline-block border-b border-[#333] min-w-[160px] font-semibold text-[#2563eb] px-1">{form.airline || '___________________'}</span> ("the Airline").
        </p>

        {/* Flight details box */}
        <div className="my-4 px-3.5 py-3 bg-[#f8fafc] rounded-md border border-[#e2e8f0] text-xs leading-relaxed" style={{ fontFamily: '-apple-system, sans-serif' }}>
          <strong className="block mb-1 text-[11px] uppercase text-[#64748b]">Flight Details</strong>
          Flight: <strong>{form.flight || '___'}</strong> &nbsp;|&nbsp; Date: <strong>{form.fdate || '___'}</strong> &nbsp;|&nbsp; Route: <strong>{form.dep || '___'}</strong> → <strong>{form.arr || '___'}</strong><br />
          Issue: <strong>{form.issue || '___'}</strong> &nbsp;|&nbsp; Compensation: <strong>€600</strong> per passenger (EC 261/2004)
        </div>

        {/* Passenger details box */}
        <div className="my-4 px-3.5 py-3 bg-[#f8fafc] rounded-md border border-[#e2e8f0] text-xs leading-relaxed" style={{ fontFamily: '-apple-system, sans-serif' }}>
          <strong className="block mb-1 text-[11px] uppercase text-[#64748b]">Passenger Details</strong>
          Name: <strong>{fullName}</strong> &nbsp;|&nbsp; DOB: <strong>{form.dob || '___'}</strong><br />
          Email: <strong>{form.email || '___'}</strong> &nbsp;|&nbsp; Address: <strong>{form.address || '___'}</strong>
        </div>

        <p className="mb-2.5" style={{ lineHeight: 1.85 }}>
          <strong>Scope of Authority:</strong> I authorise the Company to communicate with the Airline, access flight records, instruct legal counsel, commence court proceedings, and receive compensation on my behalf.
        </p>

        <p className="mb-2.5" style={{ lineHeight: 1.85 }}>
          <strong>Fee Agreement:</strong> I agree to pay a success fee of <strong>50% (+VAT)</strong> of compensation received. No fee if unsuccessful.
        </p>

        <p className="mb-2.5" style={{ lineHeight: 1.85 }}>
          <strong>GDPR:</strong> I consent to processing of my personal data for the purpose of this claim, per ClaimVelo's Privacy Policy.
        </p>

        {/* Signature row */}
        <div className="grid grid-cols-2 gap-8 mt-7">
          <div className="border-t border-[#333] pt-1.5 text-[11px] text-[#64748b]">
            <div className="font-semibold text-xs mb-1 text-[#0f172a]">{fullName}</div>
            {sigData ? (
              <div className="h-16 flex items-center">
                <img src={sigData} alt="signature" style={{ maxHeight: 64, maxWidth: '100%' }} />
              </div>
            ) : (
              <div className="h-16 border border-dashed border-[#e2e8f0] rounded-md flex items-center justify-center text-[11px] text-[#94a3b8]">No signature captured</div>
            )}
            <div className="mt-1">Date: {today}</div>
          </div>
          <div className="border-t border-[#333] pt-1.5 text-[11px] text-[#64748b]">
            <div className="font-semibold text-xs mb-1 text-[#0f172a]">ClaimVelo Ltd.</div>
            <div className="h-16 border border-dashed border-[#e2e8f0] rounded-md flex items-center justify-center text-[11px] italic text-[#64748b]">Authorised Signature</div>
            <div className="mt-1">Date: {today}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-[#e2e8f0] text-[10px] text-center text-[#64748b]" style={{ fontFamily: '-apple-system, sans-serif' }}>
          ClaimVelo Ltd. registered in England & Wales. Co. No. 12345678. 12 Aviation House, London EC1A 1BB.<br />
          Governed by laws of England & Wales. EC Regulation 261/2004 / UK261 claims specialists.
        </div>
      </div>
    </div>
  );
}
