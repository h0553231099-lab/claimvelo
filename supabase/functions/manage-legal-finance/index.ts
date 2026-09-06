import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
 * manage-legal-finance — Phase 9B
 *
 * Server-side edge function for the legal/finance workflow that follows an
 * escalated claim through to resolution:
 *
 *   escalate-claim        — create a legal_case, stamp escalation fields
 *   approve-compensation   — human-confirm the compensation amount
 *   record-airline-payment — log airline payment + finance transaction
 *   set-claimvelo-fee      — calculate & persist the success fee
 *   record-customer-payout — log customer payout + finance transaction
 *   record-legal-expense   — log a legal expense (multiple per claim allowed)
 *   update-legal-case      — update legal_case status / lawyer / deadlines
 *   get-legal-overview     — return a legal_case + claim finance summary
 *
 * All mutations use the service-role client (bypasses RLS). The caller is
 * verified via JWT and must be admin or super_admin for every action except
 * get-legal-overview (lawyers may read their own assigned cases).
 *
 * Structured finance transactions (airline_payment, claimvelo_fee,
 * customer_payout) are upserted via a manual check-then-update-or-insert
 * (the unique partial index idx_finance_txn_unique_per_claim has a WHERE
 * clause that PostgREST's onConflict cannot target) so re-submitting
 * updates the existing row instead of creating a duplicate.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ClaimVelo success-fee tiers (matches the LOA agreement):
//   standard — 30% (+VAT) when no legal representation is needed
//   legal    — 50% (+VAT) when legal representation is required
const FEE_RATES: Record<string, number> = {
  standard: 30,
  legal: 50,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Manual upsert for typed finance transactions. The unique partial index
// idx_finance_txn_unique_per_claim has a WHERE clause, so PostgREST's
// onConflict parameter (which only takes column names) cannot target it.
// Instead we select the existing row and update or insert accordingly.
async function upsertTypedTxn(
  admin: ReturnType<typeof createClient>,
  txnType: string,
  row: Record<string, unknown>,
): Promise<{ error: string | null }> {
  // Check for an existing typed transaction for this claim
  const { data: existing, error: selErr } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("claim_id", row.claim_id)
    .eq("transaction_type", txnType)
    .maybeSingle();

  if (selErr) return { error: selErr.message };

  if (existing) {
    const { error: updErr } = await admin
      .from("finance_transactions")
      .update(row)
      .eq("id", existing.id);
    return { error: updErr?.message || null };
  }

  const { error: insErr } = await admin
    .from("finance_transactions")
    .insert(row);
  return { error: insErr?.message || null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service-role client for all DB writes (bypasses RLS)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ── Verify the caller ─────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Missing authorization header");
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) {
      return jsonError(401, "Invalid or expired token");
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role || "";
    const isAdmin = role === "admin" || role === "super_admin";
    const isLawyer = role === "lawyer";

    const body = await req.json();
    const { action } = body;

    // ── Action: escalate-claim (admin only) ────────────────────────────────────
    // Creates a legal_cases row for a claim and stamps the escalation fields
    // on the claim. Idempotent: if a legal_case already exists for the claim,
    // it returns the existing one.
    if (action === "escalate-claim") {
      if (!isAdmin) return jsonError(403, "Only admins can escalate claims to legal");
      const { claimId, lawyerId, escalationReason } = body;
      if (!claimId) return jsonError(400, "claimId is required");

      // Check for an existing legal_case
      const { data: existing } = await admin
        .from("legal_cases")
        .select("id, claim_id, lawyer_id, legal_status, escalation_reason")
        .eq("claim_id", claimId)
        .maybeSingle();

      if (existing) {
        return jsonOk({ legalCase: existing, alreadyEscalated: true });
      }

      // Load the claim to verify it exists
      const { data: claim } = await admin
        .from("claims")
        .select("id, claim_ref, status")
        .eq("id", claimId)
        .maybeSingle();
      if (!claim) return jsonError(404, "Claim not found");

      const now = new Date().toISOString();

      // Create the legal_case
      const { data: legalCase, error: lcErr } = await admin
        .from("legal_cases")
        .insert({
          claim_id: claimId,
          lawyer_id: lawyerId || null,
          legal_status: "intake",
          escalation_reason: (escalationReason || "").trim(),
          escalated_at: now,
          escalated_by: user.id,
        })
        .select("id, claim_id, lawyer_id, legal_status, escalation_reason")
        .single();

      if (lcErr || !legalCase) {
        return jsonError(500, `Failed to create legal case: ${lcErr?.message || "unknown"}`);
      }

      // Stamp escalation fields on the claim
      const { error: claimErr } = await admin
        .from("claims")
        .update({
          status: "Escalated",
          escalated_at: now,
          escalated_by: user.id,
          escalation_reason: (escalationReason || "").trim(),
          lawyer_id: lawyerId || null,
          legal_case_id: legalCase.id,
        })
        .eq("id", claimId);

      if (claimErr) {
        return jsonError(500, `Failed to update claim: ${claimErr.message}`);
      }

      return jsonOk({ legalCase, alreadyEscalated: false });
    }

    // ── Action: approve-compensation (admin only) ──────────────────────────────
    // Human-confirms the compensation amount. `approved_compensation_amount` is
    // kept separate from the rules-engine `compensation_amount` estimate.
    if (action === "approve-compensation") {
      if (!isAdmin) return jsonError(403, "Only admins can approve compensation");
      const { claimId, amount } = body;
      if (!claimId) return jsonError(400, "claimId is required");
      if (typeof amount !== "number" || amount <= 0) {
        return jsonError(400, "amount must be a positive number");
      }

      const now = new Date().toISOString();
      const { error } = await admin
        .from("claims")
        .update({
          approved_compensation_amount: round2(amount),
          approved_at: now,
          approved_by: user.id,
        })
        .eq("id", claimId);

      if (error) return jsonError(500, `Failed to approve compensation: ${error.message}`);
      return jsonOk({ claimId, approvedAmount: round2(amount), approvedAt: now });
    }

    // ── Action: record-airline-payment (admin only) ────────────────────────────
    // Records that the airline has paid compensation. Sets the airline payment
    // fields on the claim and upserts a typed finance_transaction (income).
    // The unique partial index makes this idempotent per claim.
    if (action === "record-airline-payment") {
      if (!isAdmin) return jsonError(403, "Only admins can record airline payments");
      const { claimId, amount, paymentDate, reference, status } = body;
      if (!claimId) return jsonError(400, "claimId is required");
      if (typeof amount !== "number" || amount <= 0) {
        return jsonError(400, "amount must be a positive number");
      }
      if (!paymentDate) return jsonError(400, "paymentDate is required");

      const paymentStatus = status || "received";

      // Load claim_ref for the finance transaction description
      const { data: claim } = await admin
        .from("claims")
        .select("claim_ref")
        .eq("id", claimId)
        .maybeSingle();
      const claimRef = claim?.claim_ref || "";

      // Update claim airline payment fields
      const { error: claimErr } = await admin
        .from("claims")
        .update({
          airline_payment_status: paymentStatus,
          airline_payment_amount: round2(amount),
          airline_payment_date: paymentDate,
          airline_payment_reference: (reference || "").trim(),
        })
        .eq("id", claimId);

      if (claimErr) return jsonError(500, `Failed to update claim: ${claimErr.message}`);

      // Upsert typed finance transaction (income)
      const { error: txnErr } = await upsertTypedTxn(admin, "airline_payment", {
        type: "income",
        transaction_type: "airline_payment",
        category: "Airline Payment",
        description: `Airline payment received — ${claimRef}`,
        amount: round2(amount),
        currency: "EUR",
        date: paymentDate,
        claim_id: claimId,
        claim_ref: claimRef || null,
        created_by: user.id,
      });

      if (txnErr) return jsonError(500, `Failed to record finance transaction: ${txnErr}`);
      return jsonOk({ claimId, amount: round2(amount), status: paymentStatus });
    }

    // ── Action: set-claimvelo-fee (admin only) ─────────────────────────────────
    // Calculates and persists the ClaimVelo success fee based on the tier
    // (standard=30%, legal=50%) and the actual received amount. Uses
    // airline_payment_amount if set, otherwise approved_compensation_amount.
    // Upserts a typed finance transaction (income — fee retained).
    if (action === "set-claimvelo-fee") {
      if (!isAdmin) return jsonError(403, "Only admins can set ClaimVelo fees");
      const { claimId, tier } = body;
      if (!claimId) return jsonError(400, "claimId is required");
      if (!tier || !FEE_RATES[tier]) {
        return jsonError(400, "tier must be 'standard' or 'legal'");
      }

      // Load the claim to get the base amount for the fee calculation
      const { data: claim } = await admin
        .from("claims")
        .select("claim_ref, airline_payment_amount, approved_compensation_amount, compensation_amount")
        .eq("id", claimId)
        .maybeSingle();
      if (!claim) return jsonError(404, "Claim not found");

      const baseAmount = Number(claim.airline_payment_amount) || Number(claim.approved_compensation_amount) || Number(claim.compensation_amount) || 0;
      if (baseAmount <= 0) {
        return jsonError(409, "No compensation amount available to calculate fee from (set approved compensation or airline payment first)");
      }

      const rate = FEE_RATES[tier];
      const feeAmount = round2((baseAmount * rate) / 100);
      const claimRef = claim.claim_ref || "";

      // Update claim fee fields
      const { error: claimErr } = await admin
        .from("claims")
        .update({
          claimvelo_fee_tier: tier,
          claimvelo_fee_rate: rate,
          claimvelo_fee_amount: feeAmount,
        })
        .eq("id", claimId);

      if (claimErr) return jsonError(500, `Failed to update claim: ${claimErr.message}`);

      // Upsert typed finance transaction (income — fee retained)
      const { error: txnErr } = await upsertTypedTxn(admin, "claimvelo_fee", {
        type: "income",
        transaction_type: "claimvelo_fee",
        category: "ClaimVelo Fee",
        description: `ClaimVelo ${tier} fee (${rate}%) — ${claimRef}`,
        amount: feeAmount,
        currency: "EUR",
        date: new Date().toISOString().split("T")[0],
        claim_id: claimId,
        claim_ref: claimRef || null,
        created_by: user.id,
      });

      if (txnErr) return jsonError(500, `Failed to record finance transaction: ${txnErr}`);
      return jsonOk({ claimId, tier, rate, feeAmount, baseAmount });
    }

    // ── Action: record-customer-payout (admin only) ───────────────────────────
    // Records the net payout sent to the customer. Sets customer payout fields
    // on the claim and upserts a typed finance transaction (expense).
    if (action === "record-customer-payout") {
      if (!isAdmin) return jsonError(403, "Only admins can record customer payouts");
      const { claimId, amount, paymentDate, reference } = body;
      if (!claimId) return jsonError(400, "claimId is required");
      if (typeof amount !== "number" || amount <= 0) {
        return jsonError(400, "amount must be a positive number");
      }
      if (!paymentDate) return jsonError(400, "paymentDate is required");
      if (!reference || !reference.trim()) return jsonError(400, "reference is required");

      // Load claim_ref
      const { data: claim } = await admin
        .from("claims")
        .select("claim_ref")
        .eq("id", claimId)
        .maybeSingle();
      const claimRef = claim?.claim_ref || "";

      // Update claim customer payout fields
      const { error: claimErr } = await admin
        .from("claims")
        .update({
          customer_payout_status: "paid",
          customer_payout_amount: round2(amount),
          customer_payout_date: paymentDate,
          customer_payout_reference: reference.trim(),
        })
        .eq("id", claimId);

      if (claimErr) return jsonError(500, `Failed to update claim: ${claimErr.message}`);

      // Upsert typed finance transaction (expense)
      const { error: txnErr } = await upsertTypedTxn(admin, "customer_payout", {
        type: "expense",
        transaction_type: "customer_payout",
        category: "Customer Payout",
        description: `Customer payout — ${claimRef} — Ref: ${reference.trim()}`,
        amount: round2(amount),
        currency: "EUR",
        date: paymentDate,
        claim_id: claimId,
        claim_ref: claimRef || null,
        created_by: user.id,
      });

      if (txnErr) return jsonError(500, `Failed to record finance transaction: ${txnErr}`);
      return jsonOk({ claimId, amount: round2(amount), status: "paid" });
    }

    // ── Action: record-legal-expense (admin only) ──────────────────────────────
    // Logs a legal expense (lawyer fees, court costs, etc.). Multiple entries
    // per claim are allowed — this is NOT constrained by the unique index.
    if (action === "record-legal-expense") {
      if (!isAdmin) return jsonError(403, "Only admins can record legal expenses");
      const { claimId, amount, paymentDate, description, category } = body;
      if (typeof amount !== "number" || amount <= 0) {
        return jsonError(400, "amount must be a positive number");
      }
      if (!paymentDate) return jsonError(400, "paymentDate is required");
      if (!description || !description.trim()) {
        return jsonError(400, "description is required");
      }

      // Load claim_ref (claimId is optional — a legal expense can be general)
      let claimRef: string | null = null;
      if (claimId) {
        const { data: claim } = await admin
          .from("claims")
          .select("claim_ref")
          .eq("id", claimId)
          .maybeSingle();
        claimRef = claim?.claim_ref || null;
      }

      const { data: txn, error: txnErr } = await admin
        .from("finance_transactions")
        .insert({
          type: "expense",
          transaction_type: "legal_expense",
          category: category || "Legal Fees",
          description: description.trim(),
          amount: round2(amount),
          currency: "EUR",
          date: paymentDate,
          claim_id: claimId || null,
          claim_ref: claimRef,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (txnErr) return jsonError(500, `Failed to record legal expense: ${txnErr.message}`);
      return jsonOk({ transactionId: txn.id, amount: round2(amount) });
    }

    // ── Action: update-legal-case (admin only) ────────────────────────────────
    // Updates a legal_case's status, lawyer assignment, deadlines, and notes.
    if (action === "update-legal-case") {
      if (!isAdmin) return jsonError(403, "Only admins can update legal cases");
      const { legalCaseId, legalStatus, lawyerId, nextDeadlineDate, deadlines, notes } = body;
      if (!legalCaseId) return jsonError(400, "legalCaseId is required");

      const updates: Record<string, unknown> = {};
      if (legalStatus !== undefined) updates.legal_status = legalStatus;
      if (lawyerId !== undefined) updates.lawyer_id = lawyerId || null;
      if (nextDeadlineDate !== undefined) updates.next_deadline_date = nextDeadlineDate || null;
      if (deadlines !== undefined) updates.deadlines = deadlines;
      if (notes !== undefined) updates.notes = notes;

      if (Object.keys(updates).length === 0) {
        return jsonError(400, "No fields to update");
      }

      const { data: updated, error } = await admin
        .from("legal_cases")
        .update(updates)
        .eq("id", legalCaseId)
        .select("id, claim_id, lawyer_id, legal_status, next_deadline_date, deadlines, notes, updated_at")
        .single();

      if (error) return jsonError(500, `Failed to update legal case: ${error.message}`);

      // If lawyer_id changed, sync it to the claim as well
      if (lawyerId !== undefined) {
        await admin
          .from("claims")
          .update({ lawyer_id: lawyerId || null })
          .eq("id", updated.claim_id);
      }

      return jsonOk({ legalCase: updated });
    }

    // ── Action: get-legal-overview (admin or assigned lawyer) ──────────────────
    // Returns the legal_case + a finance summary for the claim. A lawyer may
    // only access cases assigned to them.
    if (action === "get-legal-overview") {
      const { claimId } = body;
      if (!claimId) return jsonError(400, "claimId is required");

      // Load the legal case
      const { data: legalCase } = await admin
        .from("legal_cases")
        .select("*")
        .eq("claim_id", claimId)
        .maybeSingle();

      if (!legalCase) return jsonError(404, "No legal case found for this claim");

      // Lawyers can only see their own assigned cases
      if (isLawyer && !isAdmin) {
        if (legalCase.lawyer_id !== user.id) {
          return jsonError(403, "You can only view legal cases assigned to you");
        }
      } else if (!isAdmin && !isLawyer) {
        return jsonError(403, "Only admins or assigned lawyers can view legal cases");
      }

      // Load claim finance fields
      const { data: claim } = await admin
        .from("claims")
        .select(`
          id, claim_ref, status,
          compensation_amount, approved_compensation_amount, approved_at,
          airline_payment_status, airline_payment_amount, airline_payment_date, airline_payment_reference,
          claimvelo_fee_tier, claimvelo_fee_rate, claimvelo_fee_amount,
          customer_payout_status, customer_payout_amount, customer_payout_date, customer_payout_reference,
          lawyer_id, escalated_at, escalation_reason
        `)
        .eq("id", claimId)
        .maybeSingle();

      // Load typed finance transactions for this claim
      const { data: transactions } = await admin
        .from("finance_transactions")
        .select("id, type, transaction_type, category, description, amount, date, claim_ref")
        .eq("claim_id", claimId)
        .not("transaction_type", "is", null)
        .order("date", { ascending: false });

      return jsonOk({
        legalCase,
        claim: claim || null,
        transactions: transactions || [],
      });
    }

    return jsonError(400, `Unknown action: ${action}`);
  } catch (err) {
    return jsonError(500, `Server error: ${err instanceof Error ? err.message : "unknown"}`);
  }
});
