import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.23.8";

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

// ── Validation Schema ────────────────────────────────────────────────────────

const phoneRegex = /^\+[1-9]\d{6,14}$/;

const leadSchema = z.object({
  pnr_code: z
    .string()
    .length(6, "pnr_code must be exactly 6 characters")
    .regex(/^[A-Z0-9]{6}$/, "pnr_code must contain only uppercase letters and digits"),

  passenger: z.object({
    first_name: z.string().min(1, "passenger.first_name is required"),
    last_name: z.string().min(1, "passenger.last_name is required"),
    email: z.string().email("passenger.email must be a valid email address"),
    phone: z
      .string()
      .regex(phoneRegex, "passenger.phone must be in international format with + (e.g. +441234567890)"),
  }),

  flight_info: z.object({
    flight_number: z.string().min(1, "flight_info.flight_number is required"),
    departure_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "flight_info.departure_date must be in YYYY-MM-DD format")
      .refine((val) => {
        const d = new Date(val);
        return !isNaN(d.getTime()) && val === d.toISOString().slice(0, 10);
      }, "flight_info.departure_date must be a valid calendar date"),
    origin: z
      .string()
      .length(3, "flight_info.origin must be exactly 3 letters")
      .regex(/^[A-Z]{3}$/, "flight_info.origin must be a 3-letter IATA code (uppercase)"),
    destination: z
      .string()
      .length(3, "flight_info.destination must be exactly 3 letters")
      .regex(/^[A-Z]{3}$/, "flight_info.destination must be a 3-letter IATA code (uppercase)"),
    delay_minutes: z.number().int().min(0).optional(),
    delay_reason: z.string().optional(),
  }),
});

type Lead = z.infer<typeof leadSchema>;

// ── Auth Middleware ───────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function validationError(errors: { field: string; message: string }[]): Response {
  return new Response(
    JSON.stringify({ error: "Validation failed", errors }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Converts a ZodError into a flat array of { field, message } objects.
 * Each field path is dot-notation (e.g. "passenger.email").
 */
function formatZodErrors(err: z.ZodError): { field: string; message: string }[] {
  return err.issues.map((issue) => {
    const field = issue.path.map(String).join(".") || "root";
    return { field, message: issue.message };
  });
}

// ── Route Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/b2b-api/, "").replace(/^\/+/, "/");

  // ── Route: POST /api/v1/leads ──────────────────────────────────────────
  if (path === "/api/v1/leads" && req.method === "POST") {
    // 1. Enforce JSON content type
    const contentType = req.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonError(400, "Content-Type must be application/json");
    }

    // 2. Authenticate
    const auth = await authenticateAgent(req);
    if ("response" in auth) return auth.response;

    // 3. Parse JSON body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonError(400, "Request body is not valid JSON");
    }

    // 4. Strict validation
    const result = leadSchema.safeParse(rawBody);
    if (!result.success) {
      return validationError(formatZodErrors(result.error));
    }

    const lead: Lead = result.data;

    // Step 2 — validation complete. Lead ingestion arrives in Step 3.
    return jsonOk({
      status: "validated",
      agent: {
        id: auth.agent.id,
        email: auth.agent.email,
        full_name: auth.agent.full_name,
      },
      data: lead,
      message: "Lead data validated successfully. Storage not yet implemented.",
    });
  }

  return jsonError(404, `No route for ${req.method} ${path}`);
});
