// src/features/auth/RepresentativeRegister.tsx
// WAG ENTERPRISES — Representative Registration
// Requires a valid activation token issued by admin

import React, { useState } from 'react';
import { db } from '../../lib/supabase';
import { hashPin, genRepId } from '../../utils/helpers';
import { sanitizeText, validatePhone, validatePin, logSecurityEvent } from '../../lib/security';
import { writeAuditLog } from '../../lib/audit';

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

interface FormState {
  first_name: string; last_name: string;
  phone: string; email: string;
  pin: string; confirm_pin: string;
  activation_token: string;
}

export default function RepresentativeRegister({ onSuccess, onBack }: Props) {
  const [form, setForm] = useState<FormState>({
    first_name: '', last_name: '', phone: '', email: '',
    pin: '', confirm_pin: '', activation_token: '',
  });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [showPin, setShowPin] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  }

  function validate(): boolean {
    const e: Partial<FormState> = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim()) e.last_name = 'Required';
    const ph = validatePhone(form.phone);
    if (!ph.valid) e.phone = ph.error;
    const pinCheck = validatePin(form.pin);
    if (!pinCheck.valid) e.pin = pinCheck.error;
    if (form.pin !== form.confirm_pin) e.confirm_pin = 'PINs do not match.';
    if (!form.activation_token.trim()) e.activation_token = 'Activation token is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError('');
    if (!validate()) return;
    setLoading(true);

    try {
      const ph = validatePhone(form.phone);

      // 1. Validate activation token
      const tokenValue = form.activation_token.trim().toUpperCase();
      const { data: token, error: tokenErr } = await db
        .from('activation_tokens')
        .select('id, used, expires_at')
        .eq('token', tokenValue)
        .single();

      if (tokenErr || !token) {
        setErrors({ activation_token: 'Invalid activation token.' });
        return;
      }
      if (token.used) {
        setErrors({ activation_token: 'This token has already been used.' });
        return;
      }
      if (new Date(token.expires_at) < new Date()) {
        setErrors({ activation_token: 'This token has expired. Request a new one from admin.' });
        return;
      }

      // 2. Check duplicate phone
      const { data: existingRep } = await db
        .from('representatives')
        .select('id')
        .eq('phone', ph.normalised)
        .limit(1);
      if (existingRep && existingRep.length > 0) {
        setErrors({ phone: 'A representative with this phone is already registered.' });
        return;
      }

      // 3. Generate unique rep_id
      let repIdValue = genRepId();
      let attempts = 0;
      while (attempts < 10) {
        const { data: exists } = await db
          .from('representatives')
          .select('id')
          .eq('rep_id', repIdValue)
          .limit(1);
        if (!exists || exists.length === 0) break;
        repIdValue = genRepId();
        attempts++;
      }

      // 4. Hash PIN
      const pinHash = await hashPin(form.pin);

      // 5. Insert representative
      const { data: newRep, error: insertErr } = await db
        .from('representatives')
        .insert({
          first_name:      sanitizeText(form.first_name),
          last_name:       sanitizeText(form.last_name),
          phone:           ph.normalised,
          email:           form.email.trim().toLowerCase(),
          pin_hash:        pinHash,
          rep_id:          repIdValue,
          confirmed_count: 0,
          is_active:       true,
        } as any)
        .select('id, first_name, last_name, rep_id')
        .single();

      if (insertErr || !newRep) {
        setGlobalError(`Registration failed: ${insertErr?.message ?? 'Unknown error'}`);
        return;
      }

      // 6. Mark token used
      await db
        .from('activation_tokens')
        .update({ used: true, used_by: newRep.id, used_at: new Date().toISOString() })
        .eq('id', token.id);

      await writeAuditLog({
        action: 'token_used',
        user_id: newRep.id,
        user_role: 'representative',
        description: `New representative registered: ${newRep.first_name} ${newRep.last_name} — Agent ID: ${newRep.rep_id}`,
      });

      await logSecurityEvent({
        event_type: 'token_used',
        user_id: newRep.id,
        user_role: 'representative',
        metadata: { token: tokenValue, rep_id: newRep.rep_id },
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
      minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '36px 32px',
        width: '100%', maxWidth: 440, boxShadow: '0 20px 80px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>
            Representative Registration
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            An activation token from admin is required
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>First Name *</label>
              <input value={form.first_name} onChange={e=>set('first_name',e.target.value)}
                style={{ ...inp, borderColor: errors.first_name ? '#dc2626' : '#e2e8f0' }} placeholder="Emeka" />
              {errors.first_name && <span style={err}>{errors.first_name}</span>}
            </div>
            <div>
              <label style={lbl}>Last Name *</label>
              <input value={form.last_name} onChange={e=>set('last_name',e.target.value)}
                style={{ ...inp, borderColor: errors.last_name ? '#dc2626' : '#e2e8f0' }} placeholder="Eze" />
              {errors.last_name && <span style={err}>{errors.last_name}</span>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Phone *</label>
            <input type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)}
              style={{ ...inp, borderColor: errors.phone ? '#dc2626' : '#e2e8f0' }} placeholder="07012345678" />
            {errors.phone && <span style={err}>{errors.phone}</span>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Email (optional)</label>
            <input type="email" value={form.email} onChange={e=>set('email',e.target.value)}
              style={inp} placeholder="emeka@email.com" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Create PIN *</label>
              <div style={{ position: 'relative' }}>
                <input type={showPin ? 'text' : 'password'} value={form.pin}
                  onChange={e=>set('pin',e.target.value.replace(/\D/g,'').slice(0,8))}
                  style={{ ...inp, paddingRight: 36, borderColor: errors.pin ? '#dc2626' : '#e2e8f0' }}
                  placeholder="4–8 digits" inputMode="numeric" />
                <button type="button" onClick={()=>setShowPin(v=>!v)} style={eye}>{showPin?'🙈':'👁️'}</button>
              </div>
              {errors.pin && <span style={err}>{errors.pin}</span>}
            </div>
            <div>
              <label style={lbl}>Confirm PIN *</label>
              <input type="password" value={form.confirm_pin}
                onChange={e=>set('confirm_pin',e.target.value.replace(/\D/g,'').slice(0,8))}
                style={{ ...inp, borderColor: errors.confirm_pin ? '#dc2626' : '#e2e8f0' }}
                placeholder="Repeat PIN" inputMode="numeric" />
              {errors.confirm_pin && <span style={err}>{errors.confirm_pin}</span>}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Activation Token *</label>
            <input value={form.activation_token}
              onChange={e=>set('activation_token',e.target.value.toUpperCase())}
              style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2, borderColor: errors.activation_token ? '#dc2626' : '#e2e8f0' }}
              placeholder="WAGE-XXXXXXXX" />
            {errors.activation_token && <span style={err}>{errors.activation_token}</span>}
          </div>

          {globalError && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, border: '1px solid #fecaca' }}>
              {globalError}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 14, background: loading ? '#94a3b8' : '#1a1a2e',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Registering…' : 'Register'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
          Already registered?{' '}
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a1a2e', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' };
const err: React.CSSProperties = { fontSize: 11, color: '#dc2626', marginTop: 3, display: 'block' };
const eye: React.CSSProperties = { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8' };
