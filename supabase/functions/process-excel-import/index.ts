import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { isKnownIata, isValidFlightNumber } from "../_shared/airportCodes.ts";

/**
 * process-excel-import
 *
 * Server-side ingestion for the Excel Leads MVP.
 *
 *   Admin / super_admin only.
 *   - Resolves & validates agent_id server-side (never trusts the client).
 *   - Stores EVERY original parsed row in import_raw_rows.
 *   - Deduplicates rows (within-batch identical rows + cross-batch lead reuse).
 *   - Groups rows by booking (PNR) + passenger → ONE lead per passenger.
 *   - Preserves all flight segments in order (lead_flight_segments).
 *   - Never creates a Claim. Never runs the Rules Engine. Never verifies
 *     flights, contacts customers, sends emails, or creates commissions.
 *
 * Input:
 *   {
 *     fileName: string,
 *     agentCode: string,            // may be "" for no attribution
 *     rows: ParsedRow[]              // already parsed client-side
 *   }
 *
 * ParsedRow shape (matches the BulkImport parsing helpers):
 *   { rowNumber, pnr, passengerName, firstName, lastName, email, phone,
 *     flightNumber, flightDate, origin, destination, delayMinutes, delayReason,
 *     valid, errors[] }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParsedRow {
  rowNumber: number;
  pnr: string;
  passengerName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  delayMinutes: number | null;
  delayReason: string;
  bookingStatus?: string;
  valid: boolean;
  errors: string[];
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Build the stable lead identity key: PNR + lower(first) + lower(last). */
function leadKey(pnr: string, firstName: string, lastName: string): string {
  return [
    pnr.trim().toUpperCase(),
    firstName.trim().toLowerCase(),
    lastName.trim().toLowerCase(),
  ].join("|");
}

