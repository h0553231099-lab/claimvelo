import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Override-eligibility edge function.
 *
 * Allows staff (admin/super_admin/worker) to override the automated eligibility
 * decision on a claim. Requires a mandatory reason (min 10 chars). Records the
 * actor (from JWT) and a server-side timestamp. Once overridden, the override
 * fields are immutable — a second override is rejected.
 *
 * The audit trigger on claims captures the old→new status and override fields.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Auth: verify staff JWT ──────────────────────────────────────────────────
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

  // Verify staff role
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "super_admin", "worker"].includes(profile.role)) {
    return jsonError(403, "Only staff can override eligibility");
  }

  try {
    const { claimId, decision, reason } = await req.json();
    if (!claimId) return jsonError(400, "Missing claimId");
    if (!decision) return jsonError(400, "Missing decision");
    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      return jsonError(400, "Override reason is mandatory (min 10 characters)");
    }

    const validDecisions = ["Eligible", "Not Eligible", "Force Majeure", "Pending Check"];
    if (!validDecisions.includes(decision)) {
      return jsonError(400, `Invalid decision. Must be one of: ${validDecisions.join(", ")}`);
    }

    // Check if already overridden (immutable)
    const { data: claim } = await admin
      .from("claims")
      .select("id, status, override_decision, overridden_at")
      .eq("id", claimId)
      .maybeSingle();

    if (!claim) return jsonError(404, "Claim not found");
    if (claim.overridden_at) {
      return jsonError(409, "Claim already overridden — override fields are immutable. Create a new claim if a further change is needed.");
    }

    // Apply override
    const update: Record<string, unknown> = {
      status: decision,
      override_decision: decision,
      override_reason: reason.trim(),
      overridden_by: user.id,
      overridden_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (decision === "Eligible") {
      // Don't override compensation amount — let staff set it separately
    } else if (decision === "Not Eligible" || decision === "Force Majeure") {
      update.compensation_amount = 0;
      update.amount = decision === "Force Majeure" ? "Force Majeure" : "€0";
    } else if (decision === "Pending Check") {
      update.compensation_amount = null;
      update.amount = "Pending";
    }

    const { error: updateError } = await admin.from("claims").update(update).eq("id", claimId);
    if (updateError) return jsonError(500, `Failed to apply override: ${updateError.message}`);

    // Insert notification
    await admin.from("notifications").insert({
      type: "status_changed",
      claim_ref: claimId,
      claim_id: claimId,
      message: `Eligibility overridden to ${decision} by ${profile.full_name || profile.email}: ${reason.trim()}`,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Override applied successfully",
      claim_id: claimId,
      decision,
      overridden_by: profile.full_name || profile.email,
      overridden_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
