// src/features/customer/CustomerDashboard.tsx
// WAG ENTERPRISES — Customer Dashboard
// Preserves original UI layout and design language

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { getCustomerPlans, createPlan, softDeletePlan, markMilestoneShown, getScheduleInfo }
  from '../../lib/ledger';
import { fmt, fmtDate, genRef } from '../../utils/helpers';
import type { PlanBalance } from '../../types/plan';
import type { CreatePlanPayload, PlanFrequency } from '../../types/plan';
import CustomerTransactions from './CustomerTransactions';
import CustomerDisbursements from './CustomerDisbursements';
import CustomerProfile from './CustomerProfile';
import CustomerNotifications from './CustomerNotifications';

type Tab = 'plans' | 'transactions' | 'disbursements' | 'profile' | 'notifications';

export default function CustomerDashboard() {
  const { customerProfile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<PlanBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanBalance | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [milestone, setMilestone] = useState<PlanBalance | null>(null);

  const load = useCallback(async () => {
    if (!customerProfile) return;
    setLoading(true);
    try {
      const data = await getCustomerPlans(customerProfile.id);
      setPlans(data);
      // Check milestone
      const done = data.find((p) =>
        !p.milestone_shown &&
        p.balance >= p.target_amount &&
        p.status === 'active'
      );
      if (done) setMilestone(done);
    } finally {
      setLoading(false);
    }
  }, [customerProfile]);

  useEffect(() => { load(); }, [load]);

  const totalBalance = plans.reduce((s, p) => s + Number(p.balance ?? 0), 0);
  const activePlans = plans.filter((p) => p.status === 'active');
  const completedPlans = plans.filter((p) => p.status === 'completed');

  async function dismissMilestone() {
    if (milestone) {
      await markMilestoneShown(milestone.plan_id);
      setMilestone(null);
    }
  }

  const profile = customerProfile!;
  const initial = profile.first_name.charAt(0).toUpperCase();

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
                {profile.first_name} {profile.last_name}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{profile.phone}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTab('notifications')} style={iconBtn}>🔔</button>
            <button onClick={signOut} style={iconBtn}>🚪</button>
          </div>
        </div>

        {/* Balance card */}
        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: 16,
          padding: '20px 24px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Total Savings</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>{fmt(totalBalance)}</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span>📊 {activePlans.length} Active Plan{activePlans.length !== 1 ? 's' : ''}</span>
            <span>✅ {completedPlans.length} Completed</span>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 0 }}>
          {([
            ['plans', '🏦', 'Plans'],
            ['transactions', '📋', 'History'],
            ['disbursements', '💸', 'Payouts'],
            ['profile', '👤', 'Profile'],
          ] as [Tab, string, string][]).map(([t, icon, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, borderRadius: '8px 8px 0 0',
                whiteSpace: 'nowrap', transition: 'all 0.2s',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#1a1a2e' : 'rgba(255,255,255,0.75)',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: 20 }}>
        {tab === 'plans' && (
          <PlansTab
            plans={plans}
            loading={loading}
            onRefresh={load}
            onNewPlan={() => setShowNewPlan(true)}
            onSelect={setSelectedPlan}
          />
        )}
        {tab === 'transactions' && customerProfile && (
          <CustomerTransactions customerId={customerProfile.id} />
        )}
        {tab === 'disbursements' && customerProfile && (
          <CustomerDisbursements customerId={customerProfile.id} onRefresh={load} />
        )}
        {tab === 'profile' && (
          <CustomerProfile />
        )}
        {tab === 'notifications' && customerProfile && (
          <CustomerNotifications userId={customerProfile.id} />
        )}
      </div>

      {/* ── MODALS ── */}
      {showNewPlan && customerProfile && (
        <NewPlanModal
          customerId={customerProfile.id}
          onSuccess={() => { setShowNewPlan(false); load(); }}
          onClose={() => setShowNewPlan(false)}
        />
      )}

      {selectedPlan && (
        <PlanDetailModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onDelete={async () => {
            await softDeletePlan(selectedPlan.plan_id, selectedPlan.customer_id, selectedPlan.name);
            setSelectedPlan(null);
            load();
          }}
          onDisbursement={() => { setSelectedPlan(null); setTab('disbursements'); }}
        />
      )}

      {milestone && (
        <MilestoneModal plan={milestone} onDismiss={dismissMilestone} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// PLANS TAB
// ─────────────────────────────────────────
function PlansTab({
  plans, loading, onRefresh, onNewPlan, onSelect,
}: {
  plans: PlanBalance[];
  loading: boolean;
  onRefresh: () => void;
  onNewPlan: () => void;
  onSelect: (p: PlanBalance) => void;
}) {
  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>My Plans</h2>
        <button onClick={onNewPlan} style={{
          padding: '8px 16px', background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>+ New Plan</button>
      </div>

      {plans.filter(p => p.status !== 'deleted').length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center',
          color: '#94a3b8',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
          <p style={{ fontWeight: 600, color: '#475569', marginBottom: 8 }}>No plans yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>Create your first savings plan to get started</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {plans.filter(p => p.status !== 'deleted').map((plan) => (
            <PlanCard key={plan.plan_id} plan={plan} onClick={() => onSelect(plan)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// PLAN CARD
// ─────────────────────────────────────────
function PlanCard({ plan, onClick }: { plan: PlanBalance; onClick: () => void }) {
  const balance  = Number(plan.balance ?? 0);
  const target   = Number(plan.target_amount ?? 1);
  const pct      = Math.min(100, Math.round((balance / target) * 100));
  const schedule = getScheduleInfo(plan, balance);
  const isExpired = new Date(plan.maturity_date) < new Date() && plan.status === 'active';

  const statusColor = plan.status === 'completed' ? '#059669'
    : plan.status === 'active' ? '#2563eb' : '#94a3b8';

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 16, padding: 20,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.1s',
        border: `1px solid ${isExpired ? '#fecaca' : '#f1f5f9'}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.12)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>{plan.name}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {plan.frequency} · Due {fmtDate(plan.maturity_date)}
          </div>
        </div>
        <span style={{
          background: `${statusColor}15`, color: statusColor,
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        }}>
          {plan.status === 'active' && isExpired ? 'Overdue' : plan.status}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: '#64748b' }}>Balance</span>
          <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{fmt(balance)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
          <span>Target: {fmt(target)}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${pct}%`,
            background: pct >= 100 ? '#059669' : isExpired ? '#dc2626' : '#2563eb',
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      {schedule.missed > 0 && plan.status === 'active' && (
        <div style={{
          background: '#fef2f2', color: '#dc2626', padding: '6px 10px',
          borderRadius: 6, fontSize: 12, fontWeight: 500,
        }}>
          ⚠️ {schedule.missed} missed {schedule.label} contribution{schedule.missed !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// NEW PLAN MODAL
// ─────────────────────────────────────────
function NewPlanModal({
  customerId, onSuccess, onClose,
}: {
  customerId: string; onSuccess: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '', frequency: '' as PlanFrequency | '',
    target_amount: '', regular_contribution: '',
    opening_contribution: '', maturity_date: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim())              return setError('Plan name is required.');
    if (!form.frequency)                return setError('Select a contribution frequency.');
    if (!form.target_amount)            return setError('Target amount is required.');
    if (!form.regular_contribution)     return setError('Regular contribution is required.');
    if (!form.opening_contribution)     return setError('Opening contribution is required.');
    if (!form.maturity_date)            return setError('Maturity date is required.');

    const target  = parseFloat(form.target_amount);
    const contrib = parseFloat(form.regular_contribution);
    const opening = parseFloat(form.opening_contribution);

    if (isNaN(target) || target <= 0)   return setError('Target amount must be a positive number.');
    if (isNaN(contrib) || contrib <= 0) return setError('Contribution must be a positive number.');
    if (isNaN(opening) || opening <= 0) return setError('Opening contribution must be a positive number.');
    if (opening > target)               return setError('Opening contribution cannot exceed target.');
    if (new Date(form.maturity_date) <= new Date()) return setError('Maturity date must be in the future.');

    setLoading(true);
    try {
      const { getSession } = await import('../../lib/auth');
      const session = getSession();
      if (!session || !session.profile) throw new Error('Not authenticated');

      await createPlan(session.profile as any, {
        name: form.name.trim(),
        frequency: form.frequency as PlanFrequency,
        target_amount: target,
        regular_contribution: contrib,
        opening_contribution: opening,
        maturity_date: form.maturity_date,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create plan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New Savings Plan" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Plan Name">
          <input value={form.name} onChange={e=>set('name',e.target.value)}
            style={minp} placeholder="e.g. Christmas Savings" />
        </Field>
        <Field label="Frequency">
          <select value={form.frequency} onChange={e=>set('frequency',e.target.value)} style={minp}>
            <option value="">Select…</option>
            <option value="Daily">Daily</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
          </select>
        </Field>
        <Field label="Target Amount (₦)">
          <input type="number" value={form.target_amount} onChange={e=>set('target_amount',e.target.value)}
            style={minp} placeholder="100000" min="1" />
        </Field>
        <Field label="Regular Contribution (₦)">
          <input type="number" value={form.regular_contribution} onChange={e=>set('regular_contribution',e.target.value)}
            style={minp} placeholder="5000" min="1" />
        </Field>
        <Field label="Opening Contribution (₦)">
          <input type="number" value={form.opening_contribution} onChange={e=>set('opening_contribution',e.target.value)}
            style={minp} placeholder="10000" min="1" />
        </Field>
        <Field label="Maturity Date">
          <input type="date" value={form.maturity_date} onChange={e=>set('maturity_date',e.target.value)}
            style={minp} min={new Date().toISOString().split('T')[0]} />
        </Field>
        {error && <div style={errBox}>{error}</div>}
        <button type="submit" disabled={loading} style={submitBtn}>
          {loading ? 'Creating…' : 'Create Plan'}
        </button>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────
// PLAN DETAIL MODAL
// ─────────────────────────────────────────
function PlanDetailModal({
  plan, onClose, onDelete, onDisbursement,
}: {
  plan: PlanBalance; onClose: () => void; onDelete: () => void; onDisbursement: () => void;
}) {
  const balance  = Number(plan.balance ?? 0);
  const target   = Number(plan.target_amount ?? 1);
  const pct      = Math.min(100, Math.round((balance / target) * 100));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Modal title={plan.name} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <InfoBox label="Balance" value={fmt(balance)} highlight />
        <InfoBox label="Target" value={fmt(target)} />
        <InfoBox label="Frequency" value={plan.frequency} />
        <InfoBox label="Maturity" value={fmtDate(plan.maturity_date)} />
        <InfoBox label="Contributions" value={String(plan.deposit_count ?? 0)} />
        <InfoBox label="Last Deposit" value={fmtDate(plan.last_deposit_at)} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: '#64748b' }}>Progress</span>
          <span style={{ fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
          <div style={{
            height: '100%', borderRadius: 4, width: `${pct}%`,
            background: pct >= 100 ? '#059669' : '#2563eb', transition: 'width 0.6s',
          }} />
        </div>
      </div>

      {plan.status === 'active' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onDisbursement} style={{
            padding: '10px 0', background: '#059669', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>Request Payout</button>
          <button onClick={() => setConfirmDelete(true)} style={{
            padding: '10px 0', background: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>Delete Plan</button>
        </div>
      )}

      {confirmDelete && (
        <div style={{
          marginTop: 14, background: '#fef2f2', borderRadius: 8,
          padding: 14, border: '1px solid #fecaca',
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            Delete this plan? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDelete} style={{
              flex: 1, padding: '8px 0', background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>Yes, Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{
              flex: 1, padding: '8px 0', background: '#e2e8f0', color: '#475569',
              border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────
// MILESTONE MODAL
// ─────────────────────────────────────────
function MilestoneModal({ plan, onDismiss }: { plan: PlanBalance; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(135deg,#1a1a2e,#16213e)', borderRadius: 20,
        padding: 36, maxWidth: 360, width: '100%', textAlign: 'center', color: '#fff',
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Goal Achieved!</h2>
        <p style={{ margin: '0 0 6px', opacity: 0.85 }}>{plan.name}</p>
        <p style={{ margin: '0 0 24px', fontSize: 28, fontWeight: 800 }}>{fmt(plan.balance)}</p>
        <button onClick={onDismiss} style={{
          padding: '12px 32px', background: '#fff', color: '#1a1a2e',
          border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 15,
        }}>Amazing! 🚀</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', width: 32, height: 32,
            borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: highlight ? 18 : 14, color: highlight ? '#1a1a2e' : '#374151' }}>
        {value}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{
        width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1a1a2e',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
      }} />
      <p style={{ color: '#94a3b8' }}>Loading…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
  width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const minp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
};
const errBox: React.CSSProperties = {
  background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
  borderRadius: 8, fontSize: 13, marginBottom: 14, border: '1px solid #fecaca',
};
const submitBtn: React.CSSProperties = {
  width: '100%', padding: 13, background: '#1a1a2e', color: '#fff',
  border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14,
};
