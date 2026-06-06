// src/lib/auth.ts
// WAG ENTERPRISES — Authentication Library
// Handles Supabase Auth + PIN second factor

import { db } from './supabase';
import { logSecurityEvent } from './security';
import { writeAuditLog } from './audit';
import { normPhone, hashPin } from '../utils/helpers';
import type { CustomerSession } from '../types/customer';
import type { RepresentativeSession } from '../types/representative';

export type WagRole = 'customer' | 'representative' | 'admin';

export interface WagSession {
  user_id: string;
  role: WagRole;
  profile: CustomerSession | RepresentativeSession | AdminSession;
  pin_verified: boolean;
  session_token?: string;
}

export interface AdminSession {
  id: string;
  email: string;
  full_name: string;
  role: 'admin';
}

// ─────────────────────────────────────────
// SESSION STORAGE
// Stores minimal session in sessionStorage (cleared on tab close)
// Never stores PIN or pin_hash
// ─────────────────────────────────────────
const SESSION_KEY = 'wag_session_v2';

export function getSession(): WagSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WagSession;
    // Validate required fields
    if (!parsed.user_id || !parsed.role || !parsed.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(session: WagSession): void {
  // Strip any accidental sensitive data before storing
  const safe: WagSession = {
    ...session,
    profile: sanitizeProfile(session.profile),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

function sanitizeProfile(profile: WagSession['profile']): WagSession['profile'] {
  const { ...safe } = profile as Record<string, unknown>;
  delete safe['pin_hash'];
  delete safe['pin'];
  return safe as WagSession['profile'];
}

// ─────────────────────────────────────────
// CUSTOMER LOGIN
// Phone + PIN authentication
// ─────────────────────────────────────────
export interface LoginResult {
  success: boolean;
  session?: WagSession;
  error?: string;
  locked?: boolean;
  attemptsRemaining?: number;
}

export async function loginCustomer(
  phone: string,
  pin: string
): Promise<LoginResult> {
  const normPh = normPhone(phone);

  // Check lockout
  const lockCheck = await checkPinLockout(normPh);
  if (lockCheck.locked) {
    return { success: false, error: 'Account locked due to too many failed PIN attempts.', locked: true };
  }

  const pinHash = await hashPin(pin);

  const { data: cust, error } = await db
    .from('customers')
    .select('id, auth_id, first_name, last_name, email, phone, is_active')
    .eq('phone', normPh)
    .eq('pin_hash', pinHash)
    .single();

  if (error || !cust) {
    const remaining = await recordFailedPin(normPh, 'customer');
    await logSecurityEvent({
      event_type: 'pin_failed',
      user_role: 'customer',
      metadata: { phone: maskPhone(normPh) },
    });
    return {
      success: false,
      error: `Invalid phone or PIN.${remaining <= 0 ? ' Account locked.' : ''}`,
      locked: remaining <= 0,
      attemptsRemaining: Math.max(0, remaining),
    };
  }

  if (!cust.is_active) {
    return { success: false, error: 'Account is inactive. Contact support.' };
  }

  // Reset PIN attempts on success
  await resetPinAttempts(normPh, 'customer');

  const session: WagSession = {
    user_id: cust.id,
    role: 'customer',
    profile: { ...cust, role: 'customer' } as CustomerSession,
    pin_verified: true,
  };

  setSession(session);

  await writeAuditLog({
    action: 'login',
    user_id: cust.id,
    user_role: 'customer',
    description: `Customer signed in: ${cust.first_name} ${cust.last_name}`,
  });

  await logSecurityEvent({
    event_type: 'login_success',
    user_id: cust.id,
    user_role: 'customer',
    metadata: {},
  });

  return { success: true, session };
}

// ─────────────────────────────────────────
// REPRESENTATIVE LOGIN
// Agent ID + PIN authentication
// ─────────────────────────────────────────
export async function loginRepresentative(
  repId: string,
  pin: string
): Promise<LoginResult> {
  const pinHash = await hashPin(pin);

  const { data: rep, error } = await db
    .from('representatives')
    .select('id, auth_id, first_name, last_name, email, phone, rep_id, confirmed_count, is_active')
    .eq('rep_id', repId.trim())
    .eq('pin_hash', pinHash)
    .single();

  if (error || !rep) {
    await logSecurityEvent({
      event_type: 'pin_failed',
      user_role: 'representative',
      metadata: { rep_id: repId },
    });
    return { success: false, error: 'Invalid Agent ID or PIN.' };
  }

  if (!rep.is_active) {
    return { success: false, error: 'Account is deactivated. Contact admin.' };
  }

  const session: WagSession = {
    user_id: rep.id,
    role: 'representative',
    profile: { ...rep, role: 'representative' } as RepresentativeSession,
    pin_verified: true,
  };

  setSession(session);

  await writeAuditLog({
    action: 'login',
    user_id: rep.id,
    user_role: 'representative',
    description: `Representative signed in: ${rep.first_name} ${rep.last_name} (${rep.rep_id})`,
  });

  await logSecurityEvent({
    event_type: 'login_success',
    user_id: rep.id,
    user_role: 'representative',
    metadata: {},
  });

  return { success: true, session };
}

// ─────────────────────────────────────────
// ADMIN LOGIN
// Master PIN (environment variable — never hardcoded in JS)
// ─────────────────────────────────────────
export async function loginAdmin(pin: string): Promise<LoginResult> {
  // Admin PIN is verified server-side via edge function
  const { data, error } = await callEdgeFunction<{ valid: boolean; admin: AdminSession }>(
    'verify-admin-pin',
    { pin }
  );

  if (error || !data?.valid) {
    await logSecurityEvent({
      event_type: 'pin_failed',
      user_role: 'admin',
      metadata: {},
    });
    return { success: false, error: 'Invalid admin PIN.' };
  }

  const session: WagSession = {
    user_id: 'admin',
    role: 'admin',
    profile: data.admin,
    pin_verified: true,
  };

  setSession(session);

  await writeAuditLog({
    action: 'login',
    user_id: 'admin',
    user_role: 'admin',
    description: 'Admin signed in to control centre',
  });

  return { success: true, session };
}

// ─────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────
export async function logout(): Promise<void> {
  const session = getSession();
  if (session) {
    await writeAuditLog({
      action: 'logout',
      user_id: session.user_id,
      user_role: session.role,
      description: `${session.role} signed out`,
    });
    await logSecurityEvent({
      event_type: 'logout',
      user_id: session.user_id,
      user_role: session.role,
      metadata: {},
    });
  }
  clearSession();
}

// ─────────────────────────────────────────
// PIN LOCKOUT MANAGEMENT
// ─────────────────────────────────────────
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface LockoutState {
  locked: boolean;
  attemptsRemaining: number;
}

async function checkPinLockout(phone: string): Promise<LockoutState> {
  // Use localStorage for client-side lockout tracking
  const key = `wag_pin_lock_${phone}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { locked: false, attemptsRemaining: MAX_PIN_ATTEMPTS };
    const state = JSON.parse(raw) as { attempts: number; lockedAt?: number };

    if (state.lockedAt) {
      const elapsed = Date.now() - state.lockedAt;
      if (elapsed < LOCKOUT_DURATION_MS) {
        return { locked: true, attemptsRemaining: 0 };
      }
      // Lockout expired — reset
      localStorage.removeItem(key);
      return { locked: false, attemptsRemaining: MAX_PIN_ATTEMPTS };
    }

    return {
      locked: state.attempts >= MAX_PIN_ATTEMPTS,
      attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - state.attempts),
    };
  } catch {
    return { locked: false, attemptsRemaining: MAX_PIN_ATTEMPTS };
  }
}

async function recordFailedPin(phone: string, _role: WagRole): Promise<number> {
  const key = `wag_pin_lock_${phone}`;
  try {
    const raw = localStorage.getItem(key);
    const state = raw ? JSON.parse(raw) : { attempts: 0 };
    state.attempts = (state.attempts || 0) + 1;
    if (state.attempts >= MAX_PIN_ATTEMPTS) {
      state.lockedAt = Date.now();
    }
    localStorage.setItem(key, JSON.stringify(state));
    return MAX_PIN_ATTEMPTS - state.attempts;
  } catch {
    return MAX_PIN_ATTEMPTS - 1;
  }
}

async function resetPinAttempts(phone: string, _role: WagRole): Promise<void> {
  const key = `wag_pin_lock_${phone}`;
  localStorage.removeItem(key);
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function maskPhone(phone: string): string {
  if (phone.length < 7) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-3);
}

async function callEdgeFunction<T>(name: string, payload: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const { data, error } = await (db as any).functions.invoke(name, { body: payload });
    if (error) return { error: error.message };
    return { data: data as T };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
