// src/features/representative/RecordCollection.tsx
// WAG ENTERPRISES — Record Collection (Representative)
// Representatives record customer deposits — CANNOT edit balances directly
// All balance changes go through the immutable ledger via recordCollection()

import React, { useState, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { recordCollection } from '../../lib/ledger';
import { checkRepDailyVolume, checkLargeCollection } from '../../lib/fraud';
import { requirePositiveAmount, requireWithinDailyLimit } from '../../security/permissionChecks';
import { rateLimitCollection } from '../../security/rateLimit';
import { fmt, fmtDate, normPhone } from '../../utils/helpers';
import type { RepresentativeSession } from '../../types/representative';
import type { CollectionReceipt, PaymentMethod } from '../../types/transaction';
import type { PlanBalance } from '../../types/plan';

interface Props {
  rep: RepresentativeSession;
  onSuccess: () => void;
}

const METHODS: PaymentMethod[] = ['Cash', 'Bank Transfer', 'Mobile Money'];

export default function RecordCollection({ rep, onSuccess }: Props) {
  const [step, setStep] = useState<'search' | 'plan' | 'amount' | 'confirm' | 'receipt'>('search');
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<{ id: string; first_name: string; last_name: string; phone: string } | null>(null);
  const [plans, setPlans] = useState<PlanBalance[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<CollectionReceipt | null>(null);

  const searchCustomer = useCallback(async () => {
    if (!phone.trim()) return;
    setError('');
    setLoading(true);
    try {
      const norm = normPhone(phone);
      const { data, error: dbErr } = await db
        .from('customers')
        .select('id, first_name, last_name, phone, is_active')
        .eq('phone', norm)
        .single();

      if (dbErr || !data) { setError('Customer not found. Check the phone number.'); return; }
      if (!data.is_active) { setError('This customer account is inactive.'); return; }

      setCustomer(data);

      // Load their active plans
      const { data: planData } = await db
        .from('plan_balances')
        .select('*')
        .eq('customer_id', data.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (!planData || planData.length === 0) {
        setError('This customer has no active savings plans.');
        return;
      }

      setPlans(planData);
      setStep('plan');
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  async function handleSubmit() {
    if (!customer || !selectedPlan) return;
    setError('');

    // Rate limit
    const rl = rateLimitCollection(rep.id);
    if (!rl.allowed) { setError(rl.message); return; }

    const amt = parseFloat(amount);

    try {
      requirePositiveAmount(amt);

      // Check daily limit from view
      const { data: todayData } = await db
        .from('rep_today_collections')
        .select('today_total, max_daily_total, max_single_tx')
        .eq('representative_id', rep.id)
        .single();

      const todayTotal = Number(todayData?.today_total ?? 0);
      const dailyLimit = Number(todayData?.max_daily_total ?? 500_000);
      const singleLimit = Number(todayData?.max_single_tx ?? 100_000);

      if (amt > singleLimit) {
        setError(`Single transaction limit is ${fmt(singleLimit)}. Contact admin for override.`);
        return;
      }

      requireWithinDailyLimit(todayTotal, amt, dailyLimit);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
      return;
    }

    setStep('confirm');
  }

  async function confirmCollection() {
    if (!customer || !selectedPlan) return;
    setLoading(true);
    setError('');

    const amt = parseFloat(amount);

    try {
      const rec = await recordCollection(rep, {
        customer_id: customer.id,
        plan_id: selectedPlan.plan_id,
        amount: amt,
        method,
        notes: notes.trim() || undefined,
      });

      // Run fraud checks async (don't block receipt)
      checkLargeCollection(amt, rep.id, selectedPlan.plan_id).catch(() => {});
      checkRepDailyVolume(rep.id, amt).catch(() => {});

      // Enrich receipt with customer name
      rec.customer_name = `${customer.first_name} ${customer.last_name}`;
      setReceipt(rec);
      setStep('receipt');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Collection failed. Please try again.');
      setStep('amount');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('search');
    setPhone('');
    setCustomer(null);
    setPlans([]);
    setSelectedPlan(null);
    setAmount('');
    setMethod('Cash');
    setNotes('');
    setError('');
    setReceipt(null);
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Record Collection
      </h2>

      {/* Step indicator */}
      <StepIndicator
        steps={['Search', 'Plan', 'Amount', 'Confirm']}
        current={['search','plan','amount','confirm','receipt'].indexOf(step)}
      />

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        {/* ── STEP 1: SEARCH ── */}
        {step === 'search' && (
          <div>
            <h3 style={sh}>Find Customer</h3>
            <label style={lbl}>Customer Phone Number</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCustomer()}
                placeholder="07012345678"
                style={{ ...inp, flex: 1 }}
              />
              <button onClick={searchCustomer} disabled={loading || !phone.trim()} style={primaryBtn}>
                {loading ? '…' : 'Find'}
              </button>
            </div>
            {error && <div style={errBox}>{error}</div>}
          </div>
        )}

        {/* ── STEP 2: SELECT PLAN ── */}
        {step === 'plan' && customer && (
          <div>
            <h3 style={sh}>Select Plan</h3>
            <CustomerBadge customer={customer} />
            <div style={{ display: 'grid', gap: 10 }}>
              {plans.map((plan) => (
                <button
                  key={plan.plan_id}
                  onClick={() => { setSelectedPlan(plan); setStep('amount'); }}
                  style={{
                    background: '#f8fafc', border: '2px solid #e2e8f0',
                    borderRadius: 12, padding: 16, textAlign: 'left', cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a1a2e')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e', marginBottom: 4 }}>
                    {plan.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Balance: <b>{fmt(plan.balance)}</b></span>
                    <span style={{ color: '#64748b' }}>Target: {fmt(plan.target_amount)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {plan.frequency} · Due {fmtDate(plan.maturity_date)}
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('search')} style={backBtn}>← Back</button>
          </div>
        )}

        {/* ── STEP 3: AMOUNT ── */}
        {step === 'amount' && customer && selectedPlan && (
          <div>
            <h3 style={sh}>Enter Amount</h3>
            <CustomerBadge customer={customer} />
            <PlanBadge plan={selectedPlan} />

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Amount (₦)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="1"
                style={{ ...inp, fontSize: 20, fontWeight: 700 }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {METHODS.map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} style={{
                    padding: '8px 0', border: `2px solid ${method === m ? '#1a1a2e' : '#e2e8f0'}`,
                    borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12,
                    background: method === m ? '#1a1a2e' : '#fff',
                    color: method === m ? '#fff' : '#64748b',
                  }}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Notes (optional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note…" style={inp} />
            </div>

            {error && <div style={errBox}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSubmit} disabled={!amount || loading} style={primaryBtn}>
                Continue →
              </button>
              <button onClick={() => setStep('plan')} style={backBtn}>← Back</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRM ── */}
        {step === 'confirm' && customer && selectedPlan && (
          <div>
            <h3 style={sh}>Confirm Collection</h3>
            <div style={{
              background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
              {[
                ['Customer', `${customer.first_name} ${customer.last_name}`],
                ['Plan', selectedPlan.name],
                ['Amount', fmt(parseFloat(amount))],
                ['Method', method],
                ['Agent', `${rep.first_name} ${rep.last_name} (${rep.rep_id})`],
                ...(notes ? [['Notes', notes]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid #e2e8f0',
                  fontSize: 14,
                }}>
                  <span style={{ color: '#64748b' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{value}</span>
                </div>
              ))}
            </div>
            {error && <div style={errBox}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmCollection} disabled={loading} style={primaryBtn}>
                {loading ? 'Recording…' : '✅ Confirm & Record'}
              </button>
              <button onClick={() => setStep('amount')} disabled={loading} style={backBtn}>
                ← Edit
              </button>
            </div>
          </div>
        )}

        {/* ── RECEIPT ── */}
        {step === 'receipt' && receipt && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#059669' }}>
              Collection Recorded
            </h3>
            <p style={{ color: '#64748b', marginBottom: 20 }}>
              Reference: <strong>{receipt.ref}</strong>
            </p>
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'left',
            }}>
              {[
                ['Amount Collected', fmt(receipt.amount)],
                ['Plan', receipt.plan_name],
                ['Customer', receipt.customer_name],
                ['New Balance', fmt(receipt.new_balance)],
                ['Method', receipt.method],
                ['Agent', `${receipt.agent_name} (${receipt.agent_id})`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', fontSize: 14,
                }}>
                  <span style={{ color: '#64748b' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{value}</span>
                </div>
              ))}
            </div>
            <button onClick={reset} style={primaryBtn}>Record Another Collection</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-components
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ flex: 1 }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: i <= current ? '#1a1a2e' : '#e2e8f0',
            transition: 'background 0.3s',
          }} />
          <div style={{
            fontSize: 10, marginTop: 4, textAlign: 'center',
            color: i <= current ? '#1a1a2e' : '#94a3b8',
            fontWeight: i === current ? 700 : 400,
          }}>{s}</div>
        </div>
      ))}
    </div>
  );
}

function CustomerBadge({ customer }: { customer: { first_name: string; last_name: string; phone: string } }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc',
      borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    }}>
      <div style={{
        width: 36, height: 36, background: '#1a1a2e', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700,
      }}>
        {customer.first_name.charAt(0)}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>
          {customer.first_name} {customer.last_name}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone}</div>
      </div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: PlanBalance }) {
  return (
    <div style={{
      background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
      border: '1px solid #bfdbfe',
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{plan.name}</div>
      <div style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>
        Balance: {fmt(plan.balance)} · Target: {fmt(plan.target_amount)}
      </div>
    </div>
  );
}

const sh: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1a1a2e' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
};
const errBox: React.CSSProperties = {
  background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
  borderRadius: 8, fontSize: 13, margin: '12px 0', border: '1px solid #fecaca',
};
const primaryBtn: React.CSSProperties = {
  padding: '12px 24px', background: '#1a1a2e', color: '#fff', border: 'none',
  borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14,
};
const backBtn: React.CSSProperties = {
  padding: '12px 20px', background: '#f1f5f9', color: '#475569', border: 'none',
  borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14,
};
