// src/App.tsx
// WAG ENTERPRISES — Root Application
// Routes between auth, customer, representative, and admin views
// Preserves original single-page app structure

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import RepresentativeRegister from './features/auth/RepresentativeRegister';
import CustomerDashboard from './features/customer/CustomerDashboard';
import RepresentativeDashboard from './features/representative/RepresentativeDashboard';
import AdminDashboard from './features/admin/AdminDashboard';
import { isConfigured } from './lib/supabase';

// ─────────────────────────────────────────
// VIEW TYPES
// ─────────────────────────────────────────
type AuthView = 'login' | 'register' | 'rep-register' | 'success';

// ─────────────────────────────────────────
// INNER APP — has access to AuthContext
// ─────────────────────────────────────────
function InnerApp() {
  const { isAuthenticated, isCustomer, isRepresentative, isAdmin, loading } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // Listen for custom navigation events from child components
  useEffect(() => {
    const handleShowRegister    = () => setAuthView('register');
    const handleShowRepRegister = () => setAuthView('rep-register');
    window.addEventListener('wag:show-register',     handleShowRegister);
    window.addEventListener('wag:show-rep-register', handleShowRepRegister);
    return () => {
      window.removeEventListener('wag:show-register',     handleShowRegister);
      window.removeEventListener('wag:show-rep-register', handleShowRepRegister);
    };
  }, []);

  // ── Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#1a1a2e',
      }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{
            width: 56, height: 56, border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ fontWeight: 500, opacity: 0.8 }}>Loading WAG Platform…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Authenticated routing
  if (isAuthenticated) {
    if (isCustomer)       return <CustomerDashboard />;
    if (isRepresentative) return <RepresentativeDashboard />;
    if (isAdmin)          return <AdminDashboard />;
    // Fallback — should not happen
    return <Login />;
  }

  // ── Registration success
  if (registerSuccess) {
    return (
      <div style={{
        minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 20, padding: 40, maxWidth: 380,
          width: '100%', textAlign: 'center', boxShadow: '0 20px 80px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>
            Account Created!
          </h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>
            Your account has been created successfully. Sign in to access your dashboard.
          </p>
          <button
            onClick={() => { setRegisterSuccess(false); setAuthView('login'); }}
            style={{
              width: '100%', padding: 14, background: '#1a1a2e', color: '#fff',
              border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 15,
            }}
          >
            Sign In Now
          </button>
        </div>
      </div>
    );
  }

  // ── Auth views
  if (authView === 'register') {
    return (
      <Register
        onSuccess={() => setRegisterSuccess(true)}
        onBack={() => setAuthView('login')}
      />
    );
  }

  if (authView === 'rep-register') {
    return (
      <RepresentativeRegister
        onSuccess={() => setRegisterSuccess(true)}
        onBack={() => setAuthView('login')}
      />
    );
  }

  return <Login />;
}

// ─────────────────────────────────────────
// CONFIGURATION WARNING
// Shown when Supabase credentials are not set
// ─────────────────────────────────────────
function ConfigWarning() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: '#dc2626', color: '#fff', padding: '10px 20px',
      fontSize: 13, textAlign: 'center', fontWeight: 600,
    }}>
      ⚠️ Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON in your environment.
    </div>
  );
}

// ─────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      {!isConfigured() && <ConfigWarning />}
      <InnerApp />
    </AuthProvider>
  );
}
