import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, getClientIp } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Authorization constants ──────────────────────────────────────────────────
const ADMIN_ROLES = ["admin", "super_admin"];
const ALLOWED_CREATE_ROLES = ["agent", "sales_manager", "worker", "admin"];
const REDIRECT_URLS: Record<string, string> = {
  agent: "https://claimvelo.com/agent-signin",
  sales_manager: "https://claimvelo.com/agent-signin",
  worker: "https://claimvelo.com/signin",
  admin: "https://claimvelo.com/signin",
};

interface WelcomePayload {
  email: string;
  fullName: string;
  role: string; // runtime-validated against ALLOWED_CREATE_ROLES
  agentCode?: string;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateQrDataUrl(url: string): Promise<string> {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&format=png`;
  return qrUrl;
}

function buildWelcomeHtml(p: {
  fullName: string;
  email: string;
  inviteLink: string;
  role: string;
  agentCode?: string;
  qrImageUrl?: string;
}): string {
  const roleLabel = p.role === "sales_manager" ? "Sales Manager" : p.role === "admin" ? "Admin" : p.role === "worker" ? "Team Member" : "Agent";
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
        Your ClaimVelo ${roleLabel} account has been created. Click the button below to activate your account and set your password.
      </div>

      <!-- Account info -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;">Your Account</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:5px 0;color:#64748b;width:120px;">Email</td>
            <td style="padding:5px 0;font-weight:700;color:#0f172a;">${p.email}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#64748b;">Role</td>
            <td style="padding:5px 0;font-weight:700;color:#0f172a;">${roleLabel}</td>
          </tr>
          ${p.agentCode ? `<tr>
            <td style="padding:5px 0;color:#64748b;">Agent Code</td>
            <td style="padding:5px 0;font-family:monospace;font-weight:700;color:#0f172a;">${p.agentCode}</td>
          </tr>` : ""}
        </table>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${p.inviteLink}" style="display:inline-block;padding:13px 32px;background:${accentColor};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:-0.1px;">
          Set Your Password &rarr;
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
        <strong>Security note:</strong> This invite link is single-use and expires after 24 hours. If you didn't expect this invitation, please ignore this email.
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      ClaimVelo Ltd. &middot; 1265 55th St, Brooklyn, NY 11219<br>
      support@claimvelo.com &middot; Registered in England &amp; Wales No. 12345678
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // ── Abuse protection: rate limit per client IP (first layer only) ──────────
  const ip = getClientIp(req);
  const { allowed: rlAllowed } = rateLimit(`send-welcome-email:${ip}`, 10, 600_000);
  if (!rlAllowed) {
    return jsonError(429, "Too many requests. Please try again shortly.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Authentication: require a valid user JWT ──────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonError(401, "Authentication required");
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) {
    return jsonError(401, "Invalid or expired token");
  }

  // ── Authorization: only admin / super_admin may create staff accounts ──────
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
    return jsonError(403, "Only administrators can create staff accounts");
  }

  try {
    const payload: WelcomePayload = await req.json();

    // ── Validate required fields ──────────────────────────────────────────────
    if (!payload.email || !payload.fullName || !payload.role) {
      return jsonError(400, "email, fullName, and role are required");
    }

    // ── Validate role against explicit allowlist ─────────────────────────────
    // Only 'agent', 'sales_manager', 'worker', and 'admin' may be created
    // through this endpoint. This prevents privilege escalation — admin can
    // NEVER create or promote a super_admin, customer, lawyer, or seo_worker.
    if (!ALLOWED_CREATE_ROLES.includes(payload.role)) {
      return jsonError(400, `Role '${payload.role}' is not allowed.`);
    }

    // ── Duplicate check: prevent re-creating an existing account ─────────────
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", payload.email)
      .maybeSingle();
    if (existingProfile) {
      return jsonError(409, "An account with this email already exists.");
    }

    // ── 1. Create the auth user + generate invite link (single step) ──────────
    // generateLink({ type: 'invite' }) creates the user and returns a one-time
    // link the user clicks to confirm their email and set their own password.
    // No plaintext password is ever generated or sent.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email: payload.email,
      options: {
        redirectTo: REDIRECT_URLS[payload.role] || "https://claimvelo.com/signin",
      },
    });

    if (linkError || !linkData?.user?.id || !linkData?.properties?.action_link) {
      return jsonError(400, linkError?.message || "Failed to create user account");
    }

    const userId = linkData.user.id;
    const inviteLink = linkData.properties.action_link;

    // ── 3. Insert the profile row ──────────────────────────────────────────────
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      role: payload.role,
      full_name: payload.fullName,
      email: payload.email,
    });

    if (profileError) {
      // Cleanup: delete the auth user (no profile = no access)
      await admin.auth.admin.deleteUser(userId);
      return jsonError(500, `Failed to create profile: ${profileError.message}. Account was not created.`);
    }

    // ── 4. Insert worker_profiles row (all staff roles) ────────────────────────
    if (payload.role === "agent" || payload.role === "worker" || payload.role === "admin") {
      const { error: workerError } = await admin.from("worker_profiles").insert({
        user_id: userId,
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
        agent_code: payload.agentCode ? payload.agentCode.toUpperCase() : "",
        status: "active",
      });

      if (workerError) {
        // Cleanup: delete profile + auth user
        await admin.from("profiles").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);
        return jsonError(500, `Failed to create staff profile: ${workerError.message}. Account was not created.`);
      }
    }

    // ── 5. Generate QR code (agents only) ──────────────────────────────────────
    let qrImageUrl: string | undefined;
    if (payload.agentCode) {
      const claimUrl = `https://claimvelo.com/claim?agent=${encodeURIComponent(payload.agentCode)}`;
      qrImageUrl = await generateQrDataUrl(claimUrl);
    }

    // ── 6. Send the welcome email with the invite link (best-effort) ───────────
    const html = buildWelcomeHtml({
      fullName: payload.fullName,
      email: payload.email,
      inviteLink,
      role: payload.role,
      agentCode: payload.agentCode,
      qrImageUrl,
    });

    const roleLabelForSubject = payload.role === "sales_manager" ? "Sales Manager" : payload.role === "admin" ? "Admin" : payload.role === "worker" ? "Team Member" : "Agent";
    const subject = `Welcome to ClaimVelo — Set Your Password to Activate Your ${roleLabelForSubject} Account`;
    let emailSent = true;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured — welcome email not sent");
      emailSent = false;
    } else {
      try {
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
          emailSent = false;
        }
      } catch (e) {
        console.error("Email send failed:", e);
        emailSent = false;
      }
    }

    // ── 7. Record in audit_log (best-effort) ───────────────────────────────────
    try {
      await admin.from("audit_log").insert({
        user_id: user.id,
        user_email: callerProfile.email,
        role: callerProfile.role,
        action: "staff_account_created",
        entity_type: "profile",
        entity_id: userId,
        new_values: {
          created_email: payload.email,
          created_role: payload.role,
          created_full_name: payload.fullName,
          email_sent: emailSent,
        },
      });
    } catch (e) {
      console.error("Audit log insert failed:", e);
    }

    return new Response(
      JSON.stringify({ ok: true, userId, emailSent }),
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
