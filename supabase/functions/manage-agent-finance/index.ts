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

// Cryptographically secure API key generator (server-side only).
// Uses the Web Crypto API — never Math.random(), never the browser.
function generateSecureApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `cv_live_${hex}`;
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

    const role = profile?.role || "";
    const isAdmin = role === "admin" || role === "super_admin";
    const isSalesManager = role === "sales_manager";
    const isAgent = role === "agent";

    const body = await req.json();
    const { action } = body;

    // ── Action: get-agent-context (agent or admin) ─────────────────────────────
    // Returns the calling agent's worker_profile + their manager's display name.
    // Used by the Agent Portal profile section (manager name is not readable via
    // profiles RLS by an agent).
    if (action === "get-agent-context") {
      if (!isAgent && !isAdmin) {
        return jsonError(403, "Only agents can request agent context");
      }
      const { data: wp } = await admin
        .from("worker_profiles")
        .select("id, agent_code, commission_rate, total_payout_earned, total_paid_to_date, manager_id, email, full_name, status")
        .eq("user_id", user.id)
        .maybeSingle();

      let managerName: string | null = null;
      let managerEmail: string | null = null;
      if (wp?.manager_id) {
        const { data: mgr } = await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", wp.manager_id)
          .maybeSingle();
        managerName = mgr?.full_name || null;
        managerEmail = mgr?.email || null;
      }

      return jsonOk({ agent: wp, managerName, managerEmail });
    }

    // ── Action: approve-commission (sales_manager own team, or admin) ──────────
    // Moves a commission from 'pending' → 'approved'. The caller must own the
    // commission's agent (manager_id = caller) unless they are an admin.
    if (action === "approve-commission") {
      const { commissionId } = body;
      if (!commissionId) return jsonError(400, "commissionId is required");
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can approve commissions");
      }

      // Load the commission + its agent to verify ownership
      const { data: commission } = await admin
        .from("commissions")
        .select("id, agent_id, commission_status")
        .eq("id", commissionId)
        .maybeSingle();

      if (!commission) return jsonError(404, "Commission not found");

      if (isSalesManager && !isAdmin) {
        const { data: agent } = await admin
          .from("worker_profiles")
          .select("manager_id")
          .eq("id", commission.agent_id)
          .maybeSingle();
        if (!agent || agent.manager_id !== user.id) {
          return jsonError(403, "You can only approve commissions for your own team");
        }
      }

      if (commission.commission_status !== "pending") {
        return jsonError(409, `Commission is already ${commission.commission_status}`);
      }

      const { error: updateErr } = await admin
        .from("commissions")
        .update({ commission_status: "approved" })
        .eq("id", commissionId);

      if (updateErr) return jsonError(500, `Failed to approve: ${updateErr.message}`);
      return jsonOk({ commissionId, status: "approved" });
    }

    // ── Action: pay-commission (sales_manager own team, or admin) ──────────────
    // Moves a commission from 'approved' → 'paid' and stamps paid_at.
    // NOTE: This only sets the status flag — actual payment processing is
    // Phase 9 (log-payout records the money transfer to finance_transactions).
    if (action === "pay-commission") {
      const { commissionId } = body;
      if (!commissionId) return jsonError(400, "commissionId is required");
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can pay commissions");
      }

      const { data: commission } = await admin
        .from("commissions")
        .select("id, agent_id, commission_status")
        .eq("id", commissionId)
        .maybeSingle();

      if (!commission) return jsonError(404, "Commission not found");

      if (isSalesManager && !isAdmin) {
        const { data: agent } = await admin
          .from("worker_profiles")
          .select("manager_id")
          .eq("id", commission.agent_id)
          .maybeSingle();
        if (!agent || agent.manager_id !== user.id) {
          return jsonError(403, "You can only pay commissions for your own team");
        }
      }

      if (commission.commission_status !== "approved") {
        return jsonError(409, `Commission must be approved before paying (currently ${commission.commission_status})`);
      }

      const { error: updateErr } = await admin
        .from("commissions")
        .update({ commission_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", commissionId);

      if (updateErr) return jsonError(500, `Failed to mark paid: ${updateErr.message}`);
      return jsonOk({ commissionId, status: "paid" });
    }

    // ── Action: recalculate-payout (admin only) ────────────────────────────────
    // Updates an agent's commission_rate and recalculates total_payout_earned
    // from their eligible claims. Also updates/creates commission records.
    if (action === "recalculate-payout") {
      if (!isAdmin) {
        return jsonError(403, "Only admins can update commission rates");
      }
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

    // ── Action: log-payout (admin only) ────────────────────────────────────────
    // Logs a manual payout to an agent, updates total_paid_to_date,
    // and records it as a finance transaction.
    if (action === "log-payout") {
      if (!isAdmin) {
        return jsonError(403, "Only admins can log payouts");
      }
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

    // ── Action: list-agents (sales_manager own team, or admin) ─────────────────
    // Returns the caller's team agents. The raw api_key is NEVER returned —
    // only a `has_key` boolean — so keys are not readable via client queries.
    if (action === "list-agents") {
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can list agents");
      }
      let query = admin
        .from("worker_profiles")
        .select("id, user_id, email, full_name, agent_code, status, commission_rate, total_payout_earned, total_paid_to_date, created_at, manager_id, api_key");
      if (!isAdmin) {
        query = query.eq("manager_id", user.id);
      }
      const { data: rows, error: listErr } = await query.order("created_at", { ascending: false });
      if (listErr) return jsonError(500, `Failed to load agents: ${listErr.message}`);
      const agents = (rows || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        user_id: r.user_id,
        email: r.email,
        full_name: r.full_name,
        agent_code: r.agent_code,
        status: r.status,
        commission_rate: r.commission_rate,
        total_payout_earned: r.total_payout_earned,
        total_paid_to_date: r.total_paid_to_date,
        created_at: r.created_at,
        has_key: !!r.api_key,
      }));
      return jsonOk({ agents });
    }

    // ── Action: create-agent (sales_manager own team, or admin) ────────────────
    // Creates a new agent. Role is hardcoded to 'agent' server-side (the caller
    // cannot create admin/worker/super_admin users). manager_id is hardcoded to
    // the caller (the agent cannot be assigned to another manager). The auth
    // user is created via the Admin API with the service-role key.
    if (action === "create-agent") {
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can create agents");
      }
      const email = (body.email || "").trim();
      const full_name = (body.full_name || "").trim();
      const agent_code = (body.agent_code || "").trim().toUpperCase();
      const password = body.password || "";
      if (!email || !full_name || !agent_code) {
        return jsonError(400, "Name, email, and agent code are required");
      }
      if (!password || password.length < 8) {
        return jsonError(400, "Password must be at least 8 characters");
      }

      // 1. Create the auth user (service role). role is NOT read from the client.
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: "agent" },
      });
      if (createErr || !newUser?.user?.id) {
        return jsonError(400, `Failed to create agent account: ${createErr?.message || "unknown"}`);
      }
      const newUserId = newUser.user.id;

      // 2. Insert profile with role 'agent' (server-side; cannot be admin/super_admin)
      await admin.from("profiles").upsert({
        id: newUserId,
        email,
        full_name,
        role: "agent",
      });

      // 3. Insert worker_profile; manager_id is the caller (cannot assign to another manager)
      const { error: wpErr } = await admin.from("worker_profiles").insert({
        user_id: newUserId,
        email,
        full_name,
        role: "agent",
        status: "active",
        agent_code,
        manager_id: user.id,
      });
      if (wpErr) {
        // Best-effort cleanup of the auth user if the worker profile insert fails
        await admin.auth.admin.deleteUser(newUserId);
        return jsonError(400, `Failed to create agent profile: ${wpErr.message}`);
      }

      return jsonOk({ userId: newUserId, agentCode: agent_code });
    }

    // ── Action: generate-api-key (sales_manager own team, or admin) ─────────────
    // Generates a cryptographically secure key server-side and stores it. The
    // raw key is returned ONCE so the manager can copy it; it is never readable
    // again through any client query. Ownership (manager_id = caller) is enforced.
    if (action === "generate-api-key") {
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can manage API keys");
      }
      const { agentId } = body;
      if (!agentId) return jsonError(400, "agentId is required");

      const { data: agent } = await admin
        .from("worker_profiles")
        .select("id, manager_id")
        .eq("id", agentId)
        .maybeSingle();
      if (!agent) return jsonError(404, "Agent not found");
      if (isSalesManager && !isAdmin && agent.manager_id !== user.id) {
        return jsonError(403, "You can only manage API keys for agents on your own team");
      }

      const newKey = generateSecureApiKey();
      const { error: keyErr } = await admin
        .from("worker_profiles")
        .update({ api_key: newKey })
        .eq("id", agentId);
      if (keyErr) return jsonError(500, `Failed to generate key: ${keyErr.message}`);
      return jsonOk({ apiKey: newKey });
    }

    // ── Action: revoke-api-key (sales_manager own team, or admin) ───────────────
    // Clears the agent's api_key. Ownership (manager_id = caller) is enforced.
    if (action === "revoke-api-key") {
      if (!isSalesManager && !isAdmin) {
        return jsonError(403, "Only sales managers or admins can manage API keys");
      }
      const { agentId } = body;
      if (!agentId) return jsonError(400, "agentId is required");

      const { data: agent } = await admin
        .from("worker_profiles")
        .select("id, manager_id")
        .eq("id", agentId)
        .maybeSingle();
      if (!agent) return jsonError(404, "Agent not found");
      if (isSalesManager && !isAdmin && agent.manager_id !== user.id) {
        return jsonError(403, "You can only manage API keys for agents on your own team");
      }

      const { error: revokeErr } = await admin
        .from("worker_profiles")
        .update({ api_key: null })
        .eq("id", agentId);
      if (revokeErr) return jsonError(500, `Failed to revoke key: ${revokeErr.message}`);
      return jsonOk({ agentId });
    }

    return jsonError(400, `Unknown action: ${action}`);
  } catch (err) {
    return jsonError(500, `Server error: ${err instanceof Error ? err.message : "unknown"}`);
  }
});
