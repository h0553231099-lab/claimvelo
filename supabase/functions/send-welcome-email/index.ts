import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WelcomePayload {
  email: string;
  fullName: string;
  role: "sales_manager" | "agent";
  agentCode?: string;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

async function generateQrDataUrl(url: string): Promise<string> {
  // Build a simple QR-code SVG using the goqr.me API (no npm needed)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&format=png`;
  return qrUrl;
}

function buildWelcomeHtml(p: {
  fullName: string;
  email: string;
  tempPassword: string;
  role: string;
  agentCode?: string;
  loginUrl: string;
  qrImageUrl?: string;
}): string {
  const roleLabel = p.role === "sales_manager" ? "Sales Manager" : "Agent";
  const accentColor = p.role === "sales_manager" ? "#0369a1" : "#2563eb";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <!-- Header -->
    <div style="background:${accentColor};padding:28px 32px;">
      <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">ClaimVelo</div>
      <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px;">${roleLabel} Portal — Welcome</div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px;">Welcome, ${p.fullName}!</div>
      <div style="font-size:14px;color:#64748b;margin-bottom:28px;">
        Your ClaimVelo ${roleLabel} account is ready. Use the credentials below to sign in and set your own password.
      </div>

      <!-- Credentials box -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;">Your Sign-in Credentials</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:5px 0;color:#64748b;width:120px;">Email</td>
            <td style="padding:5px 0;font-weight:700;color:#0f172a;">${p.email}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#64748b;">Temp Password</td>
            <td style="padding:5px 0;">
              <span style="font-family:monospace;font-size:15px;font-weight:800;color:${accentColor};letter-spacing:0.08em;background:#e0f2fe;padding:3px 8px;border-radius:5px;">${p.tempPassword}</span>
            </td>
          </tr>
          ${p.agentCode ? `<tr>
            <td style="padding:5px 0;color:#64748b;">Agent Code</td>
            <td style="padding:5px 0;font-family:monospace;font-weight:700;color:#0f172a;">${p.agentCode}</td>
          </tr>` : ""}
        </table>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${p.loginUrl}" style="display:inline-block;padding:13px 32px;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:-0.1px;">
          Sign In &amp; Set Password →
        </a>
      </div>

      ${p.qrImageUrl && p.agentCode ? `
      <!-- QR Code -->
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin-bottom:24px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Your Referral QR Code</div>
        <img src="${p.qrImageUrl}" width="160" height="160" alt="Agent QR Code" style="border-radius:8px;border:1px solid #e2e8f0;" />
        <div style="font-size:12px;color:#64748b;margin-top:10px;">
          Share this QR code with passengers. When scanned, your referral code <strong style="color:#0f172a;font-family:monospace;">${p.agentCode}</strong> will be pre-filled on the claim form.
        </div>
      </div>
      ` : ""}

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;font-size:12px;color:#92400e;">
        <strong>Important:</strong> Change your password immediately after signing in. This temporary password expires after first use.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: WelcomePayload = await req.json();

    if (!payload.email || !payload.fullName || !payload.role) {
      return new Response(
        JSON.stringify({ ok: false, error: "email, fullName, and role are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tempPassword = generateTempPassword();

    // Create auth user with temp password
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Failed to create auth user");
    }

    const userId = authData.user.id;

    // Insert profile row
    const { error: profileError } = await adminClient.from("profiles").insert({
      id: userId,
      role: payload.role,
      full_name: payload.fullName,
      email: payload.email,
    });

    if (profileError) {
      // Clean up auth user if profile insert fails
      await adminClient.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    // If agent, insert worker_profiles row too
    if (payload.role === "agent" && payload.agentCode) {
      await adminClient.from("worker_profiles").insert({
        user_id: userId,
        email: payload.email,
        full_name: payload.fullName,
        role: "agent",
        agent_code: payload.agentCode.toUpperCase(),
        status: "active",
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://claimvelo.com";
    const loginUrl = `${siteUrl}/agent-signin`;

    let qrImageUrl: string | undefined;
    if (payload.agentCode) {
      const claimUrl = `${siteUrl}/claim?agent=${encodeURIComponent(payload.agentCode)}`;
      qrImageUrl = await generateQrDataUrl(claimUrl);
    }

    const html = buildWelcomeHtml({
      fullName: payload.fullName,
      email: payload.email,
      tempPassword,
      role: payload.role,
      agentCode: payload.agentCode,
      loginUrl,
      qrImageUrl,
    });

    const subject = `Welcome to ClaimVelo — Your ${payload.role === "sales_manager" ? "Sales Manager" : "Agent"} Account is Ready`;

    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ClaimVelo <support@claimvelo.com>",
          to: [payload.email],
          subject,
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("Resend error:", err);
      }
    } else {
      console.log(`[WELCOME EMAIL] To: ${payload.email}`);
      console.log(`[WELCOME EMAIL] Temp password: ${tempPassword}`);
    }

    return new Response(
      JSON.stringify({ ok: true, userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-welcome-email error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
