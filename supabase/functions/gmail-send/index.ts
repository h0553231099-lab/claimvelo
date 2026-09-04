import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getMonitoringEmail, getGmailAccessToken, getHeader } from "../_shared/gmail.ts";
import { extractIdentifiers, matchEmailToClaim } from "../_shared/emailMatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STAFF_ROLES = ["admin", "super_admin", "worker"];

interface SendPayload {
  to: string;
  subject: string;
  body: string;
  claim_id?: string;
  reply_to_message_id?: string; // Gmail thread to reply within
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
  if (!authHeader.startsWith("Bearer ")) return jsonError(401, "Authentication required");
  const token = authHeader.replace("Bearer ", "").trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) return jsonError(401, "Invalid or expired token");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, claimvelo_email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return jsonError(403, "Only staff can send emails");
  }

  try {
    const payload: SendPayload = await req.json();
    const { to, subject, body, claim_id, reply_to_message_id } = payload;

    if (!to || !subject || !body) {
      return jsonError(400, "Missing required fields: to, subject, body");
    }

    const mailbox = getMonitoringEmail();
    const senderName = profile.full_name || "ClaimVelo";
    const accessToken = await getGmailAccessToken();

    // Build RFC822 message
    const fromHeader = `${senderName} <${mailbox}>`;
    const dateHeader = new Date().toUTCString();
    const messageIdHeader = `<claimvelo-${Date.now()}-${Math.random().toString(36).slice(2)}@claimvelo.com>`;

    let rfc822 = "";
    rfc822 += `From: ${fromHeader}\r\n`;
    rfc822 += `To: ${to}\r\n`;
    rfc822 += `Subject: ${subject}\r\n`;
    rfc822 += `Date: ${dateHeader}\r\n`;
    rfc822 += `Message-ID: ${messageIdHeader}\r\n`;
    rfc822 += `MIME-Version: 1.0\r\n`;
    rfc822 += `Content-Type: text/plain; charset=UTF-8\r\n`;
    rfc822 += `Content-Transfer-Encoding: quoted-printable\r\n`;
    rfc822 += `\r\n`;
    rfc822 += body;

    // Encode as base64url
    const encoded = btoa(unescape(encodeURIComponent(rfc822)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send via Gmail API — this places it in Sent automatically
    const sendBody: any = { raw: encoded };
    if (reply_to_message_id) {
      sendBody.threadId = reply_to_message_id;
    }

    const sendRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${mailbox}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(`Gmail send failed: ${sendRes.status} ${err}`);
    }

    const sentData = await sendRes.json();
    const gmailMessageId = sentData.id;

    // ── Store the sent email in airline_emails ──────────────────────────────
    // Run matching on the outbound email too (for claim linking)
    const ids = extractIdentifiers(subject, body);
    const matchResult = await matchEmailToClaim(admin, ids);
    const effectiveClaimId = claim_id || matchResult.claim_id;

    const { data: stored } = await admin.from("airline_emails").insert({
      gmail_message_id: gmailMessageId,
      thread_id: sentData.threadId || "",
      direction: "outbound",
      from_address: fromHeader,
      to_address: to,
      subject: subject,
      body_text: body,
      body_html: "",
      snippet: body.substring(0, 200),
      sent_at: new Date().toISOString(),
      received_at: null,
      claim_id: effectiveClaimId,
      matching_confidence: effectiveClaimId ? "HIGH" : "NONE",
      matched_fields: claim_id ? { manual: claim_id } : matchResult.matched_fields,
      email_status: "RESOLVED",
      has_attachments: false,
      attachment_count: 0,
      sync_batch_id: `send-${Date.now()}`,
      raw_headers: { gmail_id: gmailMessageId, thread_id: sentData.threadId },
    }).select("id").single();

    // ── Record timeline event ───────────────────────────────────────────────
    if (effectiveClaimId && stored) {
      await admin.from("claim_status_history").insert({
        claim_id: effectiveClaimId,
        field_name: "airline_email",
        from_status: null,
        to_status: `outbound:${subject}`,
        source: "staff",
        changed_by: user.id,
        reason: `Sent via Gmail by ${senderName}`,
      });
    }

    return new Response(JSON.stringify({ ok: true, gmail_id: gmailMessageId, email_record_id: stored?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gmail-send error:", err);
    return jsonError(500, String(err));
  }
});
