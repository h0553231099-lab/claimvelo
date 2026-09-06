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
  // Phase 7 — customer communication
  preferred_language?: string;
  last_customer_update_at?: string;
  // Phase 9A — legal & finance fields
  lawyer_id?: string | null;
  legal_case_id?: string | null;
  escalated_at?: string | null;
  escalated_by?: string | null;
  escalation_reason?: string;
  approved_compensation_amount?: number | null;
  approved_at?: string | null;
  approved_by?: string | null;
  airline_payment_status?: 'none' | 'pending' | 'partial' | 'received';
  airline_payment_amount?: number | null;
  airline_payment_date?: string | null;
  airline_payment_reference?: string;
  claimvelo_fee_tier?: 'standard' | 'legal' | null;
  claimvelo_fee_rate?: number | null;
  claimvelo_fee_amount?: number | null;
  customer_payout_status?: 'none' | 'pending' | 'paid';
  customer_payout_amount?: number | null;
  customer_payout_date?: string | null;
  customer_payout_reference?: string;
}

// ── Phase 9A — Legal Cases ─────────────────────────────────────────────────────
export type LegalStatus =
  | 'intake'
  | 'pre_litigation'
  | 'letter_before_claim'
  | 'court_filed'
  | 'in_discovery'
  | 'hearing_scheduled'
  | 'judgment'
  | 'settled'
  | 'closed'
  | 'withdrawn';

export interface LegalCase {
  id: string;
  claim_id: string;
  lawyer_id: string | null;
  legal_status: LegalStatus;
  escalation_reason: string;
  escalated_at: string | null;
  escalated_by: string | null;
  next_deadline_date: string | null;
  deadlines: unknown[];
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Phase 9A — Structured finance transaction types ───────────────────────────
export type FinanceTransactionType =
  | 'airline_payment'
  | 'claimvelo_fee'
  | 'customer_payout'
  | 'agent_commission'
  | 'legal_expense'
  | 'general';

export interface FinanceTransaction {
  id: string;
  type: 'income' | 'expense';
  transaction_type: FinanceTransactionType | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  claim_id: string | null;
  claim_ref: string | null;
  created_by: string | null;
  created_at: string;
}

// Readable audit-log entry (admin only — RLS restricts audit_log to admins).
export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_email: string | null;
  role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

// ── Phase 7 — Customer Communication ──────────────────────────────────────────

export type CommunicationDirection = 'outbound' | 'inbound';
export type CommunicationChannel = 'email' | 'portal';
export type CommunicationMatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'manual';

export interface ClaimCommunication {
  id: string;
  claim_id: string;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  subject: string;
  body: string;
  from_address: string;
  to_address: string;
  from_name: string;
  from_user_id: string | null;
  match_status: CommunicationMatchStatus;
  matched_claim_refs: string[];
  message_id: string | null;
  read_by_staff: boolean;
  read_by_customer: boolean;
  language: string;
  created_at: string;
}

export interface ClaimStatusHistory {
  id: string;
  claim_id: string;
  field_name: 'status' | 'eligibility_status' | 'priority' | 'assigned_to' | 'document_upload' | 'override' | 'review_decision' | 'info_request' | 'airline_email' | 'customer_email';
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

// ── Phase 8B — Commissions ─────────────────────────────────────────────────────
export type CommissionStatus = 'pending' | 'approved' | 'paid';

export interface Commission {
  id: string;
  agent_id: string;
  claim_id: string;
  commission_rate: number;
  commission_amount: number;
  commission_status: CommissionStatus;
  paid_at: string | null;
  created_at: string;
  // Joined fields (optional)
  claim_ref?: string;
  agent_name?: string;
  agent_code?: string;
}

export interface AgentContext {
  id: string;
  agent_code: string;
  commission_rate: number;
  total_payout_earned: number;
  total_paid_to_date: number;
  manager_id: string | null;
  email: string;
  full_name: string;
  status: string;
  managerName: string | null;
  managerEmail: string | null;
}

export type UserRole = 'admin' | 'super_admin' | 'worker' | 'customer' | 'agent' | 'sales_manager' | 'seo_worker' | 'lawyer';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  claimvelo_email?: string;
  agent_code?: string;
}

export type Page = 'home' | 'claim' | 'claim-success' | 'dashboard' | 'admin' | 'loa' | 'about' | 'signin' | 'agent-signin' | 'sales-signin' | 'seo-signin' | 'how-it-works' | 'fees' | 'privacy' | 'terms' | 'agent-dashboard' | 'sales-dashboard' | 'seo-dashboard' | 'lawyer-dashboard' | 'partners' | 'ireland' | 'united-kingdom' | 'api-docs' | 'start';
export type AdminView = 'dash' | 'claims' | 'crm' | 'inbox' | 'airline-emails' | 'notifs' | 'analytics' | 'automation' | 'users' | 'settings' | 'finance' | 'finance-dashboard' | 'legal-queue' | 'qr' | 'partners' | 'bulk' | 'review' | 'leads';

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

// ── Excel Leads MVP ────────────────────────────────────────────────────────────
export type LeadStatus = 'READY' | 'WARNING' | 'REVIEW' | 'FUTURE' | 'DUPLICATE';

export interface ImportBatch {
  id: string;
  file_name: string;
  agent_id: string | null;
  agent_code: string;
  total_rows: number;
  status: string;
  created_by: string | null;
  created_by_email: string;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadFlightSegment {
  id: string;
  lead_id: string;
  segment_order: number;
  flight_number: string;
  flight_date: string;
  origin: string;
  destination: string;
  delay_minutes: number | null;
  delay_reason: string;
}

export interface Lead {
  id: string;
  batch_id: string;
  booking_reference: string;
  passenger_first_name: string;
  passenger_last_name: string;
  email: string;
  phone: string;
  agent_id: string | null;
  agent_code: string;
  status: LeadStatus;
  review_reason: string;
  segment_count: number;
  first_flight_date: string | null;
  last_flight_date: string | null;
  route: string;
  claim_id: string | null;
  lead_key: string;
  created_at: string;
  // joined (optional)
  segments?: LeadFlightSegment[];
  batch_file_name?: string;
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
