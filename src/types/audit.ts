// src/types/audit.ts
// WAG ENTERPRISES — Audit & Security Event Types

export type AuditAction =
  | 'login'
  | 'logout'
  | 'deposit'
  | 'payout'
  | 'opening'
  | 'withdrawal'
  | 'approve'
  | 'reject'
  | 'elevate'
  | 'delete'
  | 'flag'
  | 'plan_created'
  | 'plan_completed'
  | 'plan_deleted'
  | 'disbursement_request'
  | 'disbursement_approved'
  | 'disbursement_paid'
  | 'disbursement_rejected'
  | 'fraud_resolved'
  | 'role_changed'
  | 'account_locked'
  | 'account_unlocked'
  | 'token_generated'
  | 'pin_reset_requested'
  | 'pin_reset_completed';

export type UserRole = 'customer' | 'representative' | 'admin' | 'system';

export interface AuditLog {
  id: string;
  action: AuditAction | string;
  user_id: string | null;
  user_role: UserRole | string | null;
  description: string;
  amount: number | null;
  plan_id: string | null;
  created_at: string;
}

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'pin_verified'
  | 'pin_failed'
  | 'pin_locked'
  | 'pin_reset_requested'
  | 'pin_reset_completed'
  | 'logout'
  | 'session_expired'
  | 'session_revoked'
  | 'role_changed'
  | 'account_locked'
  | 'account_unlocked'
  | 'suspicious_activity'
  | 'rate_limit_hit'
  | 'token_generated'
  | 'token_used'
  | 'unauthorized_access';

export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  user_id: string | null;
  user_role: UserRole | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Audit log display entry (enriched for UI rendering) */
export interface AuditLogDisplay extends AuditLog {
  color: string;
  icon: string;
  formattedAmount: string | null;
  formattedDate: string;
  formattedTime: string;
}

/** Audit log filter options */
export interface AuditLogFilters {
  action?: AuditAction | '';
  user_role?: UserRole | '';
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}
