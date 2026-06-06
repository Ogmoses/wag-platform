// src/types/disbursement.ts
// WAG ENTERPRISES — Disbursement Domain Types

export type DisbursementType = 'emergency' | 'milestone';
export type DisbursementStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface DisbursementStageEntry {
  stage: DisbursementStatus;
  timestamp: string;
  by: string;             // auth user id
}

export interface Disbursement {
  id: string;
  customer_id: string;
  plan_id: string;
  type: DisbursementType;
  amount: number;
  reason: string | null;
  ref: string;
  status: DisbursementStatus;
  stage_history: DisbursementStageEntry[];
  requested_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

/** Disbursement with plan and customer context (from pending_disbursements view) */
export interface DisbursementWithContext extends Disbursement {
  plan_balance: number;
  plan_name: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
}

/** Payload for requesting a disbursement (customer action) */
export interface RequestDisbursementPayload {
  plan_id: string;
  type: DisbursementType;
  amount: number;
  reason?: string;
}

/** Payload for approving a disbursement (rep/admin action) */
export interface ApproveDisbursementPayload {
  disbursement_id: string;
  plan_id: string;
  amount: number;
  customer_id: string;
}

/** Payload for rejecting a disbursement */
export interface RejectDisbursementPayload {
  disbursement_id: string;
  reason?: string;
}

/** The ordered stages for the stage progress bar in UI */
export const DISBURSEMENT_STAGES: DisbursementStatus[] = [
  'pending',
  'approved',
  'paid',
];

/** Maps disbursement status to UI display properties */
export const DISBURSEMENT_STATUS_CONFIG: Record<
  DisbursementStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending:  { label: 'Pending',  color: '#d97706', bgColor: '#fef3c7' },
  approved: { label: 'Approved', color: '#059669', bgColor: '#d1fae5' },
  paid:     { label: 'Paid',     color: '#2563eb', bgColor: '#dbeafe' },
  rejected: { label: 'Rejected', color: '#dc2626', bgColor: '#fee2e2' },
};
