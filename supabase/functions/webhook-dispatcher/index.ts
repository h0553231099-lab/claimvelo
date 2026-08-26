import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch pending webhook deliveries
    const { data: pending, error: fetchError } = await supabase
      .from("webhook_deliveries")
      .select("id, agent_code, payload, attempts")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No pending webhooks" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For each pending delivery, look up the agent's webhook URL and send
    const results: { id: string; status: string; responseCode?: number }[] = [];

    for (const delivery of pending) {
      // Get the agent's webhook URL
      const { data: agent } = await supabase
        .from("worker_profiles")
        .select("webhook_url")
        .eq("agent_code", delivery.agent_code)
        .eq("role", "agent")
        .maybeSingle();

      const webhookUrl = agent?.webhook_url;

      // If no webhook URL anymore, mark as failed
      if (!webhookUrl) {
        await supabase
          .from("webhook_deliveries")
          .update({ status: "failed", attempts: delivery.attempts + 1 })
          .eq("id", delivery.id);
        results.push({ id: delivery.id, status: "failed" });
        continue;
      }

      const newAttempts = delivery.attempts + 1;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ClaimVelo-Event": "claim.status_changed",
            "X-ClaimVelo-Signature": delivery.id,
          },
          body: JSON.stringify(delivery.payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          await supabase
            .from("webhook_deliveries")
            .update({
              status: "delivered",
              attempts: newAttempts,
              response_code: res.status,
              delivered_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);
          results.push({ id: delivery.id, status: "delivered", responseCode: res.status });
        } else {
          // Non-2xx response — mark failed if max attempts reached
          const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
          await supabase
            .from("webhook_deliveries")
            .update({
              status: finalStatus,
              attempts: newAttempts,
              response_code: res.status,
            })
            .eq("id", delivery.id);
          results.push({ id: delivery.id, status: finalStatus, responseCode: res.status });
        }
      } catch {
        // Network error or timeout — mark failed if max attempts reached
        const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
        await supabase
          .from("webhook_deliveries")
          .update({ status: finalStatus, attempts: newAttempts })
          .eq("id", delivery.id);
        results.push({ id: delivery.id, status: finalStatus });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
