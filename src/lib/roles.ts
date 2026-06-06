// src/lib/roles.ts
// WAG ENTERPRISES — Role & Permission Checks
// Client-side role guard helpers that mirror RLS policies

import { getSession, type WagRole } from './auth';

// ─────────────────────────────────────────
// ROLE CHECKS
// ─────────────────────────────────────────

export function getCurrentRole(): WagRole | null {
  return getSession()?.role ?? null;
}

export function isCustomer(): boolean {
  return getCurrentRole() === 'customer';
}

export function isRepresentative(): boolean {
  return getCurrentRole() === 'representative';
}

export function isAdmin(): boolean {
  return getCurrentRole() === 'admin';
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

// ─────────────────────────────────────────
// PERMISSION MAP
// Client-side mirror of role_permissions table
// Server always enforces via RLS — this is UI-layer guard
// ─────────────────────────────────────────
type Resource = string;
type Action = string;

const PERMISSIONS: Record<WagRole, Record<Resource, Action[]>> = {
  customer: {
    plans:           ['read', 'insert', 'soft_delete'],
    transactions:    ['read_own'],
    disbursements:   ['read_own', 'request'],
    profile:         ['read_own', 'update_own'],
  },
  representative: {
    customers:       ['read'],
    plans:           ['read'],
    transactions:    ['read', 'record_collection'],
    disbursements:   ['read', 'approve', 'reject'],
    profile:         ['read_own', 'update_own'],
  },
  admin: {
    customers:       ['read', 'insert', 'update', 'elevate'],
    representatives: ['read', 'insert', 'update'],
    transactions:    ['read', 'reverse'],
    disbursements:   ['read', 'approve', 'reject'],
    activation_tokens: ['generate'],
    audit_log:       ['read'],
    fraud_flags:     ['read', 'resolve'],
    analytics:       ['read'],
    plans:           ['read', 'update'],
    profile:         ['read_own', 'update_own'],
  },
};

export function hasPermission(resource: Resource, action: Action): boolean {
  const role = getCurrentRole();
  if (!role) return false;
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action);
}

// ─────────────────────────────────────────
// ROUTE GUARDS
// Used by ProtectedRoute component
// ─────────────────────────────────────────
export function canViewCustomerDashboard(): boolean {
  return isCustomer() || isAdmin();
}

export function canViewRepDashboard(): boolean {
  return isRepresentative() || isAdmin();
}

export function canViewAdminDashboard(): boolean {
  return isAdmin();
}

export function canRecordCollection(): boolean {
  return hasPermission('transactions', 'record_collection');
}

export function canApproveDisbursement(): boolean {
  return hasPermission('disbursements', 'approve');
}

export function canRejectDisbursement(): boolean {
  return hasPermission('disbursements', 'reject');
}

export function canElevateCustomer(): boolean {
  return hasPermission('customers', 'elevate');
}

export function canGenerateToken(): boolean {
  return hasPermission('activation_tokens', 'generate');
}

export function canReverseTransaction(): boolean {
  return hasPermission('transactions', 'reverse');
}

export function canResolveFraudFlag(): boolean {
  return hasPermission('fraud_flags', 'resolve');
}

export function canViewAuditLog(): boolean {
  return hasPermission('audit_log', 'read');
}

// ─────────────────────────────────────────
// OWNERSHIP CHECKS
// Additional check: does current user own this resource?
// ─────────────────────────────────────────
export function ownsCustomerRecord(customerId: string): boolean {
  const session = getSession();
  if (!session) return false;
  if (isAdmin()) return true;
  return session.user_id === customerId;
}

export function ownsRepRecord(repId: string): boolean {
  const session = getSession();
  if (!session) return false;
  if (isAdmin()) return true;
  return session.user_id === repId;
}
