import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const { data: emails } = await supabase
      .from("staff_emails")
      .select("id, raw_payload")
      .eq("body_text", "")
      .eq("body_html", "");

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    for (const email of emails) {
      const emailId = email.raw_payload?.data?.email_id;
      if (!emailId) continue;

      const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      if (!res.ok) continue;

      const body = await res.json();
      const bodyText: string = body?.text || "";
      const rawHtml: string = body?.html || "";
      let bodyHtml = rawHtml;
      if (rawHtml.startsWith("data:")) {
        const base64 = rawHtml.split(",")[1] || "";
        try { bodyHtml = atob(base64); } catch { bodyHtml = rawHtml; }
      }

      if (!bodyText && !bodyHtml) continue;

      await supabase
        .from("staff_emails")
        .update({ body_text: bodyText, body_html: bodyHtml })
        .eq("id", email.id);

      updated++;
    }

    return new Response(JSON.stringify({ updated, total: emails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
