/**
 * Shared Gmail API helpers for edge functions.
 * Handles OAuth token refresh and Gmail API calls.
 */

export interface GmailTokens {
  access_token: string;
  expires_at: number; // epoch ms
}

let cachedToken: GmailTokens | null = null;

/**
 * Refresh the Gmail OAuth access token using the stored refresh token.
 * Caches the token until 60s before expiry.
 */
export async function getGmailAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expires_at > now + 60_000) {
    return cachedToken.access_token;
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.access_token;
}

export function getMonitoringEmail(): string {
  const email = Deno.env.get("GMAIL_MONITORING_EMAIL");
  if (!email) throw new Error("GMAIL_MONITORING_EMAIL not configured");
  return email;
}

/**
 * Gmail API helper — wraps fetch with auth header and error handling.
 */
export async function gmailApi(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGmailAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  return res;
}

/**
 * Decode a base64url string to UTF-8 text.
 */
export function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  // Handle UTF-8
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Extract plain text and HTML from a Gmail message payload.
 */
export function extractBodyParts(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  function walk(part: any) {
    if (!part) return;
    const mimeType = part.mimeType || "";
    const body = part.body || {};

    if (mimeType === "text/plain" && body.data) {
      text = decodeBase64Url(body.data);
    } else if (mimeType === "text/html" && body.data) {
      html = decodeBase64Url(body.data);
    } else if (part.parts) {
      for (const p of part.parts) walk(p);
    }
  }

  walk(payload);
  return { text, html };
}

/**
 * Extract headers from a Gmail message payload (case-insensitive lookup).
 */
export function getHeader(headers: any[], name: string): string {
  if (!headers) return "";
  const found = headers.find(
    (h: any) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value || "";
}

/**
 * Extract attachments metadata from a Gmail message payload.
 */
export interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export function extractAttachments(payload: any): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];

  function walk(part: any) {
    if (!part) return;
    const body = part.body || {};
    if (body.attachmentId && part.filename) {
      attachments.push({
        attachmentId: body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: body.size || 0,
      });
    }
    if (part.parts) {
      for (const p of part.parts) walk(p);
    }
  }

  walk(payload);
  return attachments;
}

/**
 * Download an attachment from Gmail API (returns raw bytes as ArrayBuffer).
 */
export async function downloadAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer> {
  const email = getMonitoringEmail();
  const res = await gmailApi(
    `/users/${email}/messages/${messageId}/attachments/${attachmentId}`,
  );
  if (!res.ok) throw new Error(`Attachment download failed: ${res.status}`);
  const data = await res.json();
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
