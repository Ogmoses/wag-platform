// src/features/auth/Login.tsx
// WAG ENTERPRISES — Login Page
// Supports customer (phone+PIN), representative (agentID+PIN), admin (PIN)
// Preserves original WAG branding and UI flow

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { loginCustomer, loginRepresentative, loginAdmin } from '../../lib/auth';
import { rateLimitLogin } from '../../security/rateLimit';
import { checkLockout, recordFailedAttempt, clearLockout, getLockoutMessage }
  from '../../security/lockoutProtection';
import { normPhone, fmtPhone } from '../../utils/helpers';

type LoginTab = 'customer' | 'representative' | 'admin';

interface LoginProps {
  onSuccess?: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const { signIn } = useAuth();
  const [tab, setTab] = useState<LoginTab>('customer');
  const [phone, setPhone] = useState('');
  const [repId, setRepId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  const identifier = tab === 'customer'
    ? normPhone(phone)
    : tab === 'representative' ? repId : 'admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Rate limit check
    const rl = rateLimitLogin(identifier);
    if (!rl.allowed) { setError(rl.message); return; }

    // Lockout check
    const lockout = checkLockout(tab, identifier);
    if (lockout.locked) { setError(getLockoutMessage(lockout)); return; }

    setLoading(true);
    try {
      let result;
      if (tab === 'customer') {
        if (!phone.trim()) { setError('Enter your phone number.'); return; }
        if (!pin.trim()) { setError('Enter your PIN.'); return; }
        result = await loginCustomer(normPhone(phone), pin);
      } else if (tab === 'representative') {
        if (!repId.trim()) { setError('Enter your Agent ID.'); return; }
        if (!pin.trim()) { setError('Enter your PIN.'); return; }
        result = await loginRepresentative(repId.trim(), pin);
      } else {
        if (!pin.trim()) { setError('Enter the admin PIN.'); return; }
        result = await loginAdmin(pin);
      }

      if (!result.success || !result.session) {
        recordFailedAttempt(tab, identifier);
        const lockoutMsg = getLockoutMessage(checkLockout(tab, identifier));
        setError(result.error || 'Login failed.' + (lockoutMsg ? ' ' + lockoutMsg : ''));
        return;
      }

      clearLockout(tab, identifier);
      signIn(result.session);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setPin('');
    }
  }

  const tabConfig = {
    customer:       { label: 'Customer',       icon: '👤', placeholder: '07012345678' },
    representative: { label: 'Representative', icon: '🧑‍💼', placeholder: 'Agent ID' },
    admin:          { label: 'Admin',          icon: '⚙️',  placeholder: '' },
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '40px 36px',
        width: '100%', maxWidth: 420, boxShadow: '0 20px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: 'linear-gradient(135deg,#1a1a2e,#4a4a8a)',
            borderRadius: 14, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 800,
            marginBottom: 10,
          }}>W</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>WAG Enterprises</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            Thrift Collection Platform
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 24,
        }}>
          {(Object.keys(tabConfig) as LoginTab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setPin(''); }}
              style={{
                padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontWeight: 600, fontSize: 12, transition: 'all 0.2s',
                background: tab === t ? '#1a1a2e' : 'transparent',
                color: tab === t ? '#fff' : '#64748b',
              }}
            >
              {tabConfig[t].icon} {tabConfig[t].label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Phone (customer) */}
          {tab === 'customer' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={tabConfig.customer.placeholder}
                style={inputStyle}
                autoComplete="tel"
                maxLength={14}
              />
            </div>
          )}

          {/* Agent ID (rep) */}
          {tab === 'representative' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Agent ID
              </label>
              <input
                type="text"
                value={repId}
                onChange={(e) => setRepId(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit Agent ID"
                style={inputStyle}
                maxLength={6}
                autoComplete="username"
              />
            </div>
          )}

          {/* PIN */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {tab === 'admin' ? 'Admin PIN' : 'PIN'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Enter PIN"
                style={{ ...inputStyle, paddingRight: 44 }}
                autoComplete="current-password"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                  color: '#94a3b8',
                }}
              >
                {showPin ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
              borderRadius: 8, fontSize: 13, marginBottom: 16,
              border: '1px solid #fecaca',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 14, background: loading ? '#94a3b8' : '#1a1a2e',
              color: '#fff', border: 'none', borderRadius: 10, fontSize: 15,
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Register link — customer only */}
        {tab === 'customer' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
            New customer?{' '}
            <button
              onClick={() => {
                // Switch to register view — handled by parent App
                window.dispatchEvent(new CustomEvent('wag:show-register'));
              }}
              style={{
                background: 'none', border: 'none', color: '#1a1a2e',
                fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Create account
            </button>
          </p>
        )}

        {tab === 'representative' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
            New representative?{' '}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('wag:show-rep-register'))}
              style={{
                background: 'none', border: 'none', color: '#1a1a2e',
                fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Register with activation token
            </button>
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box',
  background: '#f8fafc', color: '#1a1a2e',
};
