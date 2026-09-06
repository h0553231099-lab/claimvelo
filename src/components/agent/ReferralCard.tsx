import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, QrCode, Link2 } from 'lucide-react';

interface Props {
  agentCode: string;
  compact?: boolean;
}

/**
 * Reusable referral link + QR card.
 * Uses the existing secure /start?agent=CODE attribution flow.
 * The agent can copy/share their link and download the QR image.
 */
export default function ReferralCard({ agentCode, compact }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const link = agentCode
    ? `${window.location.origin}/start?agent=${encodeURIComponent(agentCode)}`
    : '';

  useEffect(() => {
    if (!link) { setQrUrl(null); return; }
    QRCode.toDataURL(link, {
      width: compact ? 160 : 200,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [link, compact]);

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function copyCode() {
    if (!agentCode) return;
    navigator.clipboard.writeText(agentCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function downloadQR() {
    if (!qrUrl || !agentCode) return;
    const a = document.createElement('a');
    a.download = `claimvelo-qr-${agentCode}.png`;
    a.href = qrUrl;
    a.click();
  }

  if (!agentCode) {
    return (
      <div className="bg-[#f8fafc] border border-dashed border-[#e2e8f0] rounded-[12px] p-5 text-center">
        <div className="text-[13px] font-semibold text-[#64748b]">No agent code assigned</div>
        <div className="text-[11px] text-[#94a3b8] mt-1">Contact your manager to get a referral code.</div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-[#e2e8f0] rounded-[12px] ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-[9px] bg-[#eff6ff] flex items-center justify-center shrink-0">
          <QrCode className="w-4.5 h-4.5 text-[#2563eb]" />
        </div>
        <div>
          <div className="font-bold text-[13px] text-[#0f172a]">Your referral link</div>
          <div className="text-[11px] text-[#64748b]">Share to bring in clients — attribution is automatic</div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {qrUrl && (
          <div className="shrink-0">
            <img src={qrUrl} alt="Referral QR code" className="w-[120px] h-[120px] rounded-[8px] border border-[#e2e8f0]" />
            <button
              onClick={downloadQR}
              className="mt-2 w-[120px] flex items-center justify-center gap-1.5 px-2 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-[7px] text-[11px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer transition-colors"
            >
              <Download className="w-3 h-3" /> Download
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Agent code</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[7px] text-[13px] font-mono font-bold text-[#2563eb] truncate">{agentCode}</code>
              <button
                onClick={copyCode}
                className="w-9 h-9 flex items-center justify-center rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#2563eb] hover:bg-[#eff6ff] cursor-pointer transition-colors shrink-0"
                title="Copy code"
              >
                {copiedCode ? <Check className="w-4 h-4 text-[#16a34a]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1">Link</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[7px] text-[11px] text-[#475569] truncate flex items-center gap-1.5">
                <Link2 className="w-3 h-3 text-[#94a3b8] shrink-0" />
                <span className="truncate">{link}</span>
              </div>
              <button
                onClick={copyLink}
                className="w-9 h-9 flex items-center justify-center rounded-[7px] bg-[#2563eb] text-white hover:bg-[#1d4ed8] cursor-pointer transition-colors shrink-0"
                title="Copy link"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
