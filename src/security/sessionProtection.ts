// src/security/sessionProtection.ts
// WAG ENTERPRISES — Session Protection Module
// Idle timeout, session integrity, tab sync

import { getSession, clearSession } from '../lib/auth';
import { validateSessionIntegrity } from '../lib/security';
import { writeAuditLog } from '../lib/audit';

// ─────────────────────────────────────────
// IDLE TIMEOUT CONFIGURATION
// ─────────────────────────────────────────
const IDLE_TIMEOUT_MS: Record<string, number> = {
  customer:       30 * 60 * 1000,   // 30 minutes
  representative: 20 * 60 * 1000,   // 20 minutes
  admin:          15 * 60 * 1000,   // 15 minutes
};

const WARNING_BEFORE_MS = 2 * 60 * 1000;  // Warn 2 minutes before expiry

let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _warningTimer: ReturnType<typeof setTimeout> | null = null;
let _lastActivity = Date.now();
let _onExpire: (() => void) | null = null;
let _onWarn: ((secondsLeft: number) => void) | null = null;

// ─────────────────────────────────────────
// ACTIVITY TRACKING
// ─────────────────────────────────────────
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

function resetIdleTimer(): void {
  _lastActivity = Date.now();
  if (_idleTimer) clearTimeout(_idleTimer);
  if (_warningTimer) clearTimeout(_warningTimer);

  const session = getSession();
  if (!session) return;

  const timeout = IDLE_TIMEOUT_MS[session.role] ?? IDLE_TIMEOUT_MS.customer;

  _warningTimer = setTimeout(() => {
    const secondsLeft = Math.round(WARNING_BEFORE_MS / 1000);
    _onWarn?.(secondsLeft);
  }, timeout - WARNING_BEFORE_MS);

  _idleTimer = setTimeout(async () => {
    await expireSession('idle_timeout');
  }, timeout);
}

// ─────────────────────────────────────────
// SESSION LIFECYCLE
// ─────────────────────────────────────────
export function startSessionGuard(
  onExpire: () => void,
  onWarn?: (secondsLeft: number) => void
): void {
  _onExpire = onExpire;
  _onWarn = onWarn ?? null;

  ACTIVITY_EVENTS.forEach((event) => {
    window.addEventListener(event, resetIdleTimer, { passive: true });
  });

  resetIdleTimer();

  // Integrity check every 30 seconds
  setInterval(() => {
    if (!validateSessionIntegrity()) {
      expireSession('integrity_check_failed');
    }
  }, 30_000);

  // Tab visibility — reset timer when user returns to tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const session = getSession();
      if (!session) return;
      const timeout = IDLE_TIMEOUT_MS[session.role] ?? IDLE_TIMEOUT_MS.customer;
      const elapsed = Date.now() - _lastActivity;
      if (elapsed >= timeout) {
        expireSession('tab_inactive_too_long');
      } else {
        resetIdleTimer();
      }
    }
  });
}

export function stopSessionGuard(): void {
  ACTIVITY_EVENTS.forEach((event) => {
    window.removeEventListener(event, resetIdleTimer);
  });
  if (_idleTimer) clearTimeout(_idleTimer);
  if (_warningTimer) clearTimeout(_warningTimer);
  _onExpire = null;
  _onWarn = null;
}

async function expireSession(reason: string): Promise<void> {
  const session = getSession();
  if (session) {
    await writeAuditLog({
      action: 'logout',
      user_id: session.user_id,
      user_role: session.role,
      description: `Session expired — reason: ${reason}`,
    }).catch(() => {});
  }
  clearSession();
  stopSessionGuard();
  _onExpire?.();
}

// ─────────────────────────────────────────
// CROSS-TAB LOGOUT SYNC
// When user logs out in one tab, all tabs log out
// ─────────────────────────────────────────
const LOGOUT_CHANNEL_KEY = 'wag_logout_broadcast';

export function broadcastLogout(): void {
  localStorage.setItem(LOGOUT_CHANNEL_KEY, Date.now().toString());
  localStorage.removeItem(LOGOUT_CHANNEL_KEY);
}

export function listenForCrossTabLogout(callback: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === LOGOUT_CHANNEL_KEY) {
      clearSession();
      callback();
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// ─────────────────────────────────────────
// REMAINING SESSION TIME
// ─────────────────────────────────────────
export function getSessionTimeRemaining(): number {
  const session = getSession();
  if (!session) return 0;
  const timeout = IDLE_TIMEOUT_MS[session.role] ?? IDLE_TIMEOUT_MS.customer;
  const elapsed = Date.now() - _lastActivity;
  return Math.max(0, timeout - elapsed);
}
