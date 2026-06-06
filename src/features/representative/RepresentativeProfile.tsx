// src/features/representative/RepresentativeProfile.tsx
// WAG ENTERPRISES — Representative Profile

import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { changeRepPin } from '../../security/pinVerification';
import { fmtPhone, fmtDate } from '../../utils/helpers';

export default function RepresentativeProfile() {
  const { repProfile } = useAuth();
  const rep = repProfile!;

  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' });
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (pinForm.next !== pinForm.confirm) { setPinError('New PINs do not match.'); return; }
    if (pinForm.next.length < 4) { setPinError('PIN must be at least 4 digits.'); return; }
    if (pinForm.next === pinForm.current) { setPinError('New PIN must differ from current.'); return; }

    setPinLoading(true);
    try {
      const result = await changeRepPin(rep.id, pinForm.current, pinForm.next);
      if (!result.valid) { setPinError(result.error ?? 'PIN change failed.'); return; }
      setPinSuccess('PIN changed successfully.');
      setPinForm({ current: '', next: '', confirm: '' });
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'PIN change failed.');
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>My Profile</h2>

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, background: '#1a1a2e', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: '#fff',
          }}>
            {rep.first_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>
              {rep.first_name} {rep.last_name}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Agent ID: {rep.rep_id}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <Row label="Phone" value={fmtPhone(rep.phone)} />
          <Row label="Email" value={rep.email || '—'} />
          <Row label="Total Collections" value={String(rep.confirmed_count ?? 0)} />
          <Row label="Member since" value={fmtDate((rep as any).created_at ?? '')} />
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Change PIN</h3>
        <form onSubmit={changePin}>
          {(['current','next','confirm'] as const).map((field) => (
            <div key={field} style={{ marginBottom: 12 }}>
              <label style={lbl}>
                {field === 'current' ? 'Current PIN' : field === 'next' ? 'New PIN' : 'Confirm New PIN'}
              </label>
              <input
                type="password"
                value={pinForm[field]}
                onChange={e => setPinForm(f => ({ ...f, [field]: e.target.value.replace(/\D/g,'').slice(0,8) }))}
                style={inp}
                inputMode="numeric"
                placeholder="••••"
              />
            </div>
          ))}
          {pinError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{pinError}</div>}
          {pinSuccess && <div style={{ color: '#059669', fontSize: 13, marginBottom: 10 }}>{pinSuccess}</div>}
          <button type="submit" disabled={pinLoading} style={solidBtn}>
            {pinLoading ? 'Updating…' : 'Change PIN'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{value}</span>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
};
const solidBtn: React.CSSProperties = {
  padding: '10px 20px', background: '#1a1a2e', color: '#fff',
  border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
};
