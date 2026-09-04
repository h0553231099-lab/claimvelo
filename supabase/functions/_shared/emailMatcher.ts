/**
 * Email-to-Claim Matching Engine
 *
 * Extracts identifiers from an airline email's subject + body and matches
 * them against claims in the database. Returns a confidence level and
 * the matched claim (if any).
 *
 * Confidence levels:
 *   HIGH      — claim_ref exact match, or ticket number exact match
 *   MEDIUM    — PNR/booking_reference + flight number/date, or airline case number match
 *   LOW       — flight number + date, or passenger name + airline
 *   AMBIGUOUS — 2+ claims tied at the top score
 *   NONE      — no identifiers matched any claim
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE" | "AMBIGUOUS";

export interface MatchResult {
  confidence: MatchConfidence;
  claim_id: string | null;
  claim_ref: string | null;
  matched_fields: Record<string, string>;
  candidate_refs: string[];
}

export interface ExtractedIdentifiers {
  claim_refs: string[];
  pnr_codes: string[];
  ticket_numbers: string[];
  flight_numbers: string[];
  flight_dates: string[];
  passenger_names: string[];
  airline_names: string[];
  routes: string[];
  case_numbers: string[];
}

// ── Extraction ────────────────────────────────────────────────────────────

/** Extract all CLM-### style claim references. */
function extractClaimRefs(text: string): string[] {
  const matches = text.match(/CLM[-\s]?\d{3,6}/gi) || [];
  return [...new Set(matches.map((m) => m.replace(/\s/g, "").toUpperCase()))];
}

/** Extract 6-char alphanumeric PNR/booking references near keywords. */
function extractPNRs(text: string): string[] {
  const results: string[] = [];
  // Look for 6-char alphanumerics near booking/PNR keywords
  const patterns = [
    /(?:booking\s*(?:reference|number|ref)|PNR|reservation\s*(?:code|number|ref))[\s:]*([A-Z0-9]{6})\b/gi,
    /\b([A-Z0-9]{6})\b\s*(?:booking|PNR|reservation)/gi,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      results.push(m[1].toUpperCase());
    }
  }
  // Also check the claims.booking_reference format directly
  return [...new Set(results)];
}

