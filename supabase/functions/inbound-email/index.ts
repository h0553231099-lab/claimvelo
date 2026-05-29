import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json();

    // Resend inbound email webhook payload shape:
    // { type: "email.received", data: { to: [{email, name}], from: {email, name}, subject, text, html, ... } }
    const data = payload?.data || payload;

    // Resend sends `to` as a plain string array e.g. ["support@claimvelo.com"]
    const rawTo: unknown[] = data?.to || [];
    const toList: Array<{ email: string }> = rawTo.map((t) =>
      typeof t === "string" ? { email: t } : (t as { email: string })
    );
    const rawFrom = data?.from || "";
    const fromAddr: string = typeof rawFrom === "object" ? (rawFrom as { email: string }).email : rawFrom;
    const fromName: string = typeof rawFrom === "object" ? ((rawFrom as { name?: string }).name || fromAddr) : fromAddr;
    const subject: string = data?.subject || "(no subject)";
    const bodyText: string = data?.text || data?.body_text || data?.plain || data?.content || "";
    const bodyHtml: string = data?.html || data?.body_html || data?.html_content || "";

    if (toList.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const recipient of toList) {
      const toAddress = recipient.email?.toLowerCase() || "";

      // Look up which staff member owns this @claimvelo.com address
      let toUserId: string | null = null;
      if (toAddress.endsWith("@claimvelo.com")) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("claimvelo_email", toAddress)
          .maybeSingle();
        toUserId = profile?.id || null;
      }

      const { data: inserted, error } = await supabase
        .from("staff_emails")
        .insert({
          to_address: toAddress,
          to_user_id: toUserId,
          from_address: fromAddr,
          from_name: fromName,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          read_by: [],
          raw_payload: payload,
          received_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        console.error("Insert error:", error);
      } else {
        results.push(inserted?.id);
      }
    }

    return new Response(JSON.stringify({ received: results.length, ids: results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Inbound email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
