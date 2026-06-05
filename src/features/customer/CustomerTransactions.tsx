// src/features/customer/CustomerTransactions.tsx
// WAG ENTERPRISES — Customer Transaction History

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { fmt, fmtDate, fmtTime } from '../../utils/helpers';
import type { Transaction, TransactionType } from '../../types/transaction';

interface Props { customerId: string; planId?: string; }

export default function CustomerTransactions({ customerId, planId }: Props) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = db
        .from('transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (planId) q = q.eq('plan_id', planId);

      const { data } = await q;
      setTxs(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [customerId, planId]);

  useEffect(() => { load(); }, [load]);

  const filtered = txs
    .filter((t) => filter === 'all' || t.type === filter)
    .filter((t) => !search || t.ref.toLowerCase().includes(search.toLowerCase()));

  const totalCredit = filtered
    .filter((t) => ['opening','deposit'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalDebit = filtered
    .filter((t) => ['payout','withdrawal'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);

  const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
    opening:    { icon: '🏁', color: '#2563eb', label: 'Opening' },
    deposit:    { icon: '⬆️', color: '#059669', label: 'Deposit' },
    payout:     { icon: '⬇️', color: '#d97706', label: 'Payout' },
    withdrawal: { icon: '💸', color: '#dc2626', label: 'Withdrawal' },
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Transaction History
      </h2>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total In', value: fmt(totalCredit), color: '#059669' },
          { label: 'Total Out', value: fmt(totalDebit), color: '#dc2626' },
          { label: 'Net', value: fmt(totalCredit - totalDebit), color: '#1a1a2e' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all','opening','deposit','payout','withdrawal'] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: '6px 12px', border: 'none', borderRadius: 16, cursor: 'pointer',
            fontWeight: 600, fontSize: 12,
            background: filter === t ? '#1a1a2e' : '#f1f5f9',
            color: filter === t ? '#fff' : '#64748b',
          }}>
            {t === 'all' ? 'All' : typeConfig[t]?.label ?? t}
          </button>
        ))}
      </div>

      <input
        placeholder="Search by reference…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
          borderRadius: 8, fontSize: 14, marginBottom: 14,
          boxSizing: 'border-box', outline: 'none', background: '#fff',
        }}
      />

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No transactions found." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((tx) => {
            const cfg = typeConfig[tx.type] ?? { icon: '💳', color: '#94a3b8', label: tx.type };
            const isCredit = ['opening','deposit'].includes(tx.type);
            return (
              <div key={tx.id} style={{
                background: '#fff', borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${cfg.color}15`, flexShrink: 0,
                }}>{cfg.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{cfg.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {tx.ref} · {fmtDate(tx.created_at)} {fmtTime(tx.created_at)}
                  </div>
                  {tx.notes && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{tx.notes}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: isCredit ? '#059669' : '#dc2626' }}>
                    {isCredit ? '+' : '-'}{fmt(tx.amount)}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{tx.method ?? '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
      <p>{message}</p>
    </div>
  );
}
