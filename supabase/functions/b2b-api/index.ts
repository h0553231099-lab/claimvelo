import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.23.8";
import { evaluateClaimInternal } from "../_shared/evaluate.ts";
import { verifyAndStoreSegments, verifyReplacementFlight } from "../_shared/segments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedAgent {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: string;
  agent_code: string;
}

// ── Validation Schema ─────────────────────────────────────────────────────────

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
    // Phase B.2 optional fields
    issue_type: z.enum(["delay", "cancellation", "denied_boarding"]).optional(),
    cancellation_notice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    replacement_flight_number: z.string().optional(),
    boarding_type: z.enum(["involuntary", "voluntary"]).optional(),
    confirmed_reservation: z.boolean().optional(),
    checked_in_on_time: z.boolean().optional(),
    denial_reason: z.string().optional(),
    is_single_booking: z.boolean().optional(),
    segments: z.array(z.object({
      flight_number: z.string().min(1),
      flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      origin: z.string().length(3).regex(/^[A-Z]{3}$/),
      destination: z.string().length(3).regex(/^[A-Z]{3}$/),
      segment_order: z.number().int().min(1),
    })).optional(),
  }),
});

type Lead = z.infer<typeof leadSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validationError(errors: { field: string; message: string }[]): Response {
  return new Response(
    JSON.stringify({ success: false, message: "Validation failed", errors }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function formatZodErrors(err: z.ZodError): { field: string; message: string }[] {
  return err.issues.map((issue) => {
    const field = issue.path.map(String).join(".") || "root";
    return { field, message: issue.message };
  });
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

async function authenticateAgent(req: Request): Promise<{ agent: AuthenticatedAgent } | { response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { response: jsonError(401, "Missing or malformed Authorization header. Expected: Bearer <AGENT_API_KEY>") };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { response: jsonError(401, "Empty bearer token.") };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("worker_profiles")
    .select("id, user_id, email, full_name, role, agent_code")
    .eq("api_key", token)
    .maybeSingle();

  if (error || !data) {
    return { response: jsonError(401, "Invalid or unrecognized API key.") };
  }

  return { agent: data as AuthenticatedAgent };
}

// ── Route Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/b2b-api/, "").replace(/^\/+/, "/");

  // ── Route: GET /api/v1/docs ──────────────────────────────────────────
  if (path === "/api/v1/docs" && req.method === "GET") {
    return jsonOk({
      name: "ClaimVelo B2B API",
      version: "1.1.0",
      base_url: "https://claimvelo.co/functions/v1/b2b-api",
      endpoints: {
        "POST /api/v1/leads": {
          description: "Submit a new flight delay lead for evaluation.",
          authentication: "Bearer <AGENT_API_KEY> in the Authorization header",
          content_type: "application/json",
          required_fields: {
            pnr_code: "string (6 chars, uppercase alphanumeric)",
            "passenger.first_name": "string",
            "passenger.last_name": "string",
            "passenger.email": "string (valid email)",
            "passenger.phone": "string (international format with +, e.g. +441234567890)",
            "flight_info.flight_number": "string",
            "flight_info.departure_date": "string (YYYY-MM-DD)",
            "flight_info.origin": "string (3-letter IATA code)",
            "flight_info.destination": "string (3-letter IATA code)",
          },
          optional_fields: {
            "flight_info.delay_minutes": "number (integer, minutes of delay)",
            "flight_info.delay_reason": "string (carrier, technical, crew, weather, atc, security, strike)",
          },
          evaluation_note: "Leads are evaluated against live flight-data providers. When provider data is unavailable, incomplete, conflicting, the flight cannot be confidently matched, or the reason is an extraordinary circumstance, the lead is returned as 'Pending Check' for manual review. No fabricated or mock data is used.",
          responses: {
            "201": { success: true, message: "string", claim_ref: "string", evaluation_status: "string" },
            "400": { success: false, message: "string", errors: "[{field, message}]" },
            "401": { success: false, message: "string" },
            "500": { success: false, message: "string" },
          },
        },
      },
      examples: {
        curl: `curl -X POST \\
  https://claimvelo.co/functions/v1/b2b-api/api/v1/leads \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -d '{
    "pnr_code": "ABC123",
    "passenger": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone": "+441234567890"
    },
    "flight_info": {
      "flight_number": "BA245",
      "departure_date": "2026-07-15",
      "origin": "LHR",
      "destination": "JFK",
      "delay_minutes": 240,
      "delay_reason": "technical"
    }
  }'`,
        javascript: `const response = await fetch(
  "https://claimvelo.co/functions/v1/b2b-api/api/v1/leads",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_AGENT_API_KEY",
    },
    body: JSON.stringify({
      pnr_code: "ABC123",
      passenger: {
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "+441234567890",
      },
      flight_info: {
        flight_number: "BA245",
        departure_date: "2026-07-15",
        origin: "LHR",
        destination: "JFK",
        delay_minutes: 240,
        delay_reason: "technical",
      },
    }),
  }
);
const data = await response.json();
console.log(data);`,
      },
    });
  }

  // ── Route: POST /api/v1/leads ──────────────────────────────────────────
  if (path === "/api/v1/leads" && req.method === "POST") {
    try {
      // 1. Enforce JSON content type
      const contentType = req.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) {
        return jsonError(400, "Content-Type must be application/json");
      }

      // 2. Authenticate
      const auth = await authenticateAgent(req);
      if ("response" in auth) return auth.response;
      const agent = auth.agent;

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

      // 5. Create service-role client for DB writes
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // 6. Generate claim reference
      const claimRef = "CLM-" + Date.now().toString().slice(-6) + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();

      // 7. Insert claim into database
      //    delay_hours from the payload is stored for reference, but it is NOT
      //    used for automatic decisions — the shared engine cross-checks the
      //    flight against live provider data and only decides on verified evidence.
      const issueType = lead.flight_info.issue_type === "cancellation" ? "Cancellation"
        : lead.flight_info.issue_type === "denied_boarding" ? "Denied Boarding"
        : "Delay";

      const { data: claimRow, error: insertError } = await supabase
        .from("claims")
        .insert({
          claim_ref: claimRef,
          passenger_first_name: lead.passenger.first_name,
          passenger_last_name: lead.passenger.last_name,
          email: lead.passenger.email,
          phone: lead.passenger.phone,
          booking_reference: lead.pnr_code,
          flight_number: lead.flight_info.flight_number,
          flight_date: lead.flight_info.departure_date,
          departure: lead.flight_info.origin,
          arrival: lead.flight_info.destination,
          airline_reason: lead.flight_info.delay_reason || "",
          delay_hours: lead.flight_info.delay_minutes
            ? Math.round((lead.flight_info.delay_minutes / 60) * 100) / 100
            : 0,
          issue_type: issueType,
          agent: agent.agent_code,
          agent_id: agent.id,
          status: "Untouched",
          eligibility_status: "Pending Check",
          loa_signed: false,
          notes: `Lead submitted via B2B API by ${agent.full_name} (${agent.email})`,
          // Phase B.2 optional fields
          cancellation_notice_date: lead.flight_info.cancellation_notice_date || null,
          replacement_flight_number: lead.flight_info.replacement_flight_number || "",
          replacement_offered: !!lead.flight_info.replacement_flight_number,
          boarding_type: lead.flight_info.boarding_type || "",
          confirmed_reservation: lead.flight_info.confirmed_reservation ?? null,
          checked_in_on_time: lead.flight_info.checked_in_on_time ?? null,
          denial_reason: lead.flight_info.denial_reason || "",
          is_single_booking: lead.flight_info.is_single_booking || false,
        })
        .select("id")
        .single();

      if (insertError || !claimRow) {
        return jsonError(500, "Internal server error");
      }

      const claimId = claimRow.id;

      // 7b. Verify connecting-flight segments (if provided)
      if (lead.flight_info.segments && lead.flight_info.segments.length > 0) {
        try {
          await verifyAndStoreSegments(supabaseUrl, serviceRoleKey, claimId, lead.flight_info.segments);
        } catch (e) {
          console.error("Segment verification failed:", e);
        }
      }

      // 7c. Verify replacement flight (if provided)
      if (lead.flight_info.replacement_flight_number && lead.flight_info.departure_date) {
        try {
          await verifyReplacementFlight(supabaseUrl, serviceRoleKey, claimId, lead.flight_info.replacement_flight_number, lead.flight_info.departure_date);
        } catch (e) {
          console.error("Replacement flight verification failed:", e);
        }
      }

      // 8. Trigger the shared rules engine evaluation (single decision path)
      let evaluationStatus = "Pending Check";
      try {
        const engineResult = await evaluateClaimInternal(supabaseUrl, serviceRoleKey, claimId);
        evaluationStatus = engineResult.decision;
      } catch (err) {
        // Claim created but engine failed — stays Pending Check for manual review
        console.error("Evaluation failed:", err);
      }

      // 9. Return standardized success response
      return jsonOk({
        success: true,
        message: "Lead received and processed successfully",
        claim_ref: claimRef,
        evaluation_status: evaluationStatus,
      }, 201);

    } catch {
      // Catch-all for any unhandled server error
      return jsonError(500, "Internal server error");
    }
  }

  return jsonError(404, `No route for ${req.method} ${path}`);
});
