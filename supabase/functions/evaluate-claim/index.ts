import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { evaluateClaimInternal } from "../_shared/evaluate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Evaluate-claim edge function.
 *
 * Security model:
 * - If called with a service-role key (internal call from create-claim or
 *   other server-side functions), the evaluation runs without further auth.
 * - If called with a user JWT, the caller must be staff (admin / super_admin / worker).
 *   Anonymous callers are rejected.
 * - Never accepts an arbitrary claimId from an unauthenticated source.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const isServiceRole = authHeader.includes(serviceRoleKey);

  // ── Authorization ────────────────────────────────────────────────────────────
  if (!isServiceRole) {
    // Must be a user JWT — verify and check staff role
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Authentication required");
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) {
      return jsonError(401, "Invalid or expired token");
    }

    // Verify staff role
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["admin", "super_admin", "worker"].includes(profile.role)) {
      return jsonError(403, "Only staff can trigger claim evaluation");
    }
  }

  try {
    const { claimId } = await req.json();
    if (!claimId) {
      return jsonError(400, "Missing claimId");
    }

    const result = await evaluateClaimInternal(supabaseUrl, serviceRoleKey, claimId);

    return new Response(JSON.stringify({ success: true, result }), {
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
