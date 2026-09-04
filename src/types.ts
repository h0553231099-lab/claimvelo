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
  // Compensation
  compensation_amount?: number | null;
  // Phase 4 — review decision workflow
  review_decision?: 'approved' | 'rejected' | 'escalated' | null;
  review_decision_reason?: string | null;
  review_decided_by?: string | null;
  review_decided_at?: string | null;
}

export interface ClaimStatusHistory {
  id: string;
  claim_id: string;
  field_name: 'status' | 'eligibility_status' | 'priority' | 'assigned_to' | 'document_upload' | 'override' | 'review_decision' | 'info_request' | 'airline_email';
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  source: 'staff' | 'system' | 'insert';
  actor_name: string | null;
  created_at: string;
}

export interface FlightEvidenceSummary {
  data_source: string | null;
  fetch_timestamp: string | null;
  delay_minutes: number | null;
  flight_status: string | null;
  cross_check_status: string;
  decision: string;
  decision_reason: string;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  confidence_score: number | null;
}

export interface InfoRequest {
  id: string;
  claim_id: string;
  request_type: 'document' | 'information';
  title: string;
  description: string;
  status: 'requested' | 'received' | 'overdue' | 'cancelled';
  requested_by: string | null;
  requested_at: string;
  due_at: string | null;
  fulfilled_at: string | null;
  fulfilled_by_file_id: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  requester_name?: string | null;
}

export interface ReviewNote {
  id: string;
  claim_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

export interface FlightSegmentSummary {
  segment_order: number;
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  marketing_carrier: string;
  operating_carrier: string;
  operating_carrier_name: string;
  codeshare_status: string;
  delay_minutes: number | null;
  flight_status: string;
  cross_check_status: string;
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
export type AdminView = 'dash' | 'claims' | 'crm' | 'inbox' | 'airline-emails' | 'notifs' | 'analytics' | 'automation' | 'users' | 'settings' | 'finance' | 'qr' | 'partners' | 'bulk' | 'review';

// ── Phase 6 — Airline Email Integration ────────────────────────────────────────

export type EmailDirection = 'inbound' | 'outbound';
export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'AMBIGUOUS';
export type EmailStatus = 'NEW' | 'SEEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'ESCALATED';

export interface AirlineEmail {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  direction: EmailDirection;
  from_address: string;
  from_name: string;
  to_address: string;
  cc_address: string;
  subject: string;
  body_text: string;
  body_html: string;
  snippet: string;
  received_at: string | null;
  sent_at: string | null;
  claim_id: string | null;
  matching_confidence: MatchConfidence;
  matched_fields: Record<string, string>;
  matched_claim_refs: string[];
  email_status: EmailStatus;
  assigned_to: string | null;
  next_action: string;
  due_at: string | null;
  has_attachments: boolean;
  attachment_count: number;
  sync_batch_id: string;
  created_at: string;
  updated_at: string;
}

export interface AirlineEmailAttachment {
  id: string;
  email_id: string;
  claim_id: string | null;
  gmail_attachment_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

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
