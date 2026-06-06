// src/lib/security.ts
// WAG ENTERPRISES — Security Library
// Rate limiting, session protection, security event logging

import { db } from './supabase';
import type { SecurityEventType, SecurityEvent } from '../types/audit';
// WagRole defined inline to avoid circular dependency with auth.ts
type WagRole = 'customer' | 'representative' | 'admin';

// ─────────────────────────────────────────
// SECURITY EVENT LOGGING
// ─────────────────────────────────────────
interface SecurityEventPayload {
  event_type: SecurityEventType;
  user_id?: string;
  user_role?: WagRole | string;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(payload: SecurityEventPayload): Promise<void> {
  try {
    await db.from('security_events').insert({
      event_type: payload.event_type,
      user_id: payload.user_id ?? null,
      user_role: payload.user_role ?? null,
      ip_address: null,   // Not available client-side; set by edge function if needed
      user_agent: navigator.userAgent,
      metadata: payload.metadata ?? {},
    });
  } catch (e) {
    // Security logging must never crash the app
    console.warn('[WAG Security] Failed to log event:', e);
  }
}

// ─────────────────────────────────────────
// CLIENT-SIDE RATE LIMITER
// In-memory bucket per action key
// Server-side DB rate limiter is the authoritative check
// ─────────────────────────────────────────
interface RateBucket {
  count: number;
  windowStart: number;
}

const rateBuckets = new Map<string, RateBucket>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  login:       { max: 5,  windowMs: 60_000 },       // 5 per minute
  register:    { max: 3,  windowMs: 300_000 },       // 3 per 5 minutes
  collection:  { max: 20, windowMs: 3_600_000 },     // 20 per hour
  disbursement_request: { max: 5, windowMs: 3_600_000 }, // 5 per hour
  forgot_pin:  { max: 3,  windowMs: 3_600_000 },     // 3 per hour
};

export function checkRateLimit(action: string, identifier: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const config = RATE_LIMITS[action];
  if (!config) return { allowed: true, remaining: 99, resetIn: 0 };

  const key = `${action}:${identifier}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.windowStart > config.windowMs) {
    // New window
    rateBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.max - 1, resetIn: config.windowMs };
  }

  if (bucket.count >= config.max) {
    const resetIn = config.windowMs - (now - bucket.windowStart);
    return { allowed: false, remaining: 0, resetIn };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: config.max - bucket.count,
    resetIn: config.windowMs - (now - bucket.windowStart),
  };
}

// ─────────────────────────────────────────
// CONTENT SECURITY
// Sanitise user-supplied strings before DB insert
// ─────────────────────────────────────────

/** Strip HTML tags and trim whitespace */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, (c) => ({
      '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;',
    }[c] ?? c))
    .trim();
}

/** Validate Nigerian phone number and normalise */
export function validatePhone(raw: string): {
  valid: boolean;
  normalised: string;
  error?: string;
} {
  const digits = raw.replace(/\D/g, '');
  let normalised = '';

  if (digits.length === 11 && digits[0] === '0') {
    normalised = '+234' + digits.slice(1);
  } else if (digits.length === 13 && digits.startsWith('234')) {
    normalised = '+' + digits;
  } else if (digits.length === 10) {
    normalised = '+234' + digits;
  } else {
    return { valid: false, normalised: '', error: 'Enter a valid 11-digit Nigerian phone number' };
  }

  return { valid: true, normalised };
}

/** Validate PIN complexity */
export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!pin) return { valid: false, error: 'PIN is required' };
  if (pin.length < 4) return { valid: false, error: 'PIN must be at least 4 digits' };
  if (pin.length > 8) return { valid: false, error: 'PIN must be at most 8 digits' };
  if (!/^\d+$/.test(pin)) return { valid: false, error: 'PIN must contain only numbers' };
  if (/^(.)\1+$/.test(pin)) return { valid: false, error: 'PIN cannot be all the same digit' };
  if (['1234','0000','1111','2222','3333','4444','5555','6666','7777','8888','9999'].includes(pin)) {
    return { valid: false, error: 'PIN is too simple. Choose a less predictable PIN.' };
  }
  return { valid: true };
}

/** Validate Nigerian monetary amount */
export function validateAmount(value: string | number): { valid: boolean; amount: number; error?: string } {
  const amount = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(amount)) return { valid: false, amount: 0, error: 'Invalid amount' };
  if (amount <= 0) return { valid: false, amount: 0, error: 'Amount must be greater than zero' };
  if (amount > 10_000_000) return { valid: false, amount: 0, error: 'Amount exceeds maximum allowed (₦10,000,000)' };
  if (!Number.isFinite(amount)) return { valid: false, amount: 0, error: 'Invalid amount' };
  return { valid: true, amount };
}

// ─────────────────────────────────────────
// CSRF PROTECTION
// Generate a nonce for form submissions
// ─────────────────────────────────────────
export function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────
// SESSION INTEGRITY
// Detect tampering or session fixation
// ─────────────────────────────────────────
export function validateSessionIntegrity(): boolean {
  try {
    const raw = sessionStorage.getItem('wag_session_v2');
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session.user_id || !session.role || !session.profile) return false;
    if (!['customer','representative','admin'].includes(session.role)) return false;
    if (!session.pin_verified) return false;
    return true;
  } catch {
    return false;
  }
}
