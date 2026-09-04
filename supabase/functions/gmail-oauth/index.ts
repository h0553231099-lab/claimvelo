import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Gmail OAuth callback handler.
 *
 * Two endpoints:
 *   GET  /gmail-oauth          → returns the Google authorization URL
 *   POST /gmail-oauth           → exchanges an authorization code for tokens
 *                                 (stores the refresh token as a secret via
 *                                  the Supabase Management API, or returns it
 *                                  for manual entry into the secrets dashboard)
 *
 * Scopes: https://www.googleapis.com/auth/gmail.modify
 */

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GMAIL_OAUTH_REDIRECT_URI") || "";

  if (!clientId || !clientSecret) {
    return jsonResponse({ error: "Google OAuth credentials not configured" }, 500);
  }

  const url = new URL(req.url);

  // ── GET: return authorization URL ──────────────────────────────────────────
  if (req.method === "GET") {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri || `${url.origin}/functions/v1/gmail-oauth/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent"); // force refresh_token

    return jsonResponse({
      auth_url: authUrl.toString(),
      redirect_uri: authUrl.searchParams.get("redirect_uri"),
      scopes: SCOPES,
    });
  }

  // ── POST: exchange authorization code for tokens ──────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { code, redirect_uri } = body;

      if (!code) return jsonResponse({ error: "Missing authorization code" }, 400);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirect_uri || `${url.origin}/functions/v1/gmail-oauth/callback`,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return jsonResponse({ error: `Token exchange failed: ${tokenRes.status}`, detail: err }, 400);
      }

      const tokens = await tokenRes.json();

      return jsonResponse({
        ok: true,
        refresh_token: tokens.refresh_token || null,
        access_token: tokens.access_token ? "(present)" : null,
        expires_in: tokens.expires_in,
        scope: tokens.scope,
        // Instructions: store the refresh_token as GOOGLE_REFRESH_TOKEN in the
        // Base44 secrets dashboard, and set GMAIL_MONITORING_EMAIL to the
        // authorized account's email address.
        instructions: "Store the refresh_token as GOOGLE_REFRESH_TOKEN and set GMAIL_MONITORING_EMAIL to the authorized Gmail address in the secrets dashboard.",
      });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
