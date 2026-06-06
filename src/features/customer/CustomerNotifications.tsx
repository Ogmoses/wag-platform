// src/features/customer/CustomerNotifications.tsx
// WAG ENTERPRISES — Customer Notifications

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { fmtDate, fmtTime } from '../../utils/helpers';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Props { userId: string; }

const TYPE_ICON: Record<string, string> = {
  deposit:              '⬆️',
  payout:               '⬇️',
  disbursement_request: '💸',
  disbursement_approved:'✅',
  disbursement_rejected:'❌',
  milestone:            '🎉',
  overdue:              '⚠️',
  plan_created:         '🏦',
  general:              '🔔',
};

export default function CustomerNotifications({ userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifications(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await db.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  async function markAllRead() {
    await db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              marginLeft: 8, background: '#dc2626', color: '#fff',
              borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700,
            }}>{unreadCount}</span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            background: 'none', border: 'none', color: '#2563eb',
            fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🔔</div>
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              style={{
                background: n.is_read ? '#fff' : '#f0f7ff',
                borderRadius: 12, padding: '14px 16px',
                cursor: n.is_read ? 'default' : 'pointer',
                border: `1px solid ${n.is_read ? '#f1f5f9' : '#bfdbfe'}`,
                display: 'flex', gap: 12, alignItems: 'flex-start',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: '#e0e7ff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18, flexShrink: 0,
              }}>
                {TYPE_ICON[n.type] ?? '🔔'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: 14, color: '#1a1a2e' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                  {n.body}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {fmtDate(n.created_at)} at {fmtTime(n.created_at)}
                </div>
              </div>
              {!n.is_read && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#2563eb', flexShrink: 0, marginTop: 4,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #e2e8f0',
        borderTopColor: '#1a1a2e', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite', margin: '0 auto',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
