// Operational workflow statuses — the claim lifecycle from intake to resolution.
// These are the ONLY values allowed in claims.status.
export type OperationalStatus = 'Untouched' | 'In Progress' | 'Submitted' | 'Waiting' | 'Escalated' | 'Resolved';

// Eligibility decision statuses — set by the rules engine or admin override.
// These live in claims.eligibility_status, separate from the operational status.
export type EligibilityStatus = 'Pending Check' | 'Eligible' | 'Not Eligible' | 'Not Eligible - Expired' | 'Force Majeure';

// Union kept for backwards-compatible badge/style maps that handle both types.
export type ClaimStatus = OperationalStatus | EligibilityStatus;

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Claim {
  id: string;
  claim_ref: string;
  passenger_first_name: string;
  passenger_last_name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  dob?: string;
  flight_number: string;
  flight_date?: string;
  departure: string;
  arrival: string;
  airline: string;
  issue_type: string;
  airline_reason: string;
  status: ClaimStatus;
  amount: string;
  agent: string;
  loa_signed: boolean;
  signature_data: string;
  notes: string;
  created_at: string;
  updated_at: string;
  // Phase B.2 fields
  jurisdiction?: string;
  operating_carrier?: string;
  operating_carrier_name?: string;
  is_codeshare?: boolean;
  marketing_carrier?: string;
  cancellation_notice_date?: string;
  replacement_offered?: boolean;
  replacement_accepted?: boolean;
  replacement_flight_number?: string;
  boarding_type?: string;
  confirmed_reservation?: boolean;
  checked_in_on_time?: boolean;
  denial_reason?: string;
  is_single_booking?: boolean;
  final_destination_delay_minutes?: number | null;
  original_scheduled_final_arrival?: string;
  review_reason_code?: string;
  review_assigned_to?: string;
  review_status?: string;
  override_decision?: string;
  override_reason?: string;
  overridden_by?: string;
  overridden_at?: string;
  // Phase 1 — separated eligibility
  eligibility_status?: EligibilityStatus | null;
  // Phase 2 — priority + assignment
  priority?: Priority;
  assigned_to?: string | null;
  // Compensation (numeric, from rules engine)
  compensation_amount?: number | null;
  review_completed_at?: string;
}

export interface ClaimStatusHistory {
  id: string;
  claim_id: string;
  field_name: 'status' | 'eligibility_status' | 'priority' | 'assigned_to' | 'review_status' | 'review_assigned_to';
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  source: 'staff' | 'system' | 'insert';
  created_at: string;
}

export interface ClaimFlightSegment {
  id: string;
  claim_id: string;
  segment_order: number;
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  scheduled_departure?: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  marketing_carrier?: string;
  operating_carrier?: string;
  operating_carrier_name?: string;
  codeshare_status?: string;
  provider_source?: string;
  delay_minutes?: number;
  flight_status?: string;
  cross_check_status?: string;
}

// Claim file (document attached to a claim)
export interface ClaimFile {
  id: string;
  claim_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  note: string;
  created_at: string;
}

// Flight evidence summary — only non-sensitive fields exposed to the frontend.
// Raw provider_evidence and cross_check_details are server-side only.
export interface FlightEvidenceSummary {
  claim_id: string;
  data_source: string | null;
  delay_minutes: number | null;
  flight_status: string | null;
  cross_check_status: string | null;
  decision: string | null;
  decision_reason: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
}

export type UserRole = 'admin' | 'super_admin' | 'worker' | 'customer' | 'agent' | 'sales_manager' | 'seo_worker';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  claimvelo_email?: string;
  agent_code?: string;
}

export type Page = 'home' | 'claim' | 'claim-success' | 'dashboard' | 'admin' | 'loa' | 'about' | 'signin' | 'agent-signin' | 'sales-signin' | 'seo-signin' | 'how-it-works' | 'fees' | 'privacy' | 'agent-dashboard' | 'sales-dashboard' | 'seo-dashboard' | 'partners' | 'ireland' | 'united-kingdom' | 'api-docs';
export type AdminView = 'dash' | 'claims' | 'crm' | 'inbox' | 'notifs' | 'analytics' | 'automation' | 'users' | 'settings' | 'finance' | 'qr' | 'partners' | 'bulk' | 'review';

export interface ClaimFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  countryOther: string;
  dob: string;
  flight: string;
  fdate: string;
  dep: string;
  arr: string;
  airline: string;
  issue: string;
  reason: string;
}
