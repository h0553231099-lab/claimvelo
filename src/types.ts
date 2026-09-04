export type ClaimStatus = 'Untouched' | 'Pending Check' | 'In Progress' | 'Submitted' | 'Waiting' | 'Resolved' | 'Escalated' | 'Eligible' | 'Not Eligible' | 'Not Eligible - Expired' | 'Force Majeure';

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
export type AdminView = 'dash' | 'claims' | 'crm' | 'inbox' | 'notifs' | 'analytics' | 'automation' | 'users' | 'settings' | 'finance' | 'qr' | 'partners' | 'bulk';

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
