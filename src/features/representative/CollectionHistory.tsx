// src/features/representative/CollectionHistory.tsx
// WAG ENTERPRISES — Rep Collection History

import React, { useState, useEffect, useCallback } from 'react';
import { getRepTransactions } from '../../lib/ledger';
import { fmt, fmtDate, fmtTime } from '../../utils/helpers';
import type { Transaction } from '../../types/transaction';

interface Props { repId: string; }

export default function CollectionHistory({ repId }: Props) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRepTransactions(repId);
      setTxs(data);
    } finally {
      setLoading(false);
    }
  }, [repId]);

  useEffect(() => { load(); }, [load]);

  const filtered = txs.filter(
    (t) => !search || t.ref.toLowerCase().includes(search.toLowerCase())
  );

  const todayTotal = txs
    .filter((t) => {
      const today = new Date().toISOString().split('T')[0];
      return t.created_at.startsWith(today) && t.type === 'deposit';
    })
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalAll = txs
    .filter((t) => t.type === 'deposit')
    .reduce((s, t) => s + Number(t.amount), 0);

  if (loading) return <Spinner />;

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Collection History
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Today's Total" value={fmt(todayTotal)} color="#2563eb" />
        <SummaryCard label="All Time Total" value={fmt(totalAll)} color="#059669" />
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by reference…"
        style={{
          width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
          borderRadius: 8, fontSize: 14, marginBottom: 14, boxSizing: 'border-box',
          outline: 'none', background: '#fff',
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <p>No collections recorded yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((tx) => (
            <div key={tx.id} style={{
              background: '#fff', borderRadius: 12, padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>
                  {tx.type === 'deposit' ? '⬆️ Deposit' : tx.type}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {tx.ref} · {fmtDate(tx.created_at)} {fmtTime(tx.created_at)}
                </div>
                {tx.notes && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                    {tx.notes}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>
                  {fmt(tx.amount)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{tx.method ?? '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
