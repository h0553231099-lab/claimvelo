import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    // ── Verify the caller is an admin or super_admin ──────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Missing authorization header");
    }
    const token = authHeader.replace("Bearer ", "");

    // Verify the JWT to identify the caller
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

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return jsonError(403, "Only admins can manage agent finances");
    }

    const body = await req.json();
    const { action } = body;

    // ── Action: recalculate-payout ────────────────────────────────────────────
    // Updates an agent's commission_rate and recalculates total_payout_earned
    // from their eligible claims. Also updates/creates commission records.
    if (action === "recalculate-payout") {
      const { agentId, newRate } = body;
      if (!agentId) return jsonError(400, "agentId is required");
      if (typeof newRate !== "number" || newRate < 0 || newRate > 100) {
        return jsonError(400, "newRate must be a number between 0 and 100");
      }

      // 1. Save the new rate
      await admin
        .from("worker_profiles")
        .update({ commission_rate: newRate })
        .eq("id", agentId);

      // 2. Get the agent's code
      const { data: agent } = await admin
        .from("worker_profiles")
        .select("agent_code")
        .eq("id", agentId)
        .maybeSingle();

      if (!agent?.agent_code) {
        return jsonOk({ newTotal: 0, claimCount: 0 });
      }

      // 3. Get all eligible claims with compensation for this agent
      const { data: claims } = await admin
        .from("claims")
        .select("id, claim_ref, compensation_amount, agent_id")
        .eq("agent_id", agentId)
        .eq("eligibility_status", "Eligible")
        .not("compensation_amount", "is", null);

      if (!claims || claims.length === 0) {
        await admin
          .from("worker_profiles")
          .update({ total_payout_earned: 0 })
          .eq("id", agentId);
        return jsonOk({ newTotal: 0, claimCount: 0 });
      }

      let total = 0;
      let claimCount = 0;

      for (const claim of claims) {
        const compAmount = Number(claim.compensation_amount);
        if (isNaN(compAmount) || compAmount <= 0) continue;

        const commission = Math.round((compAmount * newRate) / 100 * 100) / 100;
        total = Math.round((total + commission) * 100) / 100;
        claimCount++;

        // Upsert commission record
        await admin
          .from("commissions")
          .upsert(
            {
              agent_id: agentId,
              claim_id: claim.id,
              commission_rate: newRate,
              commission_amount: commission,
            },
            { onConflict: "claim_id,agent_id" },
          );
      }

      // 4. Update the running total
      await admin
        .from("worker_profiles")
        .update({ total_payout_earned: total })
        .eq("id", agentId);

      return jsonOk({ newTotal: total, claimCount });
    }

    // ── Action: log-payout ────────────────────────────────────────────────────
    // Logs a manual payout to an agent, updates total_paid_to_date,
    // and records it as a finance transaction.
    if (action === "log-payout") {
      const { agentId, agentCode, agentName, amount, paymentDate, reference } = body;
      if (!agentId) return jsonError(400, "agentId is required");
      if (typeof amount !== "number" || amount <= 0) {
        return jsonError(400, "amount must be a positive number");
      }
      if (!reference || !reference.trim()) return jsonError(400, "reference is required");
      if (!paymentDate) return jsonError(400, "paymentDate is required");

      // Fetch current totals
      const { data: agent } = await admin
        .from("worker_profiles")
        .select("total_payout_earned, total_paid_to_date")
        .eq("id", agentId)
        .maybeSingle();

      const currentEarned = Number(agent?.total_payout_earned) || 0;
      const currentPaid = Number(agent?.total_paid_to_date) || 0;
      const newTotalPaid = Math.round((currentPaid + amount) * 100) / 100;
      const balanceDue = Math.round((currentEarned - newTotalPaid) * 100) / 100;

      // Update the agent's total_paid_to_date
      await admin
        .from("worker_profiles")
        .update({ total_paid_to_date: newTotalPaid })
        .eq("id", agentId);

      // Log as a finance transaction for audit trail
      await admin
        .from("finance_transactions")
        .insert({
          type: "expense",
          category: "Payroll",
          description: `Agent payout — ${agentName || ""} (${agentCode || ""}) — Ref: ${reference.trim()}`,
          amount,
          currency: "EUR",
          date: paymentDate,
          claim_ref: null,
          created_by: user.id,
        });

      return jsonOk({ newTotalPaid, balanceDue });
    }

    return jsonError(400, `Unknown action: ${action}`);
  } catch (err) {
    return jsonError(500, `Server error: ${err instanceof Error ? err.message : "unknown"}`);
  }
});
