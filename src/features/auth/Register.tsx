// src/features/auth/Register.tsx
// WAG ENTERPRISES — Customer Registration

import React, { useState } from 'react';
import { db } from '../../lib/supabase';
import { hashPin, normPhone } from '../../utils/helpers';
import { validatePhone, validatePin, sanitizeText } from '../../lib/security';
import { rateLimitRegister } from '../../security/rateLimit';
import { writeAuditLog } from '../../lib/audit';

interface RegisterProps {
  onSuccess: () => void;
  onBack: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  pin: string;
  confirm_pin: string;
}

export default function Register({ onSuccess, onBack }: RegisterProps) {
  const [form, setForm] = useState<FormState>({
    first_name: '', last_name: '', phone: '', email: '',
    address: '', pin: '', confirm_pin: '',
  });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  }

  function validate(): boolean {
    const e: Partial<FormState> = {};

    if (!form.first_name.trim()) e.first_name = 'First name is required.';
    if (!form.last_name.trim()) e.last_name = 'Last name is required.';

    const ph = validatePhone(form.phone);
    if (!ph.valid) e.phone = ph.error;

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address.';
    }

    const pinCheck = validatePin(form.pin);
    if (!pinCheck.valid) e.pin = pinCheck.error;

    if (form.pin !== form.confirm_pin) {
      e.confirm_pin = 'PINs do not match.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError('');

    if (!validate()) return;

    const ph = validatePhone(form.phone);
    const rl = rateLimitRegister(ph.normalised);
    if (!rl.allowed) { setGlobalError(rl.message); return; }

    setLoading(true);
    try {
      // Check duplicate phone
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('phone', ph.normalised)
        .limit(1);

      if (existing && existing.length > 0) {
        setErrors({ phone: 'This phone number is already registered.' });
        return;
      }

      const pinHash = await hashPin(form.pin);

      const { data: newCust, error } = await db
        .from('customers')
        .insert({
          first_name: sanitizeText(form.first_name),
          last_name:  sanitizeText(form.last_name),
          phone:      ph.normalised,
          email:      form.email.trim().toLowerCase() || '',
          address:    sanitizeText(form.address),
          pin_hash:   pinHash,
          is_active:  true,
          kyc_status: 'pending',
        } as any)
        .select('id, first_name, last_name')
        .single();

      if (error || !newCust) {
        setGlobalError(`Registration failed: ${error?.message ?? 'Unknown error'}`);
        return;
      }

      await writeAuditLog({
        action: 'plan_created',
        user_id: newCust.id,
        user_role: 'customer',
        description: `New customer registered: ${newCust.first_name} ${newCust.last_name}`,
      });

      onSuccess();
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '36px 32px',
        width: '100%', maxWidth: 440, boxShadow: '0 20px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>
            Create Account
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Join WAG Enterprises thrift platform
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.first_name ? '#dc2626' : '#e2e8f0' }}
                placeholder="Adaeze"
              />
              {errors.first_name && <span style={errStyle}>{errors.first_name}</span>}
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.last_name ? '#dc2626' : '#e2e8f0' }}
                placeholder="Okafor"
              />
              {errors.last_name && <span style={errStyle}>{errors.last_name}</span>}
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Phone Number *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              style={{ ...inputStyle, borderColor: errors.phone ? '#dc2626' : '#e2e8f0' }}
              placeholder="07012345678"
            />
            {errors.phone && <span style={errStyle}>{errors.phone}</span>}
          </div>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email (optional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              style={{ ...inputStyle, borderColor: errors.email ? '#dc2626' : '#e2e8f0' }}
              placeholder="adaeze@email.com"
            />
            {errors.email && <span style={errStyle}>{errors.email}</span>}
          </div>

          {/* Address */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Address (optional)</label>
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              style={inputStyle}
              placeholder="12 Eko Street, Lagos"
            />
          </div>

          {/* PIN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Create PIN *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={form.pin}
                  onChange={(e) => set('pin', e.target.value.replace(/\D/g,'').slice(0,8))}
                  style={{ ...inputStyle, paddingRight: 36, borderColor: errors.pin ? '#dc2626' : '#e2e8f0' }}
                  placeholder="4–8 digits"
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setShowPin(v=>!v)}
                  style={eyeBtn}>{showPin ? '🙈' : '👁️'}</button>
              </div>
              {errors.pin && <span style={errStyle}>{errors.pin}</span>}
            </div>
            <div>
              <label style={labelStyle}>Confirm PIN *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm_pin}
                  onChange={(e) => set('confirm_pin', e.target.value.replace(/\D/g,'').slice(0,8))}
                  style={{ ...inputStyle, paddingRight: 36, borderColor: errors.confirm_pin ? '#dc2626' : '#e2e8f0' }}
                  placeholder="Repeat PIN"
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setShowConfirm(v=>!v)}
                  style={eyeBtn}>{showConfirm ? '🙈' : '👁️'}</button>
              </div>
              {errors.confirm_pin && <span style={errStyle}>{errors.confirm_pin}</span>}
            </div>
          </div>

          {globalError && (
            <div style={{
              background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
              borderRadius: 8, fontSize: 13, marginBottom: 14, border: '1px solid #fecaca',
            }}>
              {globalError}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 14, background: loading ? '#94a3b8' : '#1a1a2e',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 15,
            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
          Already registered?{' '}
          <button onClick={onBack} style={{
            background: 'none', border: 'none', color: '#1a1a2e',
            fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
          }}>Sign in</button>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
};
const errStyle: React.CSSProperties = {
  fontSize: 11, color: '#dc2626', marginTop: 3, display: 'block',
};
const eyeBtn: React.CSSProperties = {
  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8',
};
