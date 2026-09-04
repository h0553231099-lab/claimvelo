/**
 * Segment verification and replacement-flight verification.
 *
 * Used by create-claim and b2b-api to verify connecting-flight segments
 * against provider data BEFORE the rules engine evaluates the claim.
 *
 * - Each segment is fetched from AeroDataBox + AviationStack and cross-checked.
 * - Raw provider JSON is stored server-side only (in claim_flight_segments.provider_evidence).
 * - Final-destination delay = last segment's (actual_arrival − scheduled_arrival).
 * - Replacement flights are verified the same way, populating the
 *   replacement_*_verified fields on the claim.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  fetchAeroDataBox,
  fetchAviationStack,
  crossCheck,
  type ProviderFlight,
  type ProviderResult,
} from "./evaluate.ts";

export interface SegmentInput {
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  segment_order: number;
}

/**
 * Verify all segments for a claim against provider data.
 * Inserts rows into claim_flight_segments with verified data.
 * Updates claim.final_destination_delay_minutes.
 *
 * Returns true if all segments verified, false if any failed.
 */
export async function verifyAndStoreSegments(
  supabaseUrl: string,
  serviceRoleKey: string,
  claimId: string,
  segments: SegmentInput[],
): Promise<{ allVerified: boolean; finalDestinationDelay: number | null }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const aeroKey = Deno.env.get("AERODATABOX_API_KEY");
  const aviaKey = Deno.env.get("AVIATIONSTACK_API_KEY");

  let allVerified = true;
  let finalDestinationDelay: number | null = null;

  // Fetch the claim's original_scheduled_final_arrival — the canonical baseline
  // that must NEVER be replaced by a rerouted/replacement itinerary.
  const { data: claimRow } = await supabase
    .from("claims")
    .select("original_scheduled_final_arrival")
    .eq("id", claimId)
    .maybeSingle();
  let originalScheduledFinalArrival: string | null = claimRow?.original_scheduled_final_arrival ?? null;

  for (const seg of segments) {
    const providers: ProviderResult[] = [];
    const aero = await fetchAeroDataBox(seg.flight_number, seg.flight_date, aeroKey);
    if (aero) providers.push(aero);
    const avia = await fetchAviationStack(seg.flight_number, seg.flight_date, aviaKey);
    if (avia) providers.push(avia);

    const providerEvidence: Record<string, unknown> = {};
    for (const p of providers) providerEvidence[p.source] = p.raw;

    const cc = crossCheck(
      { flightNumber: seg.flight_number, flightDate: seg.flight_date, origin: seg.origin, destination: seg.destination },
      providers,
    );

    const matched = cc.matched;
    const primarySource = matched
      ? (aero && aero.flights.includes(matched) ? "aerodatabox" : "aviationstack")
      : (providers.length > 0 ? providers[0].source : "none");

    const row: Record<string, unknown> = {
      claim_id: claimId,
      segment_order: seg.segment_order,
      flight_number: seg.flight_number,
      flight_date: seg.flight_date,
      origin: seg.origin.toUpperCase(),
      destination: seg.destination.toUpperCase(),
      scheduled_departure: matched?.scheduledDeparture ?? null,
      scheduled_arrival: matched?.scheduledArrival ?? null,
      actual_departure: matched?.actualDeparture ?? null,
      actual_arrival: matched?.actualArrival ?? null,
      operating_carrier: matched?.operatingCarrier ?? null,
      operating_carrier_name: matched?.operatingCarrierName ?? null,
      marketing_carrier: matched?.marketingCarrier ?? null,
      codeshare_status: matched?.codeshareStatus ?? null,
      provider_source: primarySource,
      provider_evidence: providerEvidence,
      delay_minutes: matched?.delayMinutes ?? null,
      flight_status: matched?.status ?? null,
      cross_check_status: cc.status,
    };

    await supabase.from("claim_flight_segments").upsert(row, { onConflict: "claim_id,segment_order" });

    if (cc.status !== "matched") {
      allVerified = false;
    }

    // If this is the last segment, compute final-destination delay using
    // original_scheduled_final_arrival as the canonical baseline — NOT the
    // last segment's own scheduled_arrival (which may belong to a
    // rerouted/replacement flight and must never replace the original).
    if (seg.segment_order === segments.length && matched?.actualArrival) {
      // If original_scheduled_final_arrival is not yet set, capture it from
      // the last segment's provider-verified scheduled arrival (first run).
      if (!originalScheduledFinalArrival && matched.scheduledArrival) {
        originalScheduledFinalArrival = matched.scheduledArrival;
      }
      if (originalScheduledFinalArrival) {
        const actual = new Date(matched.actualArrival).getTime();
        const baseline = new Date(originalScheduledFinalArrival).getTime();
        finalDestinationDelay = Math.max(0, Math.round((actual - baseline) / 60000));
      }
    }
  }

  // Update claim with final-destination delay AND persist the canonical
  // original_scheduled_final_arrival so it is never overwritten on re-eval.
  const updateFields: Record<string, unknown> = {};
  if (finalDestinationDelay !== null) {
    updateFields.final_destination_delay_minutes = finalDestinationDelay;
  }
  if (originalScheduledFinalArrival) {
    updateFields.original_scheduled_final_arrival = originalScheduledFinalArrival;
  }
  if (Object.keys(updateFields).length > 0) {
    await supabase.from("claims").update(updateFields).eq("id", claimId);
  }

  return { allVerified, finalDestinationDelay };
}

/**
 * Verify a replacement flight against provider data.
 * Populates replacement_scheduled_dep_verified, replacement_scheduled_arr_verified,
 * and replacement_actual_arr_verified on the claim.
 *
 * Returns true if the replacement flight was found and verified.
 */
export async function verifyReplacementFlight(
  supabaseUrl: string,
  serviceRoleKey: string,
  claimId: string,
  replacementFlightNumber: string,
  flightDate: string,
): Promise<boolean> {
  if (!replacementFlightNumber || !flightDate) return false;

  const aeroKey = Deno.env.get("AERODATABOX_API_KEY");
  const aviaKey = Deno.env.get("AVIATIONSTACK_API_KEY");

  const providers: ProviderResult[] = [];
  const aero = await fetchAeroDataBox(replacementFlightNumber, flightDate, aeroKey);
  if (aero) providers.push(aero);
  const avia = await fetchAviationStack(replacementFlightNumber, flightDate, aviaKey);
  if (avia) providers.push(avia);

  if (providers.length === 0) return false;

  // Find a flight with actual arrival data
  const allFlights = providers.flatMap((p) => p.flights);
  const withData = allFlights.find((f) => f.actualArrival);

  if (!withData) return false;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await supabase.from("claims").update({
    replacement_scheduled_dep_verified: withData.scheduledDeparture ?? null,
    replacement_scheduled_arr_verified: withData.scheduledArrival ?? null,
    replacement_actual_arr_verified: withData.actualArrival ?? null,
  }).eq("id", claimId);

  return true;
}
