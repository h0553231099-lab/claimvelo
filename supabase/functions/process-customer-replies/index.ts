import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  getMonitoringEmail,
  gmailApi,
  getHeader,
  extractBodyParts,
  extractAttachments,
  downloadAttachment,
} from "../_shared/gmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Process customer email replies from the Gmail monitoring inbox.
 *
 * This function:
 * 1. Searches the Gmail inbox for recent emails FROM customer email addresses
 *    (i.e., emails that are NOT from airlines or internal @claimvelo.com addresses)
 * 2. Matches each reply to a claim safely:
 *    - HIGH confidence: sender email matches a claim's customer email AND
 *      subject/body contains the claim_ref (CLM-XXX)
 *    - MEDIUM confidence: sender email matches exactly one claim's customer email
 *    - AMBIGUOUS: sender email matches multiple claims and no claim_ref in subject
 *    - UNMATCHED: sender email doesn't match any claim
 * 3. Stores matched replies in claim_communications
 * 4. Creates a notification for the assigned worker
 *
 * Ambiguous/unmatched replies are stored with their match_status but NOT linked
 * to a specific claim — they are never guessed.
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const mailbox = getMonitoringEmail();
    const batchId = `reply-${Date.now()}`;

    // ── 1. Get already-processed message IDs from claim_communications ────────
    const { data: existing } = await admin
      .from("claim_communications")
      .select("message_id")
      .not("message_id", "is", null);

    const processedIds = new Set((existing || []).map((r: any) => r.message_id));

    // ── 2. List recent inbox messages ─────────────────────────────────────────
    const listRes = await gmailApi(
      `/users/${mailbox}/messages?maxResults=30`,
    );
    if (!listRes.ok) {
      throw new Error(`Gmail list failed: ${listRes.status}`);
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];

    const results: Array<{ id: string; status: string; claim_ref?: string }> = [];

    for (const msg of messages) {
      const msgId = msg.id;

      // Skip already-processed
      if (processedIds.has(msgId)) continue;

      // ── 3. Fetch full message ───────────────────────────────────────────────
      const msgRes = await gmailApi(
        `/users/${mailbox}/messages/${msgId}?format=full`,
      );
      if (!msgRes.ok) continue;
      const msgData = await msgRes.json();

      const fromHeader = getHeader(msgData.payload?.headers, "From") || "";
      const toHeader = getHeader(msgData.payload?.headers, "To") || "";
      const subject = getHeader(msgData.payload?.headers, "Subject") || "";
      const rfc822MessageId = getHeader(msgData.payload?.headers, "Message-ID") || "";
      const dateHeader = getHeader(msgData.payload?.headers, "Date") || "";

      // ── 4. Filter: skip airline emails and internal @claimvelo.com emails ────
      const fromAddress = extractEmailAddress(fromHeader);
      const fromName = extractDisplayName(fromHeader);

      // Skip if from @claimvelo.com (internal)
      if (fromAddress.endsWith("@claimvelo.com")) {
        continue;
      }

      // Skip if from a known airline domain (check against airline_emails)
      // We only process emails from customer email addresses
      // Skip if this email is already in airline_emails (synced by gmail-sync)
      const { data: existingAirline } = await admin
        .from("airline_emails")
        .select("id")
        .eq("gmail_message_id", msgId)
        .maybeSingle();

      if (existingAirline) {
        continue; // Already processed as an airline email
      }

      // ── 5. Extract body ──────────────────────────────────────────────────────
      const bodyText = extractBodyParts(msgData.payload) || "";

      // ── 6. Match to claims ──────────────────────────────────────────────────
      const matchResult = await matchCustomerReply(admin, fromAddress, subject, bodyText);

      if (matchResult.status === "unmatched" || matchResult.status === "ambiguous") {
        // Store in the unmatched review queue — never discard or guess
        const attachments = extractAttachments(msgData.payload);

        // Download attachments to Storage
        const attachmentPaths: string[] = [];
        for (const att of attachments) {
          try {
            const buf = await downloadAttachment(msgId, att.attachmentId);
            const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `unmatched/${msgId}/${safeName}`;
            const { error: uploadError } = await admin.storage
              .from("airline-email-attachments")
              .upload(storagePath, buf, { contentType: att.mimeType });
            if (!uploadError) attachmentPaths.push(storagePath);
          } catch (e) {
            console.error(`Attachment download failed for ${att.filename}:`, e);
          }
        }

        // Check for duplicate (same gmail_message_id already stored)
        const { data: existingUnmatched } = await admin
          .from("unmatched_customer_emails")
          .select("id")
          .eq("gmail_message_id", msgId)
          .maybeSingle();

        if (!existingUnmatched) {
          const receivedAt = msgData.internalDate
            ? new Date(parseInt(msgData.internalDate)).toISOString()
            : new Date().toISOString();

          await admin.from("unmatched_customer_emails").insert({
            gmail_message_id: msgId,
            from_address: fromAddress,
            from_name: fromName,
            to_address: extractEmailAddress(toHeader) || mailbox,
            subject,
            body: bodyText,
            received_at: receivedAt,
            match_status: matchResult.status,
            candidate_claim_refs: matchResult.candidate_refs,
            candidate_claim_ids: [],
            attachment_count: attachments.length,
            attachment_filenames: attachments.map((a) => ({
              filename: a.filename,
              content_type: a.mimeType,
              size: a.size,
            })),
            attachment_storage_paths: attachmentPaths,
          });
        }

        console.log(
          `[PROCESS-CUSTOMER-REPLY] ${matchResult.status} email from ${fromAddress}: ${subject}. ` +
          `Stored in review queue.`,
        );
        results.push({ id: msgId, status: matchResult.status });
        continue;
      }

      // ── 7. Matched — store in claim_communications ───────────────────────────
      const claim = matchResult.claim!;

      // Check for duplicate (same message_id already stored)
      const { data: dupCheck } = await admin
        .from("claim_communications")
        .select("id")
        .eq("message_id", msgId)
        .maybeSingle();

      if (dupCheck) {
        results.push({ id: msgId, status: "duplicate" });
        continue;
      }

      await admin.from("claim_communications").insert({
        claim_id: claim.id,
        direction: "inbound",
        channel: "email",
        subject,
        body: bodyText,
        from_address: fromAddress,
        to_address: extractEmailAddress(toHeader) || mailbox,
        from_name: fromName,
        from_user_id: null,
        match_status: "matched",
        matched_claim_refs: [claim.claim_ref],
        message_id: msgId,
        language: claim.preferred_language || "en",
        read_by_staff: false,
      });

      // ── 8. Notify the assigned worker ───────────────────────────────────────
      await admin.from("notifications").insert({
        type: "customer_reply",
        claim_ref: claim.claim_ref,
        claim_id: claim.id,
        message: `Customer reply from ${fromName} (${fromAddress}) — ${subject}`,
      });

      results.push({ id: msgId, status: "matched", claim_ref: claim.claim_ref });
    }

    return jsonResponse({
      ok: true,
      processed: results.length,
      results,
      batch_id: batchId,
    });
  } catch (err) {
    console.error("process-customer-replies error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ── Helper: extract email address from "Name <email>" format ─────────────────
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return from.toLowerCase().trim();
}

function extractDisplayName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*<.*>/);
  if (match) return match[1].trim();
  return extractEmailAddress(from);
}

