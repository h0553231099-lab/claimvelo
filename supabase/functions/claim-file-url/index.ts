import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Secure file URL generation for claim documents.
 *
 * Two modes:
 * 1. Authenticated customer: verifies customer_user_id = auth.uid() on the claim.
 * 2. Authenticated staff: verifies role is admin / super_admin / worker.
 * 3. Anonymous: rejected — no direct access without authentication.
 *
 * Returns a short-lived (10 min) pre-signed download URL.
 * Never returns the file directly — only a time-limited URL.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const { claim_id, storage_path } = body;

    if (!claim_id || !storage_path) {
      return jsonError(400, "Missing claim_id or storage_path");
    }

    // ── Authenticate the caller ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Authentication required to access documents");
    }
    const token = authHeader.replace("Bearer ", "");

    // Check if it's the service-role key (internal call)
    if (authHeader.includes(serviceRoleKey)) {
      // Service role — allow
    } else {
      // User JWT — verify ownership or staff role
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) {
        return jsonError(401, "Invalid or expired token");
      }

      // Get the user's profile to check role
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const isStaff = profile && ["admin", "super_admin", "worker"].includes(profile.role);

      if (!isStaff) {
        // Customer — verify they own this claim
        const { data: claim } = await admin
          .from("claims")
          .select("customer_user_id")
          .eq("id", claim_id)
          .maybeSingle();

        if (!claim || claim.customer_user_id !== user.id) {
          return jsonError(403, "You do not have access to this document");
        }
      }
    }

    // ── Generate signed download URL (10 min expiry) ──────────────────────────
    const { data, error } = await admin
      .storage
      .from("claim-files")
      .createSignedUrl(storage_path, 600);

    if (error || !data) {
      return jsonError(500, "Failed to generate download URL");
    }

    return new Response(JSON.stringify({
      success: true,
      url: data.signedUrl,
      expires_in: 600,
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
