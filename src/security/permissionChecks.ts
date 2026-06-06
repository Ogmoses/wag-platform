// src/security/permissionChecks.ts
// WAG ENTERPRISES — Runtime Permission Checks
// Guards called before sensitive operations execute

import { getSession } from '../lib/auth';
import { hasPermission, ownsCustomerRecord, ownsRepRecord } from '../lib/roles';

// ─────────────────────────────────────────
// GUARD PATTERN
// Throws a PermissionError if check fails
// ─────────────────────────────────────────
export class PermissionError extends Error {
  constructor(message = 'Permission denied.') {
    super(message);
    this.name = 'PermissionError';
  }
}

/** Require the user to be authenticated */
export function requireAuth(): void {
  if (!getSession()) {
    throw new PermissionError('You must be signed in to perform this action.');
  }
}

/** Require a specific role */
export function requireRole(role: string): void {
  requireAuth();
  const session = getSession()!;
  if (session.role !== role) {
    throw new PermissionError(`This action requires the ${role} role.`);
  }
}

/** Require any one of the listed roles */
export function requireAnyRole(...roles: string[]): void {
  requireAuth();
  const session = getSession()!;
  if (!roles.includes(session.role)) {
    throw new PermissionError(`This action requires one of: ${roles.join(', ')}.`);
  }
}

/** Require a specific permission */
export function requirePermission(resource: string, action: string): void {
  requireAuth();
  if (!hasPermission(resource, action)) {
    throw new PermissionError(`You do not have permission to ${action} ${resource}.`);
  }
}

/** Require ownership of a customer record */
export function requireCustomerOwnership(customerId: string): void {
  requireAuth();
  if (!ownsCustomerRecord(customerId)) {
    throw new PermissionError('You can only access your own account data.');
  }
}

/** Require ownership of a representative record */
export function requireRepOwnership(repId: string): void {
  requireAuth();
  if (!ownsRepRecord(repId)) {
    throw new PermissionError('You can only access your own representative data.');
  }
}

/** Guard: ensure a disbursement amount is within plan balance */
export function requireSufficientBalance(amount: number, balance: number): void {
  if (amount > balance) {
    throw new Error(
      `Requested ₦${amount.toLocaleString()} exceeds plan balance of ₦${balance.toLocaleString()}.`
    );
  }
}

/** Guard: ensure amount is a positive finite number */
export function requirePositiveAmount(amount: number): void {
  if (!isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  if (amount > 10_000_000) {
    throw new Error('Amount exceeds the ₦10,000,000 per-transaction limit.');
  }
}

/** Guard: ensure rep is not over daily collection limit */
export function requireWithinDailyLimit(
  todayTotal: number,
  newAmount: number,
  limit: number
): void {
  if (todayTotal + newAmount > limit) {
    throw new Error(
      `This collection would exceed your daily limit. ` +
      `Today: ₦${todayTotal.toLocaleString()}, Limit: ₦${limit.toLocaleString()}.`
    );
  }
}