// ── Helper: extract CLM-XXX claim references from text ───────────────────────
function extractClaimRefs(text: string): string[] {
  const matches = text.match(/CLM[-\s]?\d{3,6}/gi) || [];
  return [...new Set(matches.map((m) => m.replace(/\s/g, "").toUpperCase()))];
}

// ── Match a customer reply to a claim ───────────────────────────────────────
interface MatchResult {
  status: "matched" | "ambiguous" | "unmatched";
  claim: { id: string; claim_ref: string; preferred_language: string } | null;
  candidate_refs: string[];
}

async function matchCustomerReply(
  supabase: ReturnType<typeof createClient>,
  fromAddress: string,
  subject: string,
  body: string,
): Promise<MatchResult> {
  const text = `${subject}\n${body}`;
  const claimRefs = extractClaimRefs(text);

  // Strategy 1: If claim_ref is in the email, match by claim_ref + sender email
  if (claimRefs.length > 0) {
    for (const ref of claimRefs) {
      const { data: claim } = await supabase
        .from("claims")
        .select("id, claim_ref, email, preferred_language")
        .eq("claim_ref", ref)
        .maybeSingle();

      if (claim) {
        // Verify sender email matches the claim's customer email
        if (claim.email.toLowerCase() === fromAddress) {
          return {
            status: "matched",
            claim: { id: claim.id, claim_ref: claim.claim_ref, preferred_language: claim.preferred_language || "en" },
            candidate_refs: [claim.claim_ref],
          };
        }
        // Claim ref found but sender email doesn't match — don't guess
        return { status: "unmatched", claim: null, candidate_refs: [] };
      }
    }
  }

  // Strategy 2: Match by sender email only
  const { data: claims } = await supabase
    .from("claims")
    .select("id, claim_ref, email, preferred_language")
    .eq("email", fromAddress);

  if (!claims || claims.length === 0) {
    return { status: "unmatched", claim: null, candidate_refs: [] };
  }

  if (claims.length === 1) {
    // Unique match by email
    return {
      status: "matched",
      claim: { id: claims[0].id, claim_ref: claims[0].claim_ref, preferred_language: claims[0].preferred_language || "en" },
      candidate_refs: [claims[0].claim_ref],
    };
  }

  // Multiple claims for this email — ambiguous unless claim_ref narrows it down
  if (claimRefs.length > 0) {
    const matched = claims.find((c: any) => claimRefs.includes(c.claim_ref.toUpperCase()));
    if (matched) {
      return {
        status: "matched",
        claim: { id: matched.id, claim_ref: matched.claim_ref, preferred_language: matched.preferred_language || "en" },
        candidate_refs: [matched.claim_ref],
      };
    }
  }

  // Ambiguous — multiple claims, can't determine which one
  return {
    status: "ambiguous",
    claim: null,
    candidate_refs: claims.map((c: any) => c.claim_ref),
  };
}
