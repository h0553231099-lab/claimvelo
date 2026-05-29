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

    // Resend webhook: { type: "email.received", data: { email_id, to, from, subject, attachments, ... } }
    // Body is NOT included in the webhook — must be fetched via GET /emails/receiving/:email_id
    const data = payload?.data || payload;

    const emailId: string = data?.email_id || "";

    const rawTo: unknown[] = data?.to || [];
    const toList: Array<{ email: string }> = rawTo.map((t) =>
      typeof t === "string" ? { email: t } : (t as { email: string })
    );
    const rawFrom = data?.from || "";
    const fromAddr: string = typeof rawFrom === "object" ? (rawFrom as { email: string }).email : rawFrom;
    const fromName: string = typeof rawFrom === "object" ? ((rawFrom as { name?: string }).name || fromAddr) : fromAddr;
    const subject: string = data?.subject || "(no subject)";

    if (toList.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full email body from Resend API using the email_id
    let bodyText = "";
    let bodyHtml = "";
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (emailId && resendKey) {
      try {
        const bodyRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        if (bodyRes.ok) {
          const bodyData = await bodyRes.json();
          bodyText = bodyData?.text || "";
          // html may be a base64 data URI — extract raw HTML if so
          const rawHtml: string = bodyData?.html || "";
          if (rawHtml.startsWith("data:")) {
            const base64 = rawHtml.split(",")[1] || "";
            try {
              bodyHtml = atob(base64);
            } catch {
              bodyHtml = rawHtml;
            }
          } else {
            bodyHtml = rawHtml;
          }
        } else {
          console.error("Resend body fetch failed:", bodyRes.status, await bodyRes.text());
        }
      } catch (e) {
        console.error("Error fetching email body:", e);
      }
    }

    const results = [];

    for (const recipient of toList) {
      const toAddress = recipient.email?.toLowerCase() || "";

      // Domain inboxes (shared, no owner): info@, support@
      const isDomainInbox = ["info@claimvelo.com", "support@claimvelo.com"].includes(toAddress);

      // Look up which staff member owns this personal @claimvelo.com address
      let toUserId: string | null = null;
      if (!isDomainInbox && toAddress.endsWith("@claimvelo.com")) {
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
