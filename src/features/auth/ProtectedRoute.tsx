// src/features/auth/ProtectedRoute.tsx
// WAG ENTERPRISES — Protected Route Component

import React from 'react';
import { useAuth } from './AuthProvider';
import type { WagRole } from '../../lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: WagRole[];
  fallback?: React.ReactNode;
  redirectTo?: string;
  onUnauthorized?: () => void;
}

/**
 * Wraps any component tree and only renders it when the user
 * is authenticated (and optionally has a required role).
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  fallback,
  onUnauthorized,
}: ProtectedRouteProps) {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#f8fafc',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, border: '4px solid #e2e8f0',
            borderTopColor: '#1a1a2e', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ color: '#64748b', fontWeight: 500 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    onUnauthorized?.();
    return fallback ? <>{fallback}</> : <UnauthorizedScreen reason="not_authenticated" />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    onUnauthorized?.();
    return fallback ? <>{fallback}</> : <UnauthorizedScreen reason="wrong_role" role={role} />;
  }

  return <>{children}</>;
}

// ─────────────────────────────────────────
// ROLE GUARD
// Renders children only if user has a specific role.
// Used for conditional UI elements (not whole pages).
// ─────────────────────────────────────────
interface RoleGuardProps {
  roles: WagRole | WagRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const { role } = useAuth();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!role || !allowed.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

// ─────────────────────────────────────────
// UNAUTHORIZED SCREEN (inline, not a redirect)
// ─────────────────────────────────────────
function UnauthorizedScreen({
  reason,
  role,
}: {
  reason: 'not_authenticated' | 'wrong_role';
  role?: string | null;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#f8fafc', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 40, maxWidth: 400,
        textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <h2 style={{ margin: '0 0 8px', color: '#1a1a2e', fontSize: 22, fontWeight: 700 }}>
          {reason === 'not_authenticated' ? 'Sign In Required' : 'Access Denied'}
        </h2>
        <p style={{ color: '#64748b', lineHeight: 1.6 }}>
          {reason === 'not_authenticated'
            ? 'Please sign in to access this page.'
            : `Your current role (${role}) does not have permission to view this page.`}
        </p>
      </div>
    </div>
  );
}
