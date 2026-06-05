// src/features/admin/RepresentativeManagement.tsx
// WAG ENTERPRISES — Admin Representative Management + Activation Token Generation

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { fmt, fmtDate, fmtPhone, genToken } from '../../utils/helpers';
import { writeAuditLog } from '../../lib/audit';
import { logSecurityEvent } from '../../lib/security';
import type { RepresentativePublic } from '../../types/representative';

interface Props { onRefresh: () => void; }

export default function RepresentativeManagement({ onRefresh }: Props) {
  const [reps, setReps] = useState<RepresentativePublic[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RepresentativePublic | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [showTokens, setShowTokens] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repData, tokenData] = await Promise.all([
        db.from('representatives')
          .select('id, first_name, last_name, email, phone, rep_id, confirmed_count, is_active, territory, created_at')
          .order('created_at', { ascending: false }),
        db.from('activation_tokens')
          .select('*')
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .order('generated_at', { ascending: false }),
      ]);
      setReps((repData.data ?? []) as RepresentativePublic[]);
      setTokens(tokenData.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = reps.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.first_name.toLowerCase().includes(q) || r.last_name.toLowerCase().includes(q)
      || r.rep_id.includes(q) || r.phone.includes(q);
  });

  async function toggleActive(rep: RepresentativePublic) {
    setActionLoading(true);
    setActionMsg('');
    try {
      const newState = !rep.is_active;
      await db.from('representatives').update({ is_active: newState }).eq('id', rep.id);
      await writeAuditLog({
        action: newState ? 'account_unlocked' : 'account_locked',
        user_id: 'admin',
        user_role: 'admin',
        description: `Rep ${newState ? 'activated' : 'deactivated'}: ${rep.first_name} ${rep.last_name} (${rep.rep_id})`,
      });
      setActionMsg(`Representative ${newState ? 'activated' : 'deactivated'}.`);
      setSelected(null);
      load();
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  async function generateToken() {
    setActionLoading(true);
    try {
      const token = genToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db.from('activation_tokens').insert({
        token,
        generated_by: 'admin',
        expires_at: expiresAt,
      });

      await writeAuditLog({
        action: 'token_generated',
        user_id: 'admin',
        user_role: 'admin',
        description: `Activation token generated: ${token}`,
      });

      await logSecurityEvent({
        event_type: 'token_generated',
        user_id: 'admin',
        user_role: 'admin',
        metadata: { token },
      });

      setNewToken(token);
      load();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Token generation failed.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
          Representatives ({filtered.length})
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowTokens(true)} style={outBtn}>
            🔑 Tokens ({tokens.length})
          </button>
          <button onClick={generateToken} disabled={actionLoading} style={solidBtn}>
            + Generate Token
          </button>
        </div>
      </div>

      {/* New token display */}
      {newToken && (
        <div style={{
          background: '#f0fdf4', border: '2px solid #059669', borderRadius: 12,
          padding: 20, marginBottom: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#059669', fontWeight: 600, marginBottom: 8 }}>
            ✅ New Activation Token Generated
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 24, fontWeight: 800, letterSpacing: 4,
            color: '#1a1a2e', background: '#fff', borderRadius: 8, padding: '12px 20px',
            border: '1px solid #e2e8f0', display: 'inline-block',
          }}>
            {newToken}
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 0' }}>
            Share this token with the new representative. It expires in 7 days.
          </p>
          <button onClick={() => setNewToken(null)} style={{ ...outBtn, marginTop: 10 }}>Dismiss</button>
        </div>
      )}

      {actionMsg && (
        <div style={{ background: '#f0fdf4', color: '#059669', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, border: '1px solid #bbf7d0' }}>
          {actionMsg}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone, or agent ID…"
        style={{ width: '100%', padding: '11px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none', background: '#fff' }}
      />

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((rep) => (
            <div key={rep.id} onClick={() => setSelected(rep)} style={{
              background: '#fff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 12,
              opacity: rep.is_active ? 1 : 0.6,
            }}>
              <div style={{
                width: 40, height: 40, background: '#7c3aed', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, flexShrink: 0,
              }}>
                {rep.first_name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>
                  {rep.first_name} {rep.last_name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Agent {rep.rep_id} · {fmtPhone(rep.phone)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
                  {rep.confirmed_count ?? 0} collections
                </div>
                <span style={{
                  background: rep.is_active ? '#dcfce7' : '#fee2e2',
                  color: rep.is_active ? '#059669' : '#dc2626',
                  padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                }}>
                  {rep.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No representatives found.</div>
          )}
        </div>
      )}

      {/* Rep detail modal */}
      {selected && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={cardStyle}>
            <ModalHeader title="Representative Detail" onClose={() => setSelected(null)} />
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <InfoRow label="Name" value={`${selected.first_name} ${selected.last_name}`} />
              <InfoRow label="Agent ID" value={selected.rep_id} />
              <InfoRow label="Phone" value={fmtPhone(selected.phone)} />
              <InfoRow label="Email" value={selected.email || '—'} />
              <InfoRow label="Collections" value={String(selected.confirmed_count ?? 0)} />
              <InfoRow label="Status" value={selected.is_active ? 'Active' : 'Inactive'} />
              <InfoRow label="Since" value={fmtDate((selected as any).created_at ?? '')} />
            </div>
            <button onClick={() => toggleActive(selected)} disabled={actionLoading} style={{
              width: '100%', padding: '11px 0', border: 'none', borderRadius: 8, fontWeight: 600,
              cursor: 'pointer', fontSize: 14,
              background: selected.is_active ? '#fef2f2' : '#f0fdf4',
              color: selected.is_active ? '#dc2626' : '#059669',
            }}>
              {actionLoading ? '…' : selected.is_active ? 'Deactivate Representative' : 'Activate Representative'}
            </button>
          </div>
        </div>
      )}

      {/* Tokens modal */}
      {showTokens && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowTokens(false); }}>
          <div style={cardStyle}>
            <ModalHeader title="Active Tokens" onClose={() => setShowTokens(false)} />
            {tokens.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8' }}>No active tokens.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {tokens.map((t) => (
                  <div key={t.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, letterSpacing: 2 }}>
                      {t.token}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      Expires {fmtDate(t.expires_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{value}</span>
    </div>
  );
}
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>{title}</h3>
      <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>×</button>
    </div>
  );
}
function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const solidBtn: React.CSSProperties = { padding: '9px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const outBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#1a1a2e', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };
