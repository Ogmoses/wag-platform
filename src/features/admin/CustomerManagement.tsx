// src/features/admin/CustomerManagement.tsx
// WAG ENTERPRISES — Admin Customer Management

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { fmt, fmtDate, fmtPhone } from '../../utils/helpers';
import { writeAuditLog } from '../../lib/audit';
import type { CustomerPublic } from '../../types/customer';

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<CustomerPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerPublic | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from('customers')
        .select('id, first_name, last_name, email, phone, is_active, kyc_status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      setCustomers((data ?? []) as CustomerPublic[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  async function toggleActive(cust: CustomerPublic) {
    setActionLoading(true);
    setActionMsg('');
    try {
      const newState = !cust.is_active;
      await db.from('customers').update({ is_active: newState }).eq('id', cust.id);
      await writeAuditLog({
        action: newState ? 'account_unlocked' : 'account_locked',
        user_id: 'admin',
        user_role: 'admin',
        description: `${newState ? 'Activated' : 'Deactivated'} customer: ${cust.first_name} ${cust.last_name}`,
      });
      setActionMsg(`Customer ${newState ? 'activated' : 'deactivated'}.`);
      setSelected(null);
      load();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  async function updateKyc(cust: CustomerPublic, status: 'verified' | 'rejected') {
    setActionLoading(true);
    try {
      await db.from('customers').update({ kyc_status: status }).eq('id', cust.id);
      await writeAuditLog({
        action: 'elevate',
        user_id: 'admin',
        user_role: 'admin',
        description: `KYC status set to "${status}" for customer: ${cust.first_name} ${cust.last_name}`,
      });
      setActionMsg(`KYC status updated to ${status}.`);
      setSelected(null);
      load();
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
          Customer Management ({filtered.length})
        </h2>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone, or email…"
        style={{
          width: '100%', padding: '11px 16px', border: '1px solid #e2e8f0',
          borderRadius: 10, fontSize: 14, marginBottom: 16, boxSizing: 'border-box',
          outline: 'none', background: '#fff',
        }}
      />

      {actionMsg && (
        <div style={{
          background: '#f0fdf4', color: '#059669', padding: '10px 14px',
          borderRadius: 8, marginBottom: 14, fontSize: 13, border: '1px solid #bbf7d0',
        }}>
          {actionMsg}
        </div>
      )}

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((cust) => (
            <div key={cust.id} onClick={() => setSelected(cust)} style={{
              background: '#fff', borderRadius: 12, padding: '14px 16px',
              cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: cust.is_active ? 1 : 0.6,
              transition: 'box-shadow 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)')}
            >
              <div style={{
                width: 40, height: 40, background: '#1a1a2e', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, flexShrink: 0,
              }}>
                {cust.first_name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>
                  {cust.first_name} {cust.last_name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{fmtPhone(cust.phone)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Badge
                    label={cust.is_active ? 'Active' : 'Inactive'}
                    color={cust.is_active ? '#059669' : '#dc2626'}
                    bg={cust.is_active ? '#dcfce7' : '#fee2e2'}
                  />
                  <Badge
                    label={cust.kyc_status}
                    color={cust.kyc_status === 'verified' ? '#059669' : cust.kyc_status === 'rejected' ? '#dc2626' : '#d97706'}
                    bg={cust.kyc_status === 'verified' ? '#dcfce7' : cust.kyc_status === 'rejected' ? '#fee2e2' : '#fef3c7'}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {fmtDate(cust.created_at ?? '')}
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              No customers found.
            </div>
          )}
        </div>
      )}

      {/* Customer detail modal */}
      {selected && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={modalCard}>
            <ModalHeader title="Customer Detail" onClose={() => setSelected(null)} />

            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <InfoRow label="Name" value={`${selected.first_name} ${selected.last_name}`} />
              <InfoRow label="Phone" value={fmtPhone(selected.phone)} />
              <InfoRow label="Email" value={selected.email || '—'} />
              <InfoRow label="Status" value={selected.is_active ? 'Active' : 'Inactive'} />
              <InfoRow label="KYC" value={selected.kyc_status} />
              <InfoRow label="Member since" value={fmtDate(selected.created_at ?? '')} />
            </div>

            {actionMsg && (
              <div style={{ color: '#059669', fontSize: 13, marginBottom: 12 }}>{actionMsg}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => toggleActive(selected)}
                disabled={actionLoading}
                style={{
                  padding: '10px 0', border: 'none', borderRadius: 8, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                  background: selected.is_active ? '#fef2f2' : '#f0fdf4',
                  color: selected.is_active ? '#dc2626' : '#059669',
                }}
              >
                {actionLoading ? '…' : selected.is_active ? 'Deactivate' : 'Activate'}
              </button>

              {selected.kyc_status !== 'verified' && (
                <button
                  onClick={() => updateKyc(selected, 'verified')}
                  disabled={actionLoading}
                  style={{
                    padding: '10px 0', background: '#eff6ff', color: '#2563eb',
                    border: '1px solid #bfdbfe', borderRadius: 8, fontWeight: 600,
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  Verify KYC
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      background: bg, color, padding: '3px 8px', borderRadius: 12,
      fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
    }}>{label}</span>
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
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalCard: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };
