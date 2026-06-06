// src/features/customer/CustomerDisbursements.tsx
// WAG ENTERPRISES — Customer Disbursements

import React, { useState, useEffect, useCallback } from 'react';
import { getCustomerDisbursements, requestDisbursement } from '../../lib/disbursement';
import { getCustomerPlans } from '../../lib/ledger';
import { fmt, fmtDate } from '../../utils/helpers';
import { rateLimitDisbursementRequest } from '../../security/rateLimit';
import type { Disbursement, DisbursementType } from '../../types/disbursement';
import type { PlanBalance } from '../../types/plan';
import { DISBURSEMENT_STATUS_CONFIG, DISBURSEMENT_STAGES } from '../../types/disbursement';

interface Props { customerId: string; onRefresh?: () => void; }

export default function CustomerDisbursements({ customerId, onRefresh }: Props) {
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [plans, setPlans] = useState<PlanBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [selected, setSelected] = useState<Disbursement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [disbs, planData] = await Promise.all([
        getCustomerDisbursements(customerId),
        getCustomerPlans(customerId),
      ]);
      setDisbursements(disbs);
      setPlans(planData.filter((p) => p.status === 'active' && Number(p.balance) > 0));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Payouts</h2>
        <button onClick={() => setShowRequest(true)} style={{
          padding: '8px 16px', background: '#059669', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>Request Payout</button>
      </div>

      {loading ? (
        <Spinner />
      ) : disbursements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>💸</div>
          <p>No payout requests yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {disbursements.map((d) => {
            const cfg = DISBURSEMENT_STATUS_CONFIG[d.status];
            return (
              <div key={d.id} onClick={() => setSelected(d)} style={{
                background: '#fff', borderRadius: 12, padding: '16px 18px',
                cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                border: `1px solid ${cfg.bgColor}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>
                      {fmt(d.amount)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {d.type === 'emergency' ? '🚨 Emergency' : '🎯 Milestone'} · {fmtDate(d.requested_at)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{d.ref}</div>
                  </div>
                  <span style={{
                    background: cfg.bgColor, color: cfg.color,
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  }}>{cfg.label}</span>
                </div>

                {/* Stage progress bar */}
                {d.status !== 'rejected' && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                    {DISBURSEMENT_STAGES.map((stage, i) => {
                      const active = DISBURSEMENT_STAGES.indexOf(d.status as any) >= i;
                      return (
                        <div key={stage} style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: active ? cfg.color : '#e2e8f0',
                          transition: 'background 0.3s',
                        }} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showRequest && (
        <RequestModal
          plans={plans}
          customerId={customerId}
          onSuccess={() => { setShowRequest(false); load(); onRefresh?.(); }}
          onClose={() => setShowRequest(false)}
        />
      )}

      {selected && (
        <DetailModal disb={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// REQUEST MODAL
// ─────────────────────────────────────────
function RequestModal({
  plans, customerId, onSuccess, onClose,
}: {
  plans: PlanBalance[];
  customerId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [planId, setPlanId] = useState('');
  const [type, setType] = useState<DisbursementType>('emergency');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedPlan = plans.find((p) => p.plan_id === planId);
  const maxAmount = selectedPlan ? Number(selectedPlan.balance) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const rl = rateLimitDisbursementRequest(customerId);
    if (!rl.allowed) { setError(rl.message); return; }

    if (!planId) return setError('Select a plan.');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return setError('Enter a valid amount.');
    if (amt > maxAmount) return setError(`Exceeds plan balance of ${fmt(maxAmount)}.`);
    if (!reason.trim()) return setError('Please provide a reason for this request.');

    setLoading(true);
    try {
      await requestDisbursement(customerId, { plan_id: planId, type, amount: amt, reason });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>
        <ModalHeader title="Request Payout" onClose={onClose} />
        <form onSubmit={handleSubmit}>
          <Field label="Select Plan">
            <select value={planId} onChange={e=>setPlanId(e.target.value)} style={inp}>
              <option value="">Choose a plan…</option>
              {plans.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.name} — Balance: {fmt(p.balance)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Payout Type">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['emergency','milestone'] as DisbursementType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} style={{
                  padding: '10px 0', border: `2px solid ${type === t ? '#1a1a2e' : '#e2e8f0'}`,
                  borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13,
                  background: type === t ? '#1a1a2e' : '#fff',
                  color: type === t ? '#fff' : '#64748b',
                }}>
                  {t === 'emergency' ? '🚨 Emergency' : '🎯 Milestone'}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Amount (₦) — Max: ${fmt(maxAmount)}`}>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              style={inp} placeholder="0" min="1" max={maxAmount} />
          </Field>

          <Field label="Reason">
            <textarea value={reason} onChange={e=>setReason(e.target.value)}
              style={{ ...inp, minHeight: 72, resize: 'vertical' }}
              placeholder="Briefly explain the reason for this payout request…" />
          </Field>

          {error && <div style={errBox}>{error}</div>}

          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────
function DetailModal({ disb, onClose }: { disb: Disbursement; onClose: () => void }) {
  const cfg = DISBURSEMENT_STATUS_CONFIG[disb.status];
  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>
        <ModalHeader title="Payout Detail" onClose={onClose} />
        <div style={{ display: 'grid', gap: 10 }}>
          <InfoRow label="Amount" value={fmt(disb.amount)} bold />
          <InfoRow label="Type" value={disb.type === 'emergency' ? '🚨 Emergency' : '🎯 Milestone'} />
          <InfoRow label="Reference" value={disb.ref} mono />
          <InfoRow label="Status" value={cfg.label} color={cfg.color} />
          <InfoRow label="Requested" value={fmtDate(disb.requested_at)} />
          {disb.confirmed_at && <InfoRow label="Confirmed" value={fmtDate(disb.confirmed_at)} />}
          {disb.reason && <InfoRow label="Reason" value={disb.reason} />}
        </div>

        {/* Stage history */}
        {disb.stage_history && disb.stage_history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
              STAGE HISTORY
            </div>
            {disb.stage_history.map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid #f1f5f9',
                fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: DISBURSEMENT_STATUS_CONFIG[s.stage as any]?.color ?? '#94a3b8',
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{s.stage}</span>
                <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
                  {fmtDate(s.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared sub-components
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{title}</h3>
      <button onClick={onClose} style={{
        background: '#f1f5f9', border: 'none', width: 30, height: 30,
        borderRadius: '50%', cursor: 'pointer', fontSize: 16,
      }}>×</button>
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
function InfoRow({ label, value, bold, mono, color }: {
  label: string; value: string; bold?: boolean; mono?: boolean; color?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? 'monospace' : 'inherit',
        color: color ?? '#1a1a2e',
      }}>{value}</span>
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

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const inp: React.CSSProperties = {
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
