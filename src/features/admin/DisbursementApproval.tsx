// src/features/admin/DisbursementApproval.tsx
// WAG ENTERPRISES — Admin Disbursement Approval
import { db } from '../../lib/supabase';
import { getAuditActionColor } from '../../lib/audit';
import React, { useState, useEffect, useCallback } from 'react';
import { getAllPendingDisbursements, approveDisbursement, rejectDisbursement } from '../../lib/disbursement';
import { fmt, fmtDate } from '../../utils/helpers';
import { DISBURSEMENT_STATUS_CONFIG } from '../../types/disbursement';
import type { DisbursementWithContext } from '../../types/disbursement';
import { useAuth } from '../auth/AuthProvider';

interface Props { onRefresh: () => void; }

export default function DisbursementApproval({ onRefresh }: Props) {
  const { session } = useAuth();
  const [disbursements, setDisbursements] = useState<DisbursementWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setDisbursements(await getAllPendingDisbursements()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(d: DisbursementWithContext) {
    setActionLoading(d.id);
    setMsg('');
    try {
      // Admin uses a dummy rep session shape
      const adminRep = { id: 'admin', rep_id: 'ADMIN', first_name: 'Admin', last_name: '', confirmed_count: 0, role: 'admin' } as any;
      await approveDisbursement(adminRep, {
        disbursement_id: d.id, plan_id: d.plan_id, amount: d.amount, customer_id: d.customer_id,
      });
      setMsg(`✅ Disbursement of ${fmt(d.amount)} approved.`);
      load(); onRefresh();
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Failed.'}`);
    } finally { setActionLoading(null); }
  }

  async function reject(d: DisbursementWithContext) {
    const reason = prompt('Rejection reason (optional):') ?? '';
    setActionLoading(d.id);
    try {
      await rejectDisbursement('admin', 'admin', { disbursement_id: d.id, reason });
      setMsg('Disbursement rejected.');
      load(); onRefresh();
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Failed.'}`);
    } finally { setActionLoading(null); }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Payout Requests ({disbursements.length})
      </h2>
      {msg && (
        <div style={{ background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✅') ? '#059669' : '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, border: `1px solid ${msg.startsWith('✅') ? '#bbf7d0' : '#fecaca'}` }}>
          {msg}
        </div>
      )}
      {loading ? <Spinner /> : disbursements.length === 0 ? (
        <Empty message="No pending payout requests." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {disbursements.map((d) => {
            const cfg = DISBURSEMENT_STATUS_CONFIG[d.status];
            const sufficient = Number(d.plan_balance ?? 0) >= Number(d.amount);
            const isLoading = actionLoading === d.id;
            return (
              <div key={d.id} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: `1px solid ${cfg.bgColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: '#1a1a2e' }}>{fmt(d.amount)}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {d.customer_first_name} {d.customer_last_name} · {d.customer_phone}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {d.type === 'emergency' ? '🚨' : '🎯'} {d.type} · Plan: {d.plan_name} · {fmtDate(d.requested_at)}
                    </div>
                    {d.reason && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#64748b', marginTop: 3 }}>"{d.reason}"</div>}
                  </div>
                  <span style={{ background: cfg.bgColor, color: cfg.color, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, alignSelf: 'flex-start' }}>{cfg.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: sufficient ? '#f0fdf4' : '#fef2f2', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Plan balance</span>
                  <span style={{ fontWeight: 600, color: sufficient ? '#059669' : '#dc2626' }}>
                    {fmt(d.plan_balance ?? 0)} {!sufficient && '⚠️'}
                  </span>
                </div>
                {sufficient && d.status === 'pending' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => approve(d)} disabled={isLoading} style={{ padding: '10px 0', background: isLoading ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                      {isLoading ? '…' : '✅ Approve & Pay'}
                    </button>
                    <button onClick={() => reject(d)} disabled={isLoading} style={{ padding: '10px 0', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                      {isLoading ? '…' : '❌ Reject'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// FRAUD MONITOR
// ─────────────────────────────────────────
// src/features/admin/FraudMonitor.tsx
export function FraudMonitor({ onRefresh }: { onRefresh: () => void }) {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');


  const load = useCallback(async () => {
    setLoading(true);
    const { getUnresolvedFlags } = await import('../../lib/fraud');
    try { setFlags(await getUnresolvedFlags()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    const { resolveFlag } = await import('../../lib/fraud');
    try {
      await resolveFlag(id);
      setMsg('Flag resolved.');
      load(); onRefresh();
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Failed.'); }
  }

  const SEVERITY: Record<string, { color: string; bg: string }> = {
    high:   { color: '#dc2626', bg: '#fee2e2' },
    medium: { color: '#d97706', bg: '#fef3c7' },
    low:    { color: '#2563eb', bg: '#dbeafe' },
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Fraud Monitor ({flags.length} unresolved)
      </h2>
      {msg && <div style={{ color: '#059669', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      {loading ? <Spinner /> : flags.length === 0 ? <Empty message="No unresolved fraud flags. 🎉" /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {flags.map((f) => {
            const sv = SEVERITY[f.severity] ?? SEVERITY.low;
            return (
              <div key={f.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: `1px solid ${sv.bg}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ background: sv.bg, color: sv.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    {f.severity.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(f.created_at)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e', marginBottom: 4 }}>{f.type}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{f.description}</div>
                <button onClick={() => resolve(f.id)} style={{ padding: '7px 14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                  Mark Resolved
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────
export function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { getAuditLogs, filterAuditLogs } = await import('../../lib/audit');
    try {
      const all = await getAuditLogs({ limit: 300 });
      setLogs(all);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    return !q || l.description?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.user_role?.toLowerCase().includes(q);
  });

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Audit Log</h2>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by action, description, or role…" style={{ width: '100%', padding: '11px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none', background: '#fff' }} />
      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((log) => (
            <div key={log.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: getAuditActionColor(log.action), marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{log.action}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{log.description}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {log.user_role} · {fmtDate(log.created_at)}
                  {log.amount ? ` · ${fmt(log.amount)}` : ''}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <Empty message="No audit entries found." />}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────
export function Analytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { db } = await import('../../lib/supabase');
        const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

        const [deposits30, newCusts30, newPlans30, disbApproved30] = await Promise.all([
          db.from('transactions').select('amount').eq('type','deposit').gte('created_at', since30).eq('status','confirmed'),
          db.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', since30),
          db.from('plans').select('id', { count: 'exact', head: true }).gte('created_at', since30),
          db.from('disbursements').select('amount').eq('status','paid').gte('requested_at', since30),
        ]);

        const totalDeposited = (deposits30.data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const totalDisbursed = (disbApproved30.data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);

        setData({
          totalDeposited30: totalDeposited,
          totalDisbursed30: totalDisbursed,
          newCustomers30:   newCusts30.count ?? 0,
          newPlans30:       newPlans30.count ?? 0,
        });
      } finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <Spinner />;
  if (!data) return null;

  const cards = [
    { label: 'Collected (30d)',       value: fmt(data.totalDeposited30), icon: '⬆️', color: '#059669' },
    { label: 'Paid Out (30d)',        value: fmt(data.totalDisbursed30), icon: '⬇️', color: '#d97706' },
    { label: 'New Customers (30d)',   value: String(data.newCustomers30), icon: '👤', color: '#2563eb' },
    { label: 'New Plans (30d)',       value: String(data.newPlans30),     icon: '📊', color: '#7c3aed' },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Analytics (Last 30 Days)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shared utils
function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
function Empty({ message }: { message: string }) {
  return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><p>{message}</p></div>;
}
