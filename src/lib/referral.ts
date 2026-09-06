/**
 * Referral Attribution Persistence
 *
 * Stores the referring agent's code in localStorage so it survives:
 *   - landing page → signup/login → navigation → claim completion
 *
 * The URL parameter (?agent=CODE) is the entry point. Once captured,
 * the code persists in localStorage with a 30-day expiry.
 *
 * Server-side validation remains authoritative — the create-claim
 * edge function validates the code against worker_profiles before
 * persisting attribution.
 */

const STORAGE_KEY = 'cv_referral_agent';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredReferral {
  code: string;
  stored_at: number;
}

/**
 * Capture the agent code from a URL ?agent= parameter.
 * Call this on any page that might receive a referral link (/start, /claim).
 * Does NOT overwrite an existing valid referral unless a new code is provided.
 */
export function captureReferralFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('agent');
  if (code && code.trim()) {
    storeReferralCode(code.trim().toUpperCase());
    return code.trim().toUpperCase();
  }
  return null;
}

/**
 * Store the referral code in localStorage with a timestamp.
 */
function storeReferralCode(code: string): void {
  const entry: StoredReferral = { code, stored_at: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage not available (private browsing, etc.)
  }
}

/**
 * Retrieve the persisted referral code if it hasn't expired.
 * Returns null if no code is stored or it has expired.
 */
export function getReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry: StoredReferral = JSON.parse(raw);
    if (!entry.code || !entry.stored_at) return null;
    if (Date.now() - entry.stored_at > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return entry.code;
  } catch {
    return null;
  }
}

/**
 * Clear the stored referral code (e.g. after claim submission if desired).
 */
export function clearReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
