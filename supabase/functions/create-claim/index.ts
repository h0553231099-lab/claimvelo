import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { evaluateClaimInternal } from "../_shared/evaluate.ts";
import { rateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { dbRateLimit } from "../_shared/dbRateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // ── Abuse protection: rate limit per client IP ─────────────────────────────
  // Public endpoint — no login required. Limits fake-claim spam that would
  // fill the database and trigger confirmation emails. First-layer guard only
  // (in-memory, per-isolate); a distributed limit should back this up.
  const ip = getClientIp(req);
  const { allowed, retryAfterMs } = rateLimit(`create-claim:${ip}`, 5, 600_000);
  if (!allowed) {
    return jsonError(429, `Too many claim submissions. Please try again in ${Math.ceil(retryAfterMs / 1000)}s.`);
  }

  // ── Distributed rate limit (DB-backed, authoritative across isolates) ──────
  const { allowed: dbAllowed, retryAfterMs: dbRetryMs } = await dbRateLimit(`create-claim:${ip}`, 5, 600);
  if (!dbAllowed) {
    return new Response(
      JSON.stringify({ error: `Too many claim submissions. Please try again in ${Math.ceil(dbRetryMs / 1000)}s.` }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(dbRetryMs / 1000)),
        },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service-role client for all DB writes (bypasses RLS)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const { claim: claimData, files: fileMetadata } = body;

    if (!claimData) {
      return jsonError(400, "Missing claim data");
    }

    // ── 1. Resolve the submitting user (if authenticated) ────────────────────
    let customerUserId: string | null = null;
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ") && !authHeader.includes(serviceRoleKey)) {
      // User JWT — verify with a client that uses the anon key
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await userClient.auth.getUser(token);
      if (user) {
        customerUserId = user.id;
      }
    }

    // ── 2. Generate claim_ref and access token ──────────────────────────────
    const claimRef = "CLM-" + Date.now().toString().slice(-6);

    // Generate a cryptographically random access token.
    // Only the SHA-256 hash is stored; the raw token is returned once to the client.
    const rawAccessToken = crypto.randomUUID();
    const tokenHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawAccessToken),
    );
    const accessTokenHash = Array.from(new Uint8Array(tokenHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ── 3. Duplicate check ────────────────────────────────────────────────────
    if (claimData.flight_number && claimData.flight_date && claimData.email) {
      const { data: existing } = await admin
        .from("claims")
        .select("claim_ref")
        .eq("flight_number", claimData.flight_number)
        .eq("flight_date", claimData.flight_date)
        .eq("email", claimData.email)
        .maybeSingle();
      if (existing) {
        return jsonError(409, `This flight claim has already been submitted under reference ${existing.claim_ref}`);
      }
    }

    // ── 4. Insert the claim ───────────────────────────────────────────────────
    const insertRow: Record<string, unknown> = {
      claim_ref: claimRef,
      passenger_first_name: claimData.passenger_first_name || "",
      passenger_last_name: claimData.passenger_last_name || "",
      email: claimData.email || "",
      phone: claimData.phone || "",
      address: claimData.address || "",
      country: claimData.country || "United Kingdom",
      flight_number: claimData.flight_number || "",
      flight_date: claimData.flight_date || null,
      departure: claimData.departure || "",
      arrival: claimData.arrival || "",
      airline: claimData.airline || "",
      issue_type: claimData.issue_type || "Flight Disruption",
      airline_reason: claimData.airline_reason || "",
      status: "Untouched",
      amount: "€600",
      agent: claimData.agent || "—",
      loa_signed: claimData.loa_signed || false,
      signature_data: claimData.signature_data || "",
      prior_comp_type: claimData.prior_comp_type || null,
      prior_signed: claimData.prior_signed || null,
      review_required: claimData.review_required || false,
      customer_user_id: customerUserId,
      access_token_hash: accessTokenHash,
      // Phase B.2 fields
      cancellation_notice_date: claimData.cancellation_notice_date || null,
      cancellation_notice_source: claimData.cancellation_notice_source || '',
      replacement_offered: claimData.replacement_offered || false,
      replacement_accepted: claimData.replacement_accepted || false,
      replacement_flight_number: claimData.replacement_flight_number || '',
      replacement_scheduled_dep_customer: claimData.replacement_scheduled_dep_customer || null,
      replacement_scheduled_arr_customer: claimData.replacement_scheduled_arr_customer || null,
      boarding_type: claimData.boarding_type || '',
      confirmed_reservation: claimData.confirmed_reservation ?? null,
      checked_in_on_time: claimData.checked_in_on_time ?? null,
      denial_reason: claimData.denial_reason || '',
      is_single_booking: claimData.is_single_booking || false,
      original_scheduled_final_arrival: claimData.original_scheduled_final_arrival || null,
    };

    const { data: newClaim, error: insertError } = await admin
      .from("claims")
      .insert(insertRow)
      .select("id")
      .single();

    if (insertError || !newClaim) {
      return jsonError(500, `Failed to create claim: ${insertError?.message || "unknown error"}`);
    }

    // ── 5. Create file upload URLs ────────────────────────────────────────────
    const uploadUrls: Array<{ name: string; url: string; path: string }> = [];
    if (fileMetadata && Array.isArray(fileMetadata)) {
      for (const file of fileMetadata) {
        if (!file.name) continue;
        const storagePath = `claim-files/${newClaim.id}/${Date.now()}-${file.name}`;
        const { data: signedData, error: signedError } = await admin
          .storage
          .from("claim-files")
          .createSignedUploadUrl(storagePath);

        if (!signedError && signedData) {
          // Create claim_files record
          await admin.from("claim_files").insert({
            claim_id: newClaim.id,
            file_name: file.name,
            file_size: file.size || 0,
            file_type: file.type || "",
            storage_path: storagePath,
            note: file.note || "",
          });
          uploadUrls.push({
            name: file.name,
            url: signedData.signedUrl || signedData.url,
            path: storagePath,
          });
        }
      }
    }

    // ── 6. Insert notification ─────────────────────────────────────────────────
    const fullName = `${claimData.passenger_first_name || ""} ${claimData.passenger_last_name || ""}`.trim();
    const airline = claimData.airline || "Unknown airline";
    const route = claimData.departure && claimData.arrival ? `${claimData.departure} → ${claimData.arrival}` : "";
    await admin.from("notifications").insert({
      type: "new_claim",
      claim_ref: claimRef,
      claim_id: newClaim.id,
      message: `New claim from ${fullName} — ${airline} ${route}`.trim(),
    });

    // ── 7. Run evaluation internally ──────────────────────────────────────────
    let evaluation = null;
    try {
      evaluation = await evaluateClaimInternal(supabaseUrl, serviceRoleKey, newClaim.id);
    } catch (e) {
      console.error("Evaluation failed:", e);
      // Non-blocking — claim stays as "Untouched" for manual review
    }

    // ── 8. Send confirmation email (best-effort) ───────────────────────────────
    if (claimData.email) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-claim-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            type: "claim_submitted",
            to: claimData.email,
            passengerName: fullName,
            claimRef,
            airline,
            route,
            amount: "€600",
          }),
        });
      } catch {
        // Non-blocking
      }
    }

    // ── 9. Return result ───────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      claim_id: newClaim.id,
      claim_ref: claimRef,
      access_token: rawAccessToken,
      upload_urls: uploadUrls,
      evaluation,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonError(500, String(err));
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
