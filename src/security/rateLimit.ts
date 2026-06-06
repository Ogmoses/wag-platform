// src/security/rateLimit.ts
// WAG ENTERPRISES — Rate Limit Module

import { checkRateLimit } from '../lib/security';

// ─────────────────────────────────────────
// ACTION-SPECIFIC RATE LIMIT WRAPPERS
// ─────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  message: string;
}

function toResult(
  raw: { allowed: boolean; remaining: number; resetIn: number }
): RateLimitResult {
  return {
    allowed: raw.allowed,
    remaining: raw.remaining,
    resetInSeconds: Math.ceil(raw.resetIn / 1000),
    message: raw.allowed
      ? ''
      : `Too many attempts. Please wait ${Math.ceil(raw.resetIn / 60_000)} minute(s).`,
  };
}

/** Rate-limit login attempts by phone/repId */
export function rateLimitLogin(identifier: string): RateLimitResult {
  return toResult(checkRateLimit('login', identifier));
}

/** Rate-limit registration by IP-like fingerprint */
export function rateLimitRegister(identifier: string): RateLimitResult {
  return toResult(checkRateLimit('register', identifier));
}

/** Rate-limit collection recording by rep ID */
export function rateLimitCollection(repId: string): RateLimitResult {
  return toResult(checkRateLimit('collection', repId));
}

/** Rate-limit disbursement requests by customer ID */
export function rateLimitDisbursementRequest(customerId: string): RateLimitResult {
  return toResult(checkRateLimit('disbursement_request', customerId));
}

/** Rate-limit forgot PIN requests */
export function rateLimitForgotPin(identifier: string): RateLimitResult {
  return toResult(checkRateLimit('forgot_pin', identifier));
}

// ─────────────────────────────────────────
// COMPOSE GUARD
// Wrap any async function with rate-limit enforcement
// ─────────────────────────────────────────
export function withRateLimit<T>(
  action: string,
  identifier: string,
  fn: () => Promise<T>
): Promise<T> {
  const check = checkRateLimit(action, identifier);
  if (!check.allowed) {
    const wait = Math.ceil(check.resetIn / 60_000);
    return Promise.reject(
      new Error(`Rate limit exceeded. Please wait ${wait} minute(s) before trying again.`)
    );
  }
  return fn();
}
