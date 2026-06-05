// src/features/admin/AdminDashboard.tsx
// WAG ENTERPRISES — Admin Control Centre

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { fmt } from '../../utils/helpers';
import CustomerManagement from './CustomerManagement';
import RepresentativeManagement from './RepresentativeManagement';
import DisbursementApproval from './DisbursementApproval';
import FraudMonitor from './FraudMonitor';
import AuditLogs from './AuditLogs';
import Analytics from './Analytics';

type Tab = 'overview' | 'customers' | 'representatives' | 'disbursements' | 'fraud' | 'audit' | 'analytics';

interface SystemStats {
  active_customers: number;
  active_representatives: number;
  active_plans: number;
  confirmed_transactions: number;
  pending_disbursements: number;
  unresolved_flags: number;
  failed_auth_last_hour: number;
  total_balance: number;
}

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [custR, repR, planR, txR, disbR, fraudR, secR, balR] = await Promise.all([
        db.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        db.from('representatives').select('id', { count: 'exact', head: true }).eq('is_active', true),
        db.from('plans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        db.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
        db.from('disbursements').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('fraud_flags').select('id', { count: 'exact', head: true }).eq('resolved', false),
        db.from('security_events').select('id', { count: 'exact', head: true })
          .in('event_type', ['login_failed','pin_failed'])
          .gte('created_at', new Date(Date.now() - 3_600_000).toISOString()),
        db.from('transactions').select('amount').eq('status', 'confirmed').in('type', ['opening','deposit']),
      ]);

      const totalIn  = (balR.data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      const { data: payouts } = await db.from('transactions')
        .select('amount').eq('status', 'confirmed').in('type', ['payout','withdrawal']);
      const totalOut = (payouts ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);

      setStats({
        active_customers:       custR.count ?? 0,
        active_representatives: repR.count ?? 0,
        active_plans:           planR.count ?? 0,
        confirmed_transactions: txR.count ?? 0,
        pending_disbursements:  disbR.count ?? 0,
        unresolved_flags:       fraudR.count ?? 0,
        failed_auth_last_hour:  secR.count ?? 0,
        total_balance:          totalIn - totalOut,
      });
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const navItems: [Tab, string, string][] = [
    ['overview',         '📊', 'Overview'],
    ['customers',        '👥', 'Customers'],
    ['representatives',  '🧑‍💼', 'Reps'],
    ['disbursements',    '💸', 'Payouts'],
    ['fraud',            '🚨', 'Fraud'],
    ['audit',            '📋', 'Audit'],
    ['analytics',        '📈', 'Analytics'],
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'system-ui, sans-serif' }}>
      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
        padding: '20px 24px 0', color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>WAG Admin</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Control Centre</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadStats} style={iconBtn} title="Refresh">🔄</button>
            <button onClick={signOut} style={iconBtn} title="Sign out">🚪</button>
          </div>
        </div>

        {/* Quick stats */}
        {!loadingStats && stats && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
            gap: 10, marginBottom: 20,
          }}>
            <AdminStat label="Total Balance" value={fmt(stats.total_balance)} color="#4ade80" />
            <AdminStat label="Customers" value={String(stats.active_customers)} />
            <AdminStat
              label="Pending Payouts"
              value={String(stats.pending_disbursements)}
              color={stats.pending_disbursements > 0 ? '#fbbf24' : undefined}
            />
            <AdminStat
              label="Fraud Flags"
              value={String(stats.unresolved_flags)}
              color={stats.unresolved_flags > 0 ? '#f87171' : undefined}
            />
          </div>
        )}

        {/* Security alert */}
        {stats && stats.failed_auth_last_hour >= 5 && (
          <div style={{
            background: 'rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 14px',
            marginBottom: 14, border: '1px solid rgba(220,38,38,0.4)', fontSize: 13,
          }}>
            🚨 {stats.failed_auth_last_hour} failed authentication attempts in the last hour.
          </div>
        )}

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {navItems.map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '9px 14px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12, borderRadius: '8px 8px 0 0',
              whiteSpace: 'nowrap',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#1a1a2e' : 'rgba(255,255,255,0.75)',
            }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: 20 }}>
        {tab === 'overview'        && <OverviewTab stats={stats} loading={loadingStats} onRefresh={loadStats} />}
        {tab === 'customers'       && <CustomerManagement />}
        {tab === 'representatives' && <RepresentativeManagement onRefresh={loadStats} />}
        {tab === 'disbursements'   && <DisbursementApproval onRefresh={loadStats} />}
        {tab === 'fraud'           && <FraudMonitor onRefresh={loadStats} />}
        {tab === 'audit'           && <AuditLogs />}
        {tab === 'analytics'       && <Analytics />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────
function OverviewTab({
  stats, loading, onRefresh,
}: {
  stats: SystemStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) return <Spinner />;
  if (!stats) return null;

  const cards = [
    { label: 'Platform Balance',    value: fmt(stats.total_balance),              icon: '💰', color: '#059669' },
    { label: 'Active Customers',    value: String(stats.active_customers),         icon: '👤', color: '#2563eb' },
    { label: 'Active Reps',         value: String(stats.active_representatives),   icon: '🧑‍💼', color: '#7c3aed' },
    { label: 'Active Plans',        value: String(stats.active_plans),             icon: '📊', color: '#0891b2' },
    { label: 'Transactions',        value: String(stats.confirmed_transactions),   icon: '📋', color: '#0284c7' },
    { label: 'Pending Payouts',     value: String(stats.pending_disbursements),    icon: '💸', color: stats.pending_disbursements > 0 ? '#d97706' : '#6b7280' },
    { label: 'Fraud Flags',         value: String(stats.unresolved_flags),         icon: '🚨', color: stats.unresolved_flags > 0 ? '#dc2626' : '#6b7280' },
    { label: 'Failed Auth (1h)',    value: String(stats.failed_auth_last_hour),    icon: '🔐', color: stats.failed_auth_last_hour >= 5 ? '#dc2626' : '#6b7280' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>System Overview</h2>
        <button onClick={onRefresh} style={{
          padding: '8px 14px', background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{
            background: '#fff', borderRadius: 14, padding: '18px 20px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
              <div style={{ fontSize: 28 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color ?? '#fff' }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{
        width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
  width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
};
