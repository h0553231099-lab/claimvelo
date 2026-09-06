import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Secure customer file upload for claim documents.
 *
 * Customers cannot upload directly to the claim-files Storage bucket (RLS
 * blocks non-staff INSERT). This edge function acts as a trusted proxy:
 *   1. Authenticates the caller via JWT.
 *   2. Verifies the customer owns the claim (customer_user_id = auth.uid()).
 *   3. Uploads the file to Storage using the service-role key (bypasses RLS).
 *   4. Inserts the claim_files metadata row (also service-role).
 *   5. Returns the new file id.
 *
 * Staff (admin/super_admin/worker) may also use this endpoint.
 *
 * The claim-files Storage bucket is never exposed to clients — only
 * short-lived signed download URLs are returned via the claim-file-url
 * edge function.
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
    // ── Authenticate the caller ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Authentication required");
    }
    const token = authHeader.replace("Bearer ", "");

    // Reject service-role key — this endpoint is for authenticated users only
    if (token === serviceRoleKey) {
      return jsonError(403, "Use a user token, not the service-role key");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return jsonError(401, "Invalid or expired token");
    }

    // ── Parse multipart form data ─────────────────────────────────────────────
    const formData = await req.formData();
    const claimId = formData.get("claim_id") as string;
    const infoRequestId = (formData.get("info_request_id") as string) || null;
    const note = (formData.get("note") as string) || "Response to info request";
    const file = formData.get("file") as File;

    if (!claimId || !file) {
      return jsonError(400, "Missing claim_id or file");
    }

    // 5 MB limit
    if (file.size > 5 * 1024 * 1024) {
      return jsonError(413, "File too large (5 MB max)");
    }

    // ── Verify the caller owns this claim (or is staff) ──────────────────────
    const { data: claim } = await admin
      .from("claims")
      .select("id, customer_user_id")
      .eq("id", claimId)
      .maybeSingle();

    if (!claim) {
      return jsonError(404, "Claim not found");
    }

    const isOwner = claim.customer_user_id === user.id;

    if (!isOwner) {
      // Check if the user is staff
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const isStaff = profile && ["admin", "super_admin", "worker"].includes(profile.role);
      if (!isStaff) {
        return jsonError(403, "You do not have access to this claim");
      }
    }

    // ── Upload the file to Storage (service-role key bypasses RLS) ────────────
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `claim-files/${claimId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin
      .storage
      .from("claim-files")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      return jsonError(500, `Failed to upload file: ${uploadError.message}`);
    }

    // ── Insert the claim_files metadata row ──────────────────────────────────
    const { data: claimFile, error: dbError } = await admin
      .from("claim_files")
      .insert({
        claim_id: claimId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || ext,
        storage_path: storagePath,
        note,
        info_request_id: infoRequestId,
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (dbError) {
      // Clean up the uploaded file if the DB insert fails
      await admin.storage.from("claim-files").remove([storagePath]);
      return jsonError(500, `Failed to create file record: ${dbError.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      file_id: claimFile.id,
      storage_path: storagePath,
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
