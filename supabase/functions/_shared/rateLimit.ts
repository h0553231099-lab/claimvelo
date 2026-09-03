/**
 * Simple in-memory sliding-window rate limiter for edge functions.
 *
 * Tracks request timestamps per key (typically `"<fn>:<client-ip>"`) within a
 * rolling time window. Returns whether the next request is allowed and, when
 * not, how many milliseconds until the oldest request exits the window.
 *
 * Limitation: state is per-isolate. Supabase may run multiple edge-function
 * isolates, so a determined attacker could exceed the limit by spreading
 * requests across isolates. This is a best-effort abuse guard against casual
 * / scripted cost abuse of public endpoints, not a hard distributed limit.
 */

const store = new Map<string, number[]>();

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Drop timestamps that have aged out of the window
  const timestamps = (store.get(key) || []).filter((t) => t > windowStart);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterMs = Math.max(oldest + windowMs - now, 0);
    store.set(key, timestamps);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Best-effort client-IP extraction from the request headers forwarded by the
 * Supabase edge-function gateway.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
