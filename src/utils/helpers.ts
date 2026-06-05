// src/utils/helpers.ts
// WAG ENTERPRISES — Shared Utility Functions
// Preserved from original app for UI compatibility

// ─────────────────────────────────────────
// FORMATTING
// ─────────────────────────────────────────

/** Format number as Nigerian Naira */
export const fmt = (n: number | string): string =>
  '₦' + (+(n ?? 0)).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format ISO date string to 'DD Mon YYYY' */
export const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Format ISO date string to 'HH:MM' */
export const fmtTime = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—';

/** Format phone from +234 to 0XXXXXXXXXX */
export const fmtPhone = (phone: string): string =>
  (phone ?? '').replace(/^\+234/, '0');

// ─────────────────────────────────────────
// PHONE NORMALISATION
// ─────────────────────────────────────────

/** Convert any Nigerian phone format to +234XXXXXXXXXX */
export function normPhone(raw: string): string {
  const n = (raw ?? '').replace(/\D/g, '');
  if (n.length === 11 && n[0] === '0') return '+234' + n.slice(1);
  if (n.length === 13 && n.startsWith('234')) return '+' + n;
  if (n.length === 10) return '+234' + n;
  return '+234' + n;
}

// ─────────────────────────────────────────
// REFERENCE GENERATION
// ─────────────────────────────────────────

/** Generate a unique transaction reference WAG-TX-XXXXX */
export function genRef(): string {
  return 'WAG-TX-' + Math.floor(10000 + Math.random() * 90000);
}

/** Generate a 6-digit representative ID */
export function genRepId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Generate an activation token WAGE-XXXXXXXX */
export function genToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'WAGE-';
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// ─────────────────────────────────────────
// PIN HASHING
// Uses Web Crypto SHA-256 (client-safe)
// bcrypt happens server-side in edge functions
// ─────────────────────────────────────────

/** SHA-256 hash a PIN — used for client-side PIN lookup */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────
export function getInitial(name: string): string {
  return (name ?? '').charAt(0).toUpperCase() || '?';
}

// ─────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────
export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function isExpired(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}
