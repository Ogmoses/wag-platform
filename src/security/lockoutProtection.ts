// src/security/lockoutProtection.ts
// WAG ENTERPRISES — Lockout Protection Module
// Client-side lockout tracking with localStorage persistence

export interface LockoutConfig {
  maxAttempts: number;
  lockoutDurationMs: number;
  namespace: string;
}

export interface LockoutState {
  attempts: number;
  lockedAt: number | null;
  lockedUntil: number | null;
}

export interface LockoutCheckResult {
  locked: boolean;
  attemptsUsed: number;
  attemptsRemaining: number;
  lockedUntil: number | null;
  minutesRemaining: number | null;
}

// ─────────────────────────────────────────
// DEFAULT CONFIGS PER ACTOR TYPE
// ─────────────────────────────────────────
export const LOCKOUT_CONFIGS: Record<string, LockoutConfig> = {
  customer:       { maxAttempts: 5, lockoutDurationMs: 30 * 60 * 1000, namespace: 'cust' },
  representative: { maxAttempts: 5, lockoutDurationMs: 30 * 60 * 1000, namespace: 'rep' },
  admin:          { maxAttempts: 3, lockoutDurationMs: 60 * 60 * 1000, namespace: 'admin' },
};

// ─────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────
function storageKey(config: LockoutConfig, identifier: string): string {
  return `wag_lockout_${config.namespace}_${identifier}`;
}

function readState(key: string): LockoutState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { attempts: 0, lockedAt: null, lockedUntil: null };
    return JSON.parse(raw) as LockoutState;
  } catch {
    return { attempts: 0, lockedAt: null, lockedUntil: null };
  }
}

function writeState(key: string, state: LockoutState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

// ─────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────

/** Check whether an identifier is currently locked out */
export function checkLockout(
  role: string,
  identifier: string
): LockoutCheckResult {
  const config = LOCKOUT_CONFIGS[role] ?? LOCKOUT_CONFIGS.customer;
  const key = storageKey(config, identifier);
  const state = readState(key);
  const now = Date.now();

  // If locked — check if lockout has expired
  if (state.lockedAt !== null && state.lockedUntil !== null) {
    if (now < state.lockedUntil) {
      const msRemaining = state.lockedUntil - now;
      return {
        locked: true,
        attemptsUsed: state.attempts,
        attemptsRemaining: 0,
        lockedUntil: state.lockedUntil,
        minutesRemaining: Math.ceil(msRemaining / 60_000),
      };
    }
    // Lockout expired — auto-reset
    clearLockout(role, identifier);
    return {
      locked: false,
      attemptsUsed: 0,
      attemptsRemaining: config.maxAttempts,
      lockedUntil: null,
      minutesRemaining: null,
    };
  }

  return {
    locked: false,
    attemptsUsed: state.attempts,
    attemptsRemaining: Math.max(0, config.maxAttempts - state.attempts),
    lockedUntil: null,
    minutesRemaining: null,
  };
}

/** Record a failed attempt. Returns updated lockout result. */
export function recordFailedAttempt(
  role: string,
  identifier: string
): LockoutCheckResult {
  const config = LOCKOUT_CONFIGS[role] ?? LOCKOUT_CONFIGS.customer;
  const key = storageKey(config, identifier);
  const state = readState(key);
  const now = Date.now();

  state.attempts += 1;

  if (state.attempts >= config.maxAttempts) {
    state.lockedAt = now;
    state.lockedUntil = now + config.lockoutDurationMs;
  }

  writeState(key, state);

  return checkLockout(role, identifier);
}

/** Reset lockout state after a successful login */
export function clearLockout(role: string, identifier: string): void {
  const config = LOCKOUT_CONFIGS[role] ?? LOCKOUT_CONFIGS.customer;
  const key = storageKey(config, identifier);
  localStorage.removeItem(key);
}

/** Force-unlock (admin action via admin panel) — clears by namespace */
export function adminUnlock(role: string, identifier: string): void {
  clearLockout(role, identifier);
}

/** Get a human-readable lockout message */
export function getLockoutMessage(result: LockoutCheckResult): string {
  if (!result.locked) {
    if (result.attemptsRemaining <= 2) {
      return `${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining before lockout.`;
    }
    return '';
  }
  return `Too many failed attempts. Account locked for ${result.minutesRemaining} minute${result.minutesRemaining === 1 ? '' : 's'}.`;
}
