import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  to: string;
  subject: string;
  body: string;
  fromName: string;
  fromAddress: string;
  replyToEmailId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: Payload = await req.json();
    const { to, subject, body, fromName, fromAddress } = payload;

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#2563eb;padding:24px 32px;">
      <div style="color:#ffffff;font-size:18px;font-weight:800;">ClaimVelo</div>
      <div style="color:#93c5fd;font-size:12px;margin-top:2px;">Flight Compensation Specialists</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <div style="font-size:11px;color:#94a3b8;">This email was sent by ${fromName} (${fromAddress}) via ClaimVelo CRM.</div>
    </div>
  </div>
</body>
</html>`;

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [to],
          reply_to: fromAddress,
          subject,
          html,
          text: body,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend error: ${err}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({ ok: true, id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.log(`[SEND-STAFF-EMAIL] To: ${to} | Subject: ${subject}`);
      return new Response(JSON.stringify({ ok: true, id: "dev-mode" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("send-staff-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
