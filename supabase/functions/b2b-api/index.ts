import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AuthenticatedAgent {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: string;
}

/**
 * Bearer token authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header, looks it up in
 * the `worker_profiles.api_key` column using the service-role key (bypasses
 * RLS and the column-level REVOKE on anon), and returns the matched agent
 * or a 401 Response.
 */
async function authenticateAgent(req: Request): Promise<{ agent: AuthenticatedAgent } | { response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      response: jsonError(401, "Missing or malformed Authorization header. Expected: Bearer <AGENT_API_KEY>"),
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return {
      response: jsonError(401, "Empty bearer token."),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Partial-unique index guarantees at most one match
  const { data, error } = await supabase
    .from("worker_profiles")
    .select("id, user_id, email, full_name, role")
    .eq("api_key", token)
    .maybeSingle();

  if (error || !data) {
    return {
      response: jsonError(401, "Invalid or unrecognized API key."),
    };
  }

  return { agent: data as AuthenticatedAgent };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/b2b-api/, "").replace(/^\/+/, "/");

  // ── Route: POST /api/v1/leads ──────────────────────────────────────────
  if (path === "/api/v1/leads" && req.method === "POST") {
    const auth = await authenticateAgent(req);
    if ("response" in auth) return auth.response;

    // Step 1 — authentication only. Lead ingestion arrives in Step 2.
    return jsonOk({
      status: "authenticated",
      agent: {
        id: auth.agent.id,
        email: auth.agent.email,
        full_name: auth.agent.full_name,
        role: auth.agent.role,
      },
      message: "Authentication successful. Lead ingestion not yet implemented.",
    });
  }

  return jsonError(404, `No route for ${req.method} ${path}`);
});