/** Build a within-batch row dedup key: PNR + passenger + flight + date. */
function rowDedupKey(r: ParsedRow): string {
  return [
    r.pnr.trim().toUpperCase(),
    r.passengerName.trim().toLowerCase(),
    r.flightNumber.trim().toUpperCase(),
    r.flightDate.trim(),
  ].join("|");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── 1. Auth: verify admin / super_admin JWT ────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonError(401, "Authentication required");
  }
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) {
    return jsonError(401, "Invalid or expired token");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return jsonError(403, "Only admins can import Excel leads");
  }

  // ── 2. Parse request body ──────────────────────────────────────────────────
  let body: { fileName?: string; agentCode?: string; rows?: ParsedRow[] };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const fileName = (body.fileName || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return jsonError(400, "No rows to import");
  }

  // ── 3. Resolve agent_id server-side (never trust the client) ───────────────
  let validatedAgentCode = "—";
  let validatedAgentId: string | null = null;
  const rawAgentCode = (body.agentCode || "").trim().toUpperCase();
  if (rawAgentCode && rawAgentCode !== "—") {
    const { data: agentProfile } = await admin
      .from("worker_profiles")
      .select("id, agent_code, role, status")
      .eq("agent_code", rawAgentCode)
      .eq("role", "agent")
      .eq("status", "active")
      .maybeSingle();
    if (agentProfile) {
      validatedAgentCode = agentProfile.agent_code;
      validatedAgentId = agentProfile.id;
    }
    // Invalid codes are silently dropped — no fake attribution
  }

  // ── 4. Create the import batch ─────────────────────────────────────────────
  const { data: batch, error: batchError } = await admin
    .from("import_batches")
    .insert({
      file_name: fileName,
      agent_id: validatedAgentId,
      agent_code: validatedAgentCode,
      total_rows: rows.length,
      status: "processing",
      created_by: user.id,
      created_by_email: profile.email || "",
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return jsonError(500, `Failed to create import batch: ${batchError?.message || "unknown"}`);
  }
  const batchId = batch.id;

  // ── 5. Within-batch row deduplication ──────────────────────────────────────
  // Two rows with identical (PNR + passenger + flight + date) are duplicates;
  // only the first occurrence is kept for grouping. ALL rows are still stored.
  const seenRowKeys = new Set<string>();
  const dedupedRows: ParsedRow[] = [];
  for (const r of rows) {
    const key = rowDedupKey(r);
    if (seenRowKeys.has(key)) {
      // duplicate within this batch — still stored, excluded from grouping
      continue;
    }
    seenRowKeys.add(key);
    dedupedRows.push(r);
  }

  // ── 6. Group valid, unique rows by (PNR + passenger) → one lead per passenger
  type Group = { key: string; pnr: string; firstName: string; lastName: string; email: string; phone: string; rows: ParsedRow[] };
  const groups = new Map<string, Group>();
  for (const r of dedupedRows) {
    // Only valid rows participate in grouping. Invalid rows are still stored
    // but do not form leads on their own.
    if (!r.valid) continue;
    const key = leadKey(r.pnr, r.firstName, r.lastName);
    let g = groups.get(key);
    if (!g) {
      g = { key, pnr: r.pnr, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone, rows: [] };
      groups.set(key, g);
    }
    // Keep the most-complete contact info across the group
    if (!g.email && r.email) g.email = r.email;
    if (!g.phone && r.phone) g.phone = r.phone;
    g.rows.push(r);
  }

  // ── 7. Check which leads already exist (cross-batch / re-import dedup) ──────
  const leadKeys = Array.from(groups.keys());
  const existingLeadMap = new Map<string, string>(); // leadKey -> lead id
  if (leadKeys.length > 0) {
    const { data: existingLeads } = await admin
      .from("leads")
      .select("id, lead_key")
      .in("lead_key", leadKeys);
    for (const el of existingLeads || []) {
      existingLeadMap.set(el.lead_key, el.id);
    }
  }

  // ── 8. Determine today (server date) for FUTURE detection ───────────────────
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── 9. Create new leads + segments ──────────────────────────────────────────
  const leadIdByKey = new Map<string, string>(); // leadKey -> lead id (this batch)
  let leadsCreated = 0;
  let duplicatesSkipped = 0;
  let warnings = 0;
  let reviews = 0;
  let future = 0;
  let ready = 0;

  for (const g of groups.values()) {
    // Sort segments by flight_date then row order to preserve itinerary order
    const sortedRows = [...g.rows].sort((a, b) => {
      const da = a.flightDate || "";
      const db = b.flightDate || "";
      if (da !== db) return da < db ? -1 : 1;
      return a.rowNumber - b.rowNumber;
    });

    // Determine lead status
    let status = "READY";
    let reviewReason = "";

    if (existingLeadMap.has(g.key)) {
      // Re-import: lead already exists — do NOT create a duplicate lead.
      leadIdByKey.set(g.key, existingLeadMap.get(g.key)!);
      duplicatesSkipped++;
      continue;
    }

    // FUTURE: any flight date in the future → whole lead is FUTURE
    // (highest priority — future flights are never treated as compensation claims)
    const allDates = sortedRows.map((r) => r.flightDate).filter(Boolean).sort();
    const hasFuture = allDates.some((d) => d > todayStr);
    if (hasFuture) {
      status = "FUTURE";
      future++;
    }

    // ── REVIEW checks (only if not FUTURE) ────────────────────────────────
    // Priority order: cancelled booking > cancel keyword > unknown airport >
    //                 malformed flight number. First match wins.

    // 1. Booking_Status = CANCELLED → REVIEW
    //    Source booking cancellation must NEVER be interpreted as proof that
    //    the airline cancelled the flight. Actual flight cancellation still
    //    requires real flight-provider evidence (Rules Engine).
    if (status === "READY") {
      const hasCancelledBooking = sortedRows.some((r) =>
        (r.bookingStatus || "").trim().toUpperCase() === "CANCELLED"
      );
      if (hasCancelledBooking) {
        status = "REVIEW";
        reviewReason = "SOURCE_BOOKING_CANCELLED — source booking was cancelled; not interpreted as flight cancellation";
        reviews++;
      }
    }

    // 2. Cancel keyword in delayReason / passengerName → REVIEW
    if (status === "READY") {
      const hasCancelKeyword = sortedRows.some((r) =>
        /cancel/i.test(r.delayReason) || /cancel/i.test(r.passengerName)
      );
      if (hasCancelKeyword) {
        status = "REVIEW";
        reviewReason = "Row mentions cancellation — manual review required (not auto-interpreted as flight cancellation)";
        reviews++;
      }
    }

    // 3. Unknown airport code → REVIEW (validated against ClaimVelo reference)
    if (status === "READY") {
      const unknownCodes = new Set<string>();
      for (const r of sortedRows) {
        if (r.origin && !isKnownIata(r.origin)) unknownCodes.add(r.origin);
        if (r.destination && !isKnownIata(r.destination)) unknownCodes.add(r.destination);
      }
      if (unknownCodes.size > 0) {
        status = "REVIEW";
        reviewReason = `Unknown airport code(s): ${[...unknownCodes].join(", ")} — not in ClaimVelo reference dataset`;
        reviews++;
      }
    }

    // 4. Malformed flight number → REVIEW
    if (status === "READY") {
      const malformed = sortedRows.filter((r) => r.flightNumber && !isValidFlightNumber(r.flightNumber));
      if (malformed.length > 0) {
        status = "REVIEW";
        reviewReason = `Malformed flight number(s): ${malformed.map((r) => r.flightNumber).join(", ")}`;
        reviews++;
      }
    }

    // ── WARNING (only if not REVIEW or FUTURE) ─────────────────────────────
    if (status === "READY") {
      const hasMissingContact = !g.email.trim() || !g.phone.trim();
      if (hasMissingContact) {
        status = "WARNING";
        reviewReason = !g.email.trim() && !g.phone.trim()
          ? "Missing email and phone"
          : !g.email.trim() ? "Missing email" : "Missing phone";
        warnings++;
      }
    }

    if (status === "READY") ready++;

    // Compute display fields
    const firstDate = allDates[0] || null;
    const lastDate = allDates[allDates.length - 1] || null;
    const firstRow = sortedRows[0];
    const lastRow = sortedRows[sortedRows.length - 1];
    const route = firstRow && lastRow
      ? `${firstRow.origin}→${lastRow.destination}`
      : (firstRow ? `${firstRow.origin}→${firstRow.destination}` : "");

    // Insert the lead
    const { data: newLead, error: leadErr } = await admin
      .from("leads")
      .insert({
        batch_id: batchId,
        booking_reference: g.pnr,
        passenger_first_name: g.firstName,
        passenger_last_name: g.lastName,
        email: g.email,
        phone: g.phone,
        agent_id: validatedAgentId,
        agent_code: validatedAgentCode,
        status,
        review_reason: reviewReason,
        segment_count: sortedRows.length,
        first_flight_date: firstDate,
        last_flight_date: lastDate,
        route,
        claim_id: null,
        lead_key: g.key,
      })
      .select("id")
      .single();
    if (leadErr || !newLead) {
      console.error("Lead insert failed:", leadErr?.message, g.key);
      continue;
    }
    leadIdByKey.set(g.key, newLead.id);
    leadsCreated++;

    // Insert segments in order
    const segRows = sortedRows.map((r, i) => ({
      lead_id: newLead.id,
      segment_order: i + 1,
      flight_number: r.flightNumber,
      flight_date: r.flightDate || null,
      origin: r.origin,
      destination: r.destination,
      delay_minutes: r.delayMinutes,
      delay_reason: r.delayReason,
    }));
    if (segRows.length > 0) {
      const { error: segErr } = await admin.from("lead_flight_segments").insert(segRows);
      if (segErr) console.error("Segment insert failed:", segErr.message);
    }
  }

  // ── 10. Store ALL raw rows (valid + invalid + duplicates) ───────────────────
  const rawRowInserts = rows.map((r) => {
    const key = leadKey(r.pnr, r.firstName, r.lastName);
    return {
      batch_id: batchId,
      row_number: r.rowNumber,
      pnr: r.pnr,
      passenger_name: r.passengerName,
      first_name: r.firstName,
      last_name: r.lastName,
      email: r.email,
      phone: r.phone,
      flight_number: r.flightNumber,
      flight_date: r.flightDate || null,
      origin: r.origin,
      destination: r.destination,
      delay_minutes: r.delayMinutes,
      delay_reason: r.delayReason,
      raw_data: r as unknown as Record<string, unknown>,
      validation_status: r.valid ? "valid" : "invalid",
      validation_errors: r.errors,
      dedup_status: "unique",
      dedup_key: rowDedupKey(r),
      lead_id: leadIdByKey.get(key) || existingLeadMap.get(key) || null,
    };
  });

  // Mark within-batch duplicate rows (second+ occurrence of the same rowDedupKey)
  const rowKeyCount = new Map<string, number>();
  for (const r of rows) {
    const k = rowDedupKey(r);
    rowKeyCount.set(k, (rowKeyCount.get(k) || 0) + 1);
  }
  const rowKeySeen = new Map<string, number>();
  for (const rr of rawRowInserts) {
    const c = rowKeySeen.get(rr.dedup_key) || 0;
    rowKeySeen.set(rr.dedup_key, c + 1);
    if ((rowKeyCount.get(rr.dedup_key) || 0) > 1 && c > 0) {
      rr.dedup_status = "duplicate";
    }
  }

  // Bulk insert raw rows in chunks to avoid payload limits (1,800 rows)
  const CHUNK = 500;
  for (let i = 0; i < rawRowInserts.length; i += CHUNK) {
    const slice = rawRowInserts.slice(i, i + CHUNK);
    const { error: rawErr } = await admin.from("import_raw_rows").insert(slice);
    if (rawErr) console.error("Raw row insert failed:", rawErr.message, "chunk", i);
  }

  // ── 11. Finalize the batch summary ──────────────────────────────────────────
  const summary = {
    total_rows: rows.length,
    valid_rows: rows.filter((r) => r.valid).length,
    invalid_rows: rows.filter((r) => !r.valid).length,
    unique_rows: dedupedRows.length,
    duplicate_rows: rows.length - dedupedRows.length,
    leads_created: leadsCreated,
    leads_already_existing: duplicatesSkipped,
    status_counts: { READY: ready, WARNING: warnings, REVIEW: reviews, FUTURE: future, DUPLICATE: 0 },
  };

  await admin.from("import_batches").update({
    status: "completed",
    summary,
  }).eq("id", batchId);

  return new Response(JSON.stringify({
    success: true,
    batch_id: batchId,
    summary,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
