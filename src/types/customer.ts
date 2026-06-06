// src/types/customer.ts
// WAG ENTERPRISES — Customer Domain Types

export type KycStatus = 'pending' | 'verified' | 'rejected';

export interface Customer {
  id: string;
  auth_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string | null;
  pin_hash?: string;        // Never returned from API — server only
  is_active: boolean;
  kyc_status: KycStatus;
  created_at: string;
  updated_at: string;
}

/** Safe customer shape — never includes pin_hash */
export type CustomerPublic = Omit<Customer, 'pin_hash' | 'auth_id'>;

/** Shape used for creating a new customer */
export interface CreateCustomerPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address?: string;
  pin: string;           // Raw PIN — hashed server-side in edge function
}

/** Shape used for customer registration form */
export interface CustomerRegisterForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address?: string;
  pin: string;
  confirm_pin: string;
}

/** Customer profile update payload */
export interface UpdateCustomerPayload {
  first_name?: string;
  last_name?: string;
  address?: string;
}

/** Customer as stored in session (minimal, no PII beyond display) */
export interface CustomerSession {
  id: string;
  auth_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  role: 'customer';
}

/** Customer search result (returned by rep/admin search) */
export interface CustomerSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  created_at: string;
  is_active: boolean;
}
