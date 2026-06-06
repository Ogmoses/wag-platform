// src/features/representative/RepresentativeDashboard.tsx
// WAG ENTERPRISES — Representative Dashboard
// Representatives can search customers, record collections, and approve disbursements
// They CANNOT edit balances directly

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { fmt, fmtDate } from '../../utils/helpers';
import { getAgentScore } from '../../lib/fraud';
import type { RepTodaySummary } from '../../types/representative';
import AssignedCustomers from './AssignedCustomers';
import RecordCollection from './RecordCollection';
import CollectionHistory from './CollectionHistory';
import RepresentativeProfile from './RepresentativeProfile';

type Tab = 'search' | 'record' | 'history' | 'profile';

export default function RepresentativeDashboard() {
  const { repProfile, signOut } = useAuth();
  const rep = repProfile!;

  const [tab, setTab] = useState<Tab>('search');
  const [todaySummary, setTodaySummary] = useState<RepTodaySummary | null>(null);
  const [agentScore, setAgentScore] = useState<{ score: number; label: string; color: string } | null>(null);
  const [pendingDisbCount, setPendingDisbCount] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      // Load today's collection total from view
      const { data: summary } = await db
        .from('rep_today_collections')
        .select('*')
        .eq('representative_id', rep.id)
        .single();

      setTodaySummary(summary ?? null);

      // Load agent reliability score
      const score = await getAgentScore(rep.id);
      setAgentScore(score);

      // Count pending disbursements assigned through this rep
      const { count } = await db
        .from('pending_disbursements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      setPendingDisbCount(count ?? 0);
    } catch {
      // Stats are informational — don't crash dashboard
    }
  }, [rep.id]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const todayTotal   = Number(todaySummary?.today_total ?? 0);
  const dailyLimit   = Number(todaySummary?.max_daily_total ?? 500_000);
  const limitPct     = Math.min(100, Math.round((todayTotal / dailyLimit) * 100));
  const initial      = rep.first_name.charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'system-ui, sans-serif' }}>
      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
        padding: '20px 24px 0', color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, background: 'rgba(255,255,255,0.15)',
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18, fontWeight: 700,
            }}>{initial}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {rep.first_name} {rep.last_name}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Agent ID: {rep.rep_id}</div>
            </div>
          </div>
          <button onClick={signOut} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
          }}>🚪</button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <StatCard
            label="Today's Collections"
            value={fmt(todayTotal)}
            sub={`${todaySummary?.tx_count ?? 0} transaction${(todaySummary?.tx_count ?? 0) !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Total Confirmed"
            value={String(rep.confirmed_count ?? 0)}
            sub="all time"
          />
          <StatCard
            label="Pending Payouts"
            value={String(pendingDisbCount)}
            sub="awaiting approval"
            highlight={pendingDisbCount > 0}
          />
        </div>

        {/* Daily limit progress bar */}
        <div style={{
          background: 'rgba(255,255,255,0.08)', borderRadius: 10,
          padding: '12px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span style={{ opacity: 0.8 }}>Daily Limit</span>
            <span style={{ fontWeight: 700 }}>{fmt(todayTotal)} / {fmt(dailyLimit)}</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${limitPct}%`,
              background: limitPct >= 90 ? '#f97316' : '#22c55e',
              transition: 'width 0.5s',
            }} />
          </div>
          {limitPct >= 90 && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, fontWeight: 600 }}>
              ⚠️ Approaching daily limit
            </div>
          )}
        </div>

        {/* Agent score badge */}
        {agentScore && (
          <div style={{
            background: 'rgba(255,255,255,0.08)', borderRadius: 10,
            padding: '10px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Reliability Score</span>
            <span style={{
              fontWeight: 700, fontSize: 14,
              color: agentScore.score >= 80 ? '#4ade80' : agentScore.score >= 60 ? '#fbbf24' : '#f87171',
            }}>
              {agentScore.score}/100 — {agentScore.label}
            </span>
          </div>
        )}

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            ['search',  '🔍', 'Customers'],
            ['record',  '✍️', 'Collect'],
            ['history', '📋', 'History'],
            ['profile', '👤', 'Profile'],
          ] as [Tab, string, string][]).map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, borderRadius: '8px 8px 0 0',
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
        {tab === 'search'  && <AssignedCustomers rep={rep} onRefresh={loadStats} />}
        {tab === 'record'  && <RecordCollection rep={rep} onSuccess={loadStats} />}
        {tab === 'history' && <CollectionHistory repId={rep.id} />}
        {tab === 'profile' && <RepresentativeProfile />}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '12px 14px',
      border: highlight ? '1px solid rgba(249,115,22,0.4)' : 'none',
    }}>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: highlight ? '#fbbf24' : '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