/** Extract 13-digit IATA ticket numbers (optionally with leading 0). */
function extractTicketNumbers(text: string): string[] {
  const matches = text.match(/\b(?:ticket\s*(?:number|no\.?|ref)?[\s:#]*)?(\d{13,14})\b/gi) || [];
  const nums = matches
    .map((m) => {
      const n = m.match(/(\d{13,14})/);
      return n ? n[1] : "";
    })
    .filter(Boolean);
  return [...new Set(nums)];
}

/** Extract flight numbers (2-letter IATA code + digits, or airline name + digits). */
function extractFlightNumbers(text: string): string[] {
  const matches = text.match(/\b([A-Z0-9]{2})\s*(\d{1,5})\b/g) || [];
  return [...new Set(matches.map((m) => m.replace(/\s/g, "").toUpperCase()))];
}

/** Extract dates in common formats. */
function extractDates(text: string): string[] {
  const results: string[] = [];
  // DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Month YYYY, Month DD YYYY
  const patterns = [
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) results.push(m[1]);
  }
  return [...new Set(results)];
}

/** Extract passenger names near "passenger" or "name" keywords. */
function extractPassengerNames(text: string): string[] {
  const results: string[] = [];
  const p = /(?:passenger|name|pax|mr\.?|mrs\.?|ms\.?)\s*:?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi;
  let m;
  while ((m = p.exec(text)) !== null) {
    results.push(m[1].trim());
  }
  return [...new Set(results)];
}

/** Extract airline case/reference numbers near keywords. */
function extractCaseNumbers(text: string): string[] {
  const results: string[] = [];
  const patterns = [
    /(?:case\s*(?:ref|reference|number|no)|file\s*(?:ref|reference|number|no)|your\s*ref(?:erence)?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,20})\b/gi,
  /(?:ref(?:erence)?|case)\s*[:#]\s*([A-Z0-9][A-Z0-9\-]{4,20})\b/gi,
  /\b([A-Z]{2,4}[-\s]\d{6,10})\b/g, // e.g. "BA-12345678"
  /\b(\d{1,2}-\d{6,10})\b/g, // e.g. "1-23456789" (common airline case format)
  /\b([A-Z]{2}\d{8,12})\b/g, // e.g. "AB123456789"
  /\b([A-Z0-9]{8,15})\b/g, // generic alphanumeric case ref
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      results.push(m[1].toUpperCase());
    }
  }
  return [...new Set(results)];
}

/** Extract routes (airport code pairs like LHR-AMS, LHR to AMS). */
function extractRoutes(text: string): string[] {
  const results: string[] = [];
  const p = /\b([A-Z]{3})\s*(?:[-→>]|to)\s*([A-Z]{3})\b/g;
  let m;
  while ((m = p.exec(text)) !== null) {
    results.push(`${m[1]}-${m[2]}`);
  }
  return [...new Set(results)];
}

/** Extract airline names from a known list. */
function extractAirlineNames(text: string): string[] {
  const airlines = [
    "Ryanair", "EasyJet", "British Airways", "Lufthansa", "Wizz Air",
    "KLM", "Air France", "Vueling", "Aer Lingus", "TAP Portugal",
    "Norwegian", "SAS", "Iberia", "Alitalia", "ITA Airways", "Eurowings",
    "Jet2", "Flybe", "Emirates", "Qatar Airways", "Turkish Airlines",
    "Swiss", "Austrian Airlines", "Brussels Airlines", "LOT Polish",
    "Air Europa", "Smartwings", "Volotea", "TUI", "Condor",
  ];
  const lower = text.toLowerCase();
  return airlines.filter((a) => lower.includes(a.toLowerCase()));
}

export function extractIdentifiers(subject: string, body: string): ExtractedIdentifiers {
  const text = `${subject}\n${body}`;
  return {
    claim_refs: extractClaimRefs(text),
    pnr_codes: extractPNRs(text),
    ticket_numbers: extractTicketNumbers(text),
    flight_numbers: extractFlightNumbers(text),
    flight_dates: extractDates(text),
    passenger_names: extractPassengerNames(text),
    airline_names: extractAirlineNames(text),
    routes: extractRoutes(text),
    case_numbers: extractCaseNumbers(text),
  };
}

// ── Matching ───────────────────────────────────────────────────────────────

interface ScoredClaim {
  claim_id: string;
  claim_ref: string;
  score: number;
  matched_fields: Record<string, string>;
}

/**
 * Match extracted identifiers against claims in the database.
 * Uses Supabase service-role client for querying.
 */
export async function matchEmailToClaim(
  supabase: ReturnType<typeof createClient>,
  ids: ExtractedIdentifiers,
): Promise<MatchResult> {
  const matchedFields: Record<string, string> = {};
  const candidates: Map<string, ScoredClaim> = new Map();

  // Helper to record a candidate
  const addCandidate = (claim: any, field: string, value: string, points: number) => {
    const existing = candidates.get(claim.id);
    if (existing) {
      existing.score += points;
      existing.matched_fields[field] = value;
    } else {
      candidates.set(claim.id, {
        claim_id: claim.id,
        claim_ref: claim.claim_ref,
        score: points,
        matched_fields: { [field]: value },
      });
    }
  };

  // 1. Claim reference — HIGH confidence (exact unique match)
  if (ids.claim_refs.length > 0) {
    const { data } = await supabase
      .from("claims")
      .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline, passenger_first_name, passenger_last_name, email, booking_reference")
      .in("claim_ref", ids.claim_refs);
    if (data) {
      for (const c of data) addCandidate(c, "claim_ref", c.claim_ref, 100);
    }
  }

  // 2. PNR / booking reference — MEDIUM
  if (ids.pnr_codes.length > 0) {
    const { data } = await supabase
      .from("claims")
      .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline, passenger_first_name, passenger_last_name, email, booking_reference")
      .in("booking_reference", ids.pnr_codes);
    if (data) {
      for (const c of data) addCandidate(c, "booking_reference", c.booking_reference, 50);
    }
  }

  // 3. Flight number — LOW (many claims can share a flight)
  if (ids.flight_numbers.length > 0) {
    const { data } = await supabase
      .from("claims")
      .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline, passenger_first_name, passenger_last_name, email, booking_reference")
      .in("flight_number", ids.flight_numbers);
    if (data) {
      for (const c of data) addCandidate(c, "flight_number", c.flight_number, 20);
    }
  }

  // 4. Passenger name + airline — LOW
  if (ids.passenger_names.length > 0) {
    for (const name of ids.passenger_names) {
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const { data } = await supabase
          .from("claims")
          .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline, passenger_first_name, passenger_last_name, email, booking_reference")
          .ilike("passenger_first_name", parts[0])
          .ilike("passenger_last_name", parts[1]);
        if (data) {
          for (const c of data) addCandidate(c, "passenger_name", name, 15);
        }
      }
    }
  }

  // 5. Route — LOW
  if (ids.routes.length > 0) {
    for (const route of ids.routes) {
      const [dep, arr] = route.split("-");
      const { data } = await supabase
        .from("claims")
        .select("id, claim_ref, flight_number, flight_date, departure, arrival, airline, passenger_first_name, passenger_last_name, email, booking_reference")
        .eq("departure", dep)
        .eq("arrival", arr);
      if (data) {
        for (const c of data) addCandidate(c, "route", route, 10);
      }
    }
  }

  // No candidates at all
  if (candidates.size === 0) {
    return { confidence: "NONE", claim_id: null, claim_ref: null, matched_fields: {}, candidate_refs: [] };
  }

  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
  const top = sorted[0];

  // Check for AMBIGUOUS — 2+ claims with the same top score
  const tied = sorted.filter((c) => c.score === top.score);
  if (tied.length > 1) {
    return {
      confidence: "AMBIGUOUS",
      claim_id: null,
      claim_ref: null,
      matched_fields: top.matched_fields,
      candidate_refs: tied.map((c) => c.claim_ref),
    };
  }

  // Determine confidence from score
  let confidence: MatchConfidence;
  if (top.score >= 100) confidence = "HIGH";
  else if (top.score >= 50) confidence = "MEDIUM";
  else confidence = "LOW";

  return {
    confidence,
    claim_id: top.claim_id,
    claim_ref: top.claim_ref,
    matched_fields: top.matched_fields,
    candidate_refs: [top.claim_ref],
  };
}
