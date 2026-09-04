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
import { extractIdentifiers, matchEmailToClaim } from "../_shared/emailMatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_MESSAGES = 50; // per sync batch

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const mailbox = getMonitoringEmail();
  const batchId = `sync-${Date.now()}`;

  try {
    // ── 1. Get or create sync state ──────────────────────────────────────────
    let { data: syncState } = await supabase
      .from("gmail_sync_state")
      .select("*")
      .eq("mailbox_email", mailbox)
      .maybeSingle();

    if (!syncState) {
      const { data: created } = await supabase
        .from("gmail_sync_state")
        .insert({ mailbox_email: mailbox, sync_status: "running" })
        .select()
        .single();
      syncState = created;
    } else {
      await supabase
        .from("gmail_sync_state")
        .update({ sync_status: "running", last_error: "" })
        .eq("id", syncState.id);
    }

    // ── 2. Get current mailbox profile (for initial historyId) ───────────────
    let startHistoryId = syncState?.history_id;

    if (!startHistoryId) {
      // First sync — get profile to seed historyId, then list recent messages
      const profileRes = await gmailApi(`/users/${mailbox}/profile`);
      if (!profileRes.ok) {
        const err = await profileRes.text();
        throw new Error(`Gmail profile failed: ${profileRes.status} ${err}`);
      }
      const profile = await profileRes.json();
      startHistoryId = profile.historyId;

      // For initial sync, fetch recent messages directly
      const listRes = await gmailApi(
        `/users/${mailbox}/messages?maxResults=${MAX_MESSAGES}`,
      );
      if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
      const listData = await listRes.json();
      const messageIds = (listData.messages || []).map((m: any) => m.id);

      await syncMessages(supabase, mailbox, messageIds, batchId);

      // Save historyId after initial sync
      await supabase
        .from("gmail_sync_state")
        .update({
          history_id: startHistoryId,
          last_synced_at: new Date().toISOString(),
          sync_status: "idle",
        })
        .eq("id", syncState.id);

      return jsonResponse({ ok: true, mode: "initial", synced: messageIds.length, batchId });
    }

    // ── 3. Incremental sync via history ─────────────────────────────────────
    let allMessageIds: string[] = [];
    let pageToken: string | null = null;
    let currentHistoryId = startHistoryId;

    do {
      const path = `/users/${mailbox}/history?startHistoryId=${startHistoryId}${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const historyRes = await gmailApi(path);
      if (!historyRes.ok) {
        const err = await historyRes.text();
        // 404 = historyId too old/expired → need full re-sync
        if (historyRes.status === 404) {
          // Reset to full sync on next run
          await supabase
            .from("gmail_sync_state")
            .update({ history_id: null, sync_status: "idle", last_error: "history expired, will full-sync next run" })
            .eq("id", syncState.id);
          return jsonResponse({ ok: true, mode: "expired", message: "historyId expired, will full-sync next run" });
        }
        throw new Error(`Gmail history failed: ${historyRes.status} ${err}`);
      }

      const historyData = await historyRes.json();

      // Collect new message IDs from history records
      for (const record of historyData.history || []) {
        // messagesAdded = new emails received
        if (record.messagesAdded) {
          for (const msg of record.messagesAdded) {
            allMessageIds.push(msg.message.id);
          }
        }
      }

      // Update currentHistoryId to the latest
      if (historyData.historyId) currentHistoryId = historyData.historyId;
      pageToken = historyData.nextPageToken || null;
    } while (pageToken && allMessageIds.length < MAX_MESSAGES);

    // ── 4. Sync each new message ─────────────────────────────────────────────
    await syncMessages(supabase, mailbox, allMessageIds, batchId);

    // ── 5. Update sync state ─────────────────────────────────────────────────
    await supabase
      .from("gmail_sync_state")
      .update({
        history_id: currentHistoryId,
        last_synced_at: new Date().toISOString(),
        sync_status: "idle",
        last_error: "",
      })
      .eq("id", syncState.id);

    return jsonResponse({ ok: true, mode: "incremental", synced: allMessageIds.length, batchId });
  } catch (err) {
    console.error("gmail-sync error:", err);
    // Mark sync state as error
    await supabase
      .from("gmail_sync_state")
      .update({ sync_status: "error", last_error: String(err) })
      .eq("mailbox_email", mailbox);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

/**
 * Fetch full message from Gmail, store in airline_emails, run matching,
 * and download attachments to Supabase Storage.
 */
async function syncMessages(
  supabase: ReturnType<typeof createClient>,
  mailbox: string,
  messageIds: string[],
  batchId: string,
) {
  for (const msgId of messageIds) {
    try {
      // Check if already ingested (idempotency)
      const { data: existing } = await supabase
        .from("airline_emails")
        .select("id")
        .eq("gmail_message_id", msgId)
        .maybeSingle();
      if (existing) continue; // skip — already synced

      // Fetch full message
      const msgRes = await gmailApi(
        `/users/${mailbox}/messages/${msgId}?format=full`,
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const headers = msg.payload?.headers || [];
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const cc = getHeader(headers, "Cc");
      const subject = getHeader(headers, "Subject");
      const messageId = getHeader(headers, "Message-ID");
      const threadId = msg.threadId || "";
      const internalDate = msg.internalDate
        ? new Date(parseInt(msg.internalDate)).toISOString()
        : null;

      // Determine direction — if from our mailbox, it's outbound
      const isOutbound = from.toLowerCase().includes(mailbox.toLowerCase());
      const direction = isOutbound ? "outbound" : "inbound";

      // Extract body
      const { text, html } = extractBodyParts(msg.payload);
      const snippet = msg.snippet || text.substring(0, 200);

      // Extract attachments metadata
      const attachments = extractAttachments(msg.payload);

      // ── Run claim matching ──────────────────────────────────────────────
      const ids = extractIdentifiers(subject, text);
      const matchResult = await matchEmailToClaim(supabase, ids);

      // ── Insert into airline_emails ──────────────────────────────────────
      // Use Message-ID header for idempotency if available, else fall back to Gmail message ID
      const idempotencyKey = messageId || msgId;

      // Check idempotency by Message-ID header too
      const { data: existingByMsgId } = await supabase
        .from("airline_emails")
        .select("id")
        .eq("gmail_message_id", idempotencyKey)
        .maybeSingle();
      if (existingByMsgId) continue;

      const { data: inserted, error: insertError } = await supabase
        .from("airline_emails")
        .insert({
          gmail_message_id: idempotencyKey,
          thread_id: threadId,
          direction: direction,
          from_address: from,
          to_address: to,
          cc_address: cc,
          subject: subject,
          body_text: text,
          body_html: html,
          snippet: snippet,
          received_at: internalDate,
          sent_at: isOutbound ? internalDate : null,
          claim_id: matchResult.claim_id,
          matching_confidence: matchResult.confidence,
          matched_fields: matchResult.matched_fields,
          matched_claim_refs: matchResult.candidate_refs,
          email_status: "NEW",
          has_attachments: attachments.length > 0,
          attachment_count: attachments.length,
          sync_batch_id: batchId,
          raw_headers: { threadId, labels: msg.labelIds || [] },
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error(`Insert failed for ${msgId}:`, insertError?.message);
        continue;
      }

      const emailId = inserted.id;

      // ── Download attachments to Supabase Storage ─────────────────────────
      for (const att of attachments) {
        try {
          const buf = await downloadAttachment(msgId, att.attachmentId);
          const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${emailId}/${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("airline-email-attachments")
            .upload(storagePath, buf, { contentType: att.mimeType });

          if (uploadError) {
            console.error(`Upload failed for ${att.filename}:`, uploadError.message);
          } else {
            await supabase.from("airline_email_attachments").insert({
              email_id: emailId,
              claim_id: matchResult.claim_id,
              gmail_attachment_id: att.attachmentId,
              file_name: att.filename,
              content_type: att.mimeType,
              file_size: att.size,
              storage_path: storagePath,
            });
          }
        } catch (e) {
          console.error(`Attachment download error for ${att.filename}:`, e);
        }
      }

      // ── Record timeline event ────────────────────────────────────────────
      if (matchResult.claim_id) {
        await supabase.from("claim_status_history").insert({
          claim_id: matchResult.claim_id,
          field_name: "airline_email",
          from_status: null,
          to_status: `${direction}:${subject}`,
          source: "system",
          reason: `Email matched (${matchResult.confidence}) — ${Object.entries(matchResult.matched_fields).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        });
      }
    } catch (e) {
      console.error(`Error syncing message ${msgId}:`, e);
    }
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
