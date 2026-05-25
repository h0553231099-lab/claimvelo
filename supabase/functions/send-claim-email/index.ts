import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailPayload {
  type: "claim_submitted" | "status_changed";
  to: string;
  passengerName: string;
  claimRef: string;
  airline?: string;
  route?: string;
  amount?: string;
  newStatus?: string;
  oldStatus?: string;
}

function buildSubmitHtml(p: EmailPayload): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <!-- Header -->
    <div style="background:#2563eb;padding:28px 32px;">
      <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">ClaimVelo</div>
      <div style="color:#93c5fd;font-size:12px;margin-top:2px;">Flight Compensation Specialists</div>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px;">Claim Received!</div>
      <div style="font-size:14px;color:#64748b;margin-bottom:24px;">Hi ${p.passengerName}, we've received your claim and our team will start working on it right away.</div>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Your Claim Reference</div>
        <div style="font-size:28px;font-weight:900;color:#16a34a;letter-spacing:0.05em;">${p.claimRef}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Keep this reference number safe — you'll need it to track your claim.</div>
      </div>

      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Claim Details</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:4px 0;color:#64748b;">Airline</td><td style="padding:4px 0;font-weight:600;color:#0f172a;text-align:right;">${p.airline || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">Route</td><td style="padding:4px 0;font-weight:600;color:#0f172a;text-align:right;">${p.route || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">Estimated Compensation</td><td style="padding:4px 0;font-weight:700;color:#16a34a;text-align:right;">${p.amount || "€600"}</td></tr>
        </table>
      </div>

      <div style="font-size:13px;color:#475569;line-height:1.7;margin-bottom:24px;">
        <strong>What happens next?</strong><br>
        Our team will review your documents and contact the airline on your behalf. We'll keep you updated by email at every stage. Average resolution time is <strong>18 days</strong>.
      </div>

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;font-size:12px;color:#92400e;">
        <strong>Remember:</strong> Our fee is 30% of compensation received (50% if legal action is required) — only charged on success.
      </div>
    </div>
    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      ClaimVelo Ltd. · 12 Aviation House, London EC1A 1BB<br>
      support@claimvelo.com · Registered in England &amp; Wales No. 12345678
    </div>
  </div>
</body>
</html>`;
}

function buildStatusHtml(p: EmailPayload): string {
  const isResolved = p.newStatus === "Resolved";
  const isEscalated = p.newStatus === "Escalated";
  const headerBg = isResolved ? "#16a34a" : isEscalated ? "#dc2626" : "#2563eb";

  const statusMessages: Record<string, { title: string; body: string }> = {
    "In Progress": {
      title: "We're working on your claim",
      body: "Your claim has been assigned to one of our specialist agents. We are now actively processing your case and will contact the airline on your behalf.",
    },
    Submitted: {
      title: "Claim submitted to airline",
      body: "We have formally submitted your compensation claim to the airline. Airlines typically have 28 days to respond. We'll update you as soon as we hear back.",
    },
    Waiting: {
      title: "Waiting for airline response",
      body: "The airline has received your claim and we are awaiting their response. This can take up to 28 days. We'll chase them if they don't respond in time.",
    },
    Resolved: {
      title: "Great news — your claim is resolved!",
      body: `Congratulations! ${p.airline || "The airline"} has agreed to pay your compensation. Our team will arrange payment to you shortly, minus our success fee.`,
    },
    Escalated: {
      title: "Your claim has been escalated",
      body: "The airline has disputed or ignored your claim. We have escalated your case to our legal team who will take further action on your behalf at no extra cost to you.",
    },
  };

  const msg = statusMessages[p.newStatus || ""] || {
    title: `Claim status updated to: ${p.newStatus}`,
    body: "Your claim status has been updated. Log in to your dashboard for the latest information.",
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:${headerBg};padding:28px 32px;">
      <div style="color:#ffffff;font-size:20px;font-weight:800;">ClaimVelo</div>
      <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">Claim Status Update</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px;">${msg.title}</div>
      <div style="font-size:14px;color:#64748b;margin-bottom:24px;">Hi ${p.passengerName}, here's an update on your claim <strong>${p.claimRef}</strong>.</div>

      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
        <div style="flex:1;">
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Previous Status</div>
          <div style="font-size:14px;font-weight:700;color:#64748b;margin-top:2px;">${p.oldStatus || "—"}</div>
        </div>
        <div style="font-size:18px;color:#94a3b8;">→</div>
        <div style="flex:1;">
          <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">New Status</div>
          <div style="font-size:14px;font-weight:700;color:${headerBg};margin-top:2px;">${p.newStatus}</div>
        </div>
      </div>

      <div style="font-size:13px;color:#475569;line-height:1.7;margin-bottom:24px;">${msg.body}</div>

      <div style="background:#f8fafc;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:12px;color:#64748b;">
        <strong style="color:#0f172a;">Claim:</strong> ${p.claimRef} &nbsp;·&nbsp;
        <strong style="color:#0f172a;">Airline:</strong> ${p.airline || "—"} &nbsp;·&nbsp;
        <strong style="color:#16a34a;font-weight:700;">${p.amount || "€600"}</strong>
      </div>

      ${isResolved ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;font-size:13px;color:#166534;margin-bottom:20px;">
        <strong>Payment information:</strong> We will contact you separately with payment details. Please allow 3–5 business days.
      </div>` : ""}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      ClaimVelo Ltd. · 12 Aviation House, London EC1A 1BB<br>
      support@claimvelo.com · Registered in England &amp; Wales No. 12345678
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();

    const subject =
      payload.type === "claim_submitted"
        ? `Your claim ${payload.claimRef} has been received — ClaimVelo`
        : `Status update for ${payload.claimRef}: ${payload.newStatus} — ClaimVelo`;

    const html =
      payload.type === "claim_submitted"
        ? buildSubmitHtml(payload)
        : buildStatusHtml(payload);

    const brevoKey = Deno.env.get("BREVO_API_KEY");

    if (brevoKey) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "ClaimVelo", email: "support@claimvelo.com" },
          to: [{ email: payload.to, name: payload.passengerName }],
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Brevo error: ${err}`);
      }
    } else {
      console.log(`[EMAIL] To: ${payload.to} | Subject: ${subject}`);
      console.log(`[EMAIL] Body preview: ${html.slice(0, 200)}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-claim-email error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
