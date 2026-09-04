import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const AI_URL = `${supabaseUrl}/functions/v1/claude-ai`;
export const AI_HEADERS = {
  'Authorization': `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
};

export const EMAIL_URL = `${supabaseUrl}/functions/v1/send-claim-email`;
export const SEND_STAFF_EMAIL_URL = `${supabaseUrl}/functions/v1/send-staff-email`;
export const FLIGHT_LOOKUP_URL = `${supabaseUrl}/functions/v1/flight-lookup`;
export const GMAIL_SYNC_URL = `${supabaseUrl}/functions/v1/gmail-sync`;
export const GMAIL_SEND_URL = `${supabaseUrl}/functions/v1/gmail-send`;

export type FlightLookupResult = {
  flightNum: string;
  airline: string;
  depAirport: string;
  depCode: string;
  arrAirport: string;
  arrCode: string;
  depTime: string;
  arrTime: string;
  actualDepTime: string | null;
  actualArrTime: string | null;
  delayMin: number;
  status: string;
  date: string;
};

export async function lookupFlight(
  flightNumber: string,
  date: string,
  depCode?: string,
  arrCode?: string,
): Promise<{ flights: FlightLookupResult[]; error?: string }> {
  try {
    const res = await fetch(FLIGHT_LOOKUP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ flightNumber: flightNumber || '', date, depCode, arrCode }),
    });
    const data = await res.json();
    if (data.error) return { flights: [], error: data.error };
    return { flights: data.flights || [] };
  } catch {
    return { flights: [], error: 'Network error — please try again' };
  }
}

export async function insertNotification(payload: {
  type: string;
  claim_ref: string;
  claim_id?: string;
  message: string;
}) {
  // Notifications are now inserted server-side by edge functions (create-claim,
  // evaluate-claim) using the service_role key. This client-side function is
  // kept for staff-side notification creation (admin dashboard) where the
  // user is authenticated as staff and RLS allows INSERT.
  try {
    await supabase.from('notifications').insert({
      type: payload.type,
      claim_ref: payload.claim_ref,
      claim_id: payload.claim_id ?? null,
      message: payload.message,
    });
  } catch {
    // Non-blocking — staff may not have insert permission if not staff role
  }
}

export async function sendClaimEmail(payload: {
  type: 'claim_submitted' | 'status_changed';
  to: string;
  passengerName: string;
  claimRef: string;
  airline?: string;
  route?: string;
  amount?: string;
  newStatus?: string;
  oldStatus?: string;
}) {
  try {
    // Status-change emails require an authenticated staff session — the
    // send-claim-email edge function now verifies the JWT and staff role.
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking — email failure should not break the UI flow
  }
}
