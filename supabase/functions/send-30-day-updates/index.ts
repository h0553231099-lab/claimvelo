import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Send 30-day customer updates.
 *
 * Called daily by pg_cron via the dispatch_30_day_updates() function.
 *
 * For every active claim that hasn't received a customer-facing update in
 * 30+ days, sends a truthful update email in the customer's preferred language
 * (English fallback). Prevents duplicates by checking last_customer_update_at.
 *
 * Internal notes do NOT reset the timer — only outbound customer communications
 * and staff-initiated status changes update last_customer_update_at.
 */

const UPDATE_TEMPLATES: Record<string, { subject: string; body: (ref: string, airline: string, status: string) => string }> = {
  en: {
    subject: (ref: string, _airline: string) => `Update on your claim ${ref}`,
    body: (ref: string, airline: string, status: string) =>
      `Dear Customer,\n\nWe're writing to give you an update on your compensation claim ${ref} regarding your flight with ${airline || "the airline"}.\n\nYour claim is currently at the "${status}" stage. We want to assure you that your case is still active and being worked on. Our team is continuing to pursue your claim and we will contact you as soon as there is a meaningful development.\n\nIf you have any questions in the meantime, please don't hesitate to reply to this email or log in to your ClaimVelo portal.\n\nThank you for your patience.\n\nKind regards,\nThe ClaimVelo Team`,
  },
  es: {
    subject: (ref: string, _airline: string) => `Actualización sobre su reclamación ${ref}`,
    body: (ref: string, airline: string, status: string) =>
      `Estimado cliente,\n\nLe escribimos para informarle sobre el estado de su reclamación de compensación ${ref} relacionada con su vuelo con ${airline || "la aerolínea"}.\n\nSu reclamación se encuentra actualmente en la fase de "${status}". Queremos asegurarle que su caso sigue activo y en proceso. Nuestro equipo continúa trabajando en su reclamación y le contactaremos tan pronto como haya un desarrollo significativo.\n\nSi tiene alguna pregunta, no dude en responder a este correo o iniciar sesión en su portal de ClaimVelo.\n\nGracias por su paciencia.\n\nSaludos cordiales,\nEl equipo de ClaimVelo`,
  },
  fr: {
    subject: (ref: string, _airline: string) => `Mise à jour de votre réclamation ${ref}`,
    body: (ref: string, airline: string, status: string) =>
      `Cher client,\n\nNous vous écrivons pour vous donner des nouvelles de votre réclamation d'indemnisation ${ref} concernant votre vol avec ${airline || "la compagnie aérienne"}.\n\nVotre réclamation est actuellement au stade "${status}". Nous tenons à vous rassurer que votre dossier est toujours actif et en cours de traitement. Notre équipe continue de poursuivre votre réclamation et nous vous contacterons dès qu'il y aura un développement significatif.\n\nSi vous avez des questions, n'hésitez pas à répondre à cet email ou à vous connecter à votre portail ClaimVelo.\n\nMerci pour votre patience.\n\nCordialement,\nL'équipe ClaimVelo`,
  },
  de: {
    subject: (ref: string, _airline: string) => `Update zu Ihrer Anspruch ${ref}`,
    body: (ref: string, airline: string, status: string) =>
      `Sehr geehrter Kunde,\n\nwir schreiben Ihnen, um Sie über den Stand Ihrer Entschädigungsforderung ${ref} bezüglich Ihres Fluges mit ${airline || "der Fluggesellschaft"} zu informieren.\n\nIhr Anspruch befindet sich derzeit im Stadium "${status}". Wir möchten Ihnen versichern, dass Ihr Fall noch aktiv bearbeitet wird. Unser Team verfolgt Ihren Anspruch weiter und wir werden uns melden, sobald es eine wesentliche Entwicklung gibt.\n\nWenn Sie Fragen haben, antworten Sie bitte auf diese E-Mail oder melden Sie sich in Ihrem ClaimVelo-Portal an.\n\nVielen Dank für Ihre Geduld.\n\nMit freundlichen Grüßen,\nDas ClaimVelo-Team`,
  },
};

function getTemplate(language: string) {
  return UPDATE_TEMPLATES[language] || UPDATE_TEMPLATES.en;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ── 1. Get claims needing 30-day updates ──────────────────────────────────
    const { data: claims, error } = await admin.rpc("get_claims_needing_30_day_update");

    if (error) {
      throw new Error(`Failed to fetch claims: ${error.message}`);
    }

    if (!claims || claims.length === 0) {
      return jsonResponse({ ok: true, message: "No claims need 30-day updates", sent: 0 });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const sent: string[] = [];
    const failed: string[] = [];

    for (const claim of claims) {
      try {
        const language = claim.preferred_language || "en";
        const template = getTemplate(language);

        const subject = template.subject(claim.claim_ref, claim.airline);
        const body = template.body(claim.claim_ref, claim.airline, claim.status);

        // ── 2. Send the email ──────────────────────────────────────────────────
        let emailSent = false;

        if (!resendKey) {
          console.error(`30-day update email failed for ${claim.claim_ref}: RESEND_API_KEY not configured`);
        } else {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "ClaimVelo <support@claimvelo.com>",
              to: [claim.email],
              reply_to: "support@claimvelo.com",
              subject,
              text: body,
            }),
          });

          if (res.ok) {
            emailSent = true;
          } else {
            const err = await res.text();
            console.error(`30-day update email failed for ${claim.claim_ref}: ${err}`);
          }
        }

        // ── 3. Log the communication and update the timer ─────────────────────
        if (emailSent) {
          await admin.rpc("mark_30_day_update_sent", {
            p_claim_id: claim.claim_id,
            p_subject: subject,
            p_body: body,
            p_language: language,
          });
          sent.push(claim.claim_ref);
        } else {
          failed.push(claim.claim_ref);
        }
      } catch (err) {
        console.error(`30-day update failed for ${claim.claim_ref}:`, err);
        failed.push(claim.claim_ref);
      }
    }

    return jsonResponse({
      ok: true,
      checked: claims.length,
      sent: sent.length,
      failed: failed.length,
      sent_refs: sent,
      failed_refs: failed,
    });
  } catch (err) {
    console.error("send-30-day-updates error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
