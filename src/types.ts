export type ClaimStatus = 'Untouched' | 'In Progress' | 'Submitted' | 'Waiting' | 'Resolved' | 'Escalated';

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
}

export type UserRole = 'admin' | 'worker' | 'customer' | 'agent' | 'sales_manager';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  claimvelo_email?: string;
  agent_code?: string;
}

export type Page = 'home' | 'claim' | 'dashboard' | 'admin' | 'loa' | 'about' | 'signin' | 'agent-signin' | 'how-it-works' | 'fees' | 'privacy' | 'agent-dashboard' | 'sales-dashboard';
export type AdminView = 'dash' | 'claims' | 'crm' | 'inbox' | 'notifs' | 'analytics' | 'automation' | 'users' | 'settings' | 'finance' | 'qr';

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
