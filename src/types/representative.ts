// src/types/representative.ts
// WAG ENTERPRISES — Representative Domain Types

export interface Representative {
  id: string;
  auth_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pin_hash?: string;          // Never returned from API
  rep_id: string;             // 6-digit display ID e.g. "234567"
  confirmed_count: number;    // Total collections confirmed
  is_active: boolean;
  territory: string | null;
  max_daily_collection: number;
  created_at: string;
  updated_at: string;
}

export type RepresentativePublic = Omit<Representative, 'pin_hash' | 'auth_id'>;

/** Shape used for creating a new representative */
export interface CreateRepresentativePayload {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pin: string;                // Raw PIN — hashed server-side
  activation_token: string;   // Required for rep registration
}

/** Representative registration form */
export interface RepRegisterForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pin: string;
  confirm_pin: string;
  activation_token: string;
}

/** Representative session (stored after login) */
export interface RepresentativeSession {
  id: string;
  auth_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  rep_id: string;
  confirmed_count: number;
  role: 'representative';
}

/** Rep reliability score returned by scoring function */
export interface RepScore {
  representative_id: string;
  score: number;            // 0-100
  label: 'excellent' | 'good' | 'needs review';
  flag_count: number;
  high_flags: number;
  medium_flags: number;
  low_flags: number;
}

/** Daily collection summary for rep dashboard */
export interface RepTodaySummary {
  representative_id: string;
  rep_id: string;
  first_name: string;
  last_name: string;
  today_total: number;
  tx_count: number;
  max_daily_total: number;
  max_single_tx: number;
}

/** Customer found via rep search */
export interface FoundCustomer {
  customer: RepresentativeSession extends never ? never : {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    created_at: string;
  };
  plans: import('./plan').PlanBalance[];
  pending_disbursements: import('./disbursement').Disbursement[];
}
