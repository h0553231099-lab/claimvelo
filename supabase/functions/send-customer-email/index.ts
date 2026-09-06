import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STAFF_ROLES = ["admin", "super_admin", "worker"];

interface Payload {
  claim_id: string;
  subject: string;
  body: string;
  language?: string;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Auth: require valid staff JWT ───────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonError(401, "Authentication required");
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) {
    return jsonError(401, "Invalid or expired token");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Authorization: staff only ──────────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, claimvelo_email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return jsonError(403, "Only staff can send customer emails");
  }

  try {
    const payload: Payload = await req.json();
    const { claim_id, subject, body } = payload;

    if (!claim_id || !subject || !body) {
      return jsonError(400, "Missing required fields: claim_id, subject, body");
    }

    // ── Fetch the claim ──────────────────────────────────────────────────────
    const { data: claim, error: claimErr } = await admin
      .from("claims")
      .select("id, claim_ref, email, passenger_first_name, passenger_last_name, preferred_language")
      .eq("id", claim_id)
      .single();

    if (claimErr || !claim) {
      return jsonError(404, "Claim not found");
    }

    if (!claim.email) {
      return jsonError(400, "Claim has no customer email address");
    }

    const language = payload.language || claim.preferred_language || "en";
    const fromName = profile.full_name || "ClaimVelo";
    const fromAddress = profile.claimvelo_email || "support@claimvelo.com";

    // ── Build email HTML ──────────────────────────────────────────────────────
    const html = buildEmailHtml(subject, body, fromName, fromAddress, language);

    // ── Send via Resend ───────────────────────────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      return jsonError(500, "Email service not configured (RESEND_API_KEY missing)");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [claim.email],
        reply_to: fromAddress,
        subject,
        html,
        text: body,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return jsonError(500, `Email delivery failed: ${err}`);
    }

    const data = await res.json();
    const emailId = data.id || null;

    // ── Log the communication ─────────────────────────────────────────────────
    await admin.from("claim_communications").insert({
      claim_id: claim.id,
      direction: "outbound",
      channel: "email",
      subject,
      body,
      from_address: fromAddress,
      to_address: claim.email,
      from_name: fromName,
      from_user_id: user.id,
      match_status: "manual",
      language,
      message_id: emailId,
    });

    // The trigger on claim_communications updates last_customer_update_at and
    // logs a timeline event automatically.

    return new Response(JSON.stringify({ ok: true, email_id: emailId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-customer-email error:", err);
    return jsonError(500, String(err));
  }
});

function buildEmailHtml(
  subject: string,
  body: string,
  fromName: string,
  fromAddress: string,
  language: string,
): string {
  // For launch, only English email templates are enabled.
  // Non-English greetings are preserved for future use but gated off
  // until the language is added to ENABLED_LANGUAGES.
  const ENABLED_LANGUAGES = new Set(["en"]);
  const greeting = ENABLED_LANGUAGES.has(language) && language === "es" ? "Estimado cliente" : "Dear Customer";

  return `<!DOCTYPE html>
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
}
