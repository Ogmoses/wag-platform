// src/features/auth/AuthProvider.tsx
// WAG ENTERPRISES — Auth Context Provider
// Provides session state to the entire component tree

import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef
} from 'react';
import {
  getSession, setSession, clearSession, logout,
  type WagSession, type WagRole
} from '../../lib/auth';
import {
  startSessionGuard, stopSessionGuard,
  broadcastLogout, listenForCrossTabLogout
} from '../../security/sessionProtection';
import type { CustomerSession } from '../../types/customer';
import type { RepresentativeSession } from '../../types/representative';

// ─────────────────────────────────────────
// CONTEXT SHAPE
// ─────────────────────────────────────────
export interface AuthContextValue {
  session: WagSession | null;
  role: WagRole | null;
  isAuthenticated: boolean;
  isCustomer: boolean;
  isRepresentative: boolean;
  isAdmin: boolean;
  customerProfile: CustomerSession | null;
  repProfile: RepresentativeSession | null;
  loading: boolean;
  idleWarning: boolean;
  idleSecondsLeft: number;
  signIn: (session: WagSession) => void;
  signOut: () => Promise<void>;
  refreshSession: () => void;
  dismissIdleWarning: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<WagSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(120);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start session idle guard (defined first so useEffect can reference it)
  const startIdleGuard = useCallback((s: WagSession) => {
    startSessionGuard(
      // onExpire
      () => {
        clearSession();
        setSessionState(null);
        setIdleWarning(false);
        stopCountdown();
      },
      // onWarn
      (secondsLeft) => {
        setIdleSecondsLeft(secondsLeft);
        setIdleWarning(true);
        startCountdown(secondsLeft);
      }
    );
  }, []);

  // ── Bootstrap: read session from storage on mount
  useEffect(() => {
    const stored = getSession();
    if (stored) {
      setSessionState(stored);
      startIdleGuard(stored);
    }
    setLoading(false);

    const unlisten = listenForCrossTabLogout(() => {
      setSessionState(null);
      setIdleWarning(false);
      stopSessionGuard();
    });

    return () => {
      unlisten();
      stopSessionGuard();
    };
  }, [startIdleGuard]);

  function startCountdown(seconds: number) {
    stopCountdown();
    let remaining = seconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setIdleSecondsLeft(remaining);
      if (remaining <= 0) stopCountdown();
    }, 1000);
  }

  function stopCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  // ── Sign in: store session and start guard
  const signIn = useCallback((newSession: WagSession) => {
    setSession(newSession);
    setSessionState(newSession);
    setIdleWarning(false);
    stopCountdown();
    startIdleGuard(newSession);
  }, [startIdleGuard]);

  // ── Sign out: clear everything
  const signOut = useCallback(async () => {
    await logout();
    broadcastLogout();
    stopSessionGuard();
    stopCountdown();
    setSessionState(null);
    setIdleWarning(false);
  }, []);

  // ── Refresh from storage (e.g. after profile update)
  const refreshSession = useCallback(() => {
    const stored = getSession();
    if (stored) setSessionState(stored);
  }, []);

  // ── Dismiss idle warning (user clicked "Stay Signed In")
  const dismissIdleWarning = useCallback(() => {
    setIdleWarning(false);
    stopCountdown();
    // Touch activity to reset idle timer
    window.dispatchEvent(new MouseEvent('mousemove'));
  }, []);

  // ── Derived values
  const role = session?.role ?? null;
  const isAuthenticated = session !== null;
  const isCustomer = role === 'customer';
  const isRepresentative = role === 'representative';
  const isAdmin = role === 'admin';

  const customerProfile = isCustomer
    ? (session!.profile as CustomerSession)
    : null;

  const repProfile = isRepresentative
    ? (session!.profile as RepresentativeSession)
    : null;

  const value: AuthContextValue = {
    session,
    role,
    isAuthenticated,
    isCustomer,
    isRepresentative,
    isAdmin,
    customerProfile,
    repProfile,
    loading,
    idleWarning,
    idleSecondsLeft,
    signIn,
    signOut,
    refreshSession,
    dismissIdleWarning,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {idleWarning && <IdleWarningModal
        secondsLeft={idleSecondsLeft}
        onStay={dismissIdleWarning}
        onLeave={signOut}
      />}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────
// IDLE WARNING MODAL
// ─────────────────────────────────────────
function IdleWarningModal({
  secondsLeft,
  onStay,
  onLeave,
}: {
  secondsLeft: number;
  onStay: () => void;
  onLeave: () => Promise<void>;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360,
        width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⏳</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
          Session Expiring Soon
        </h3>
        <p style={{ color: '#64748b', marginBottom: 24 }}>
          You'll be signed out in{' '}
          <strong style={{ color: '#dc2626' }}>{secondsLeft}s</strong>{' '}
          due to inactivity.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onStay}
            style={{
              flex: 1, padding: '12px 0', background: '#1a1a2e', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Stay Signed In
          </button>
          <button
            onClick={onLeave}
            style={{
              flex: 1, padding: '12px 0', background: '#f1f5f9', color: '#475569',
              border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
