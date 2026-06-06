// src/features/representative/AssignedCustomers.tsx
// WAG ENTERPRISES — Customer Search & Disbursement Approval for Representatives
// Representatives search customers, view their plans, and approve disbursements

import React, { useState, useCallback } from 'react';
import { db } from '../../lib/supabase';
import { fmt, fmtDate, normPhone } from '../../utils/helpers';
import { approveDisbursement, rejectDisbursement } from '../../lib/disbursement';
import type { PlanBalance } from '../../types/plan';
import type { DisbursementWithContext } from '../../types/disbursement';
import type { RepresentativeSession } from '../../types/representative';
import { DISBURSEMENT_STATUS_CONFIG } from '../../types/disbursement';

interface Props {
  rep: RepresentativeSession;
  onRefresh: () => void;
}

interface FoundCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export default function AssignedCustomers({ rep, onRefresh }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<FoundCustomer | null>(null);
  const [plans, setPlans] = useState<PlanBalance[]>([]);
  const [disbursements, setDisbursements] = useState<DisbursementWithContext[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanBalance | null>(null);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    setCustomer(null);
    setPlans([]);
    setDisbursements([]);
    setActionMsg('');

    try {
      // Try phone first, then email
      const normalised = normPhone(q);
      const isPhone = /^\+234/.test(normalised) || /^0[7-9]/.test(q);

      let custData: FoundCustomer | null = null;

      if (isPhone) {
        const { data } = await db
          .from('customers')
          .select('id, first_name, last_name, phone, email, is_active, created_at')
          .eq('phone', normalised)
          .single();
        custData = data ?? null;
      }

      // If phone search failed, try exact email
      if (!custData) {
        const { data } = await db
          .from('customers')
          .select('id, first_name, last_name, phone, email, is_active, created_at')
          .ilike('email', q)
          .single();
        custData = data ?? null;
      }

      // If still not found, fuzzy name search
      if (!custData) {
        const { data } = await db
          .from('customers')
          .select('id, first_name, last_name, phone, email, is_active, created_at')
          .ilike('last_name', `%${q}%`)
          .limit(1)
          .single();
        custData = data ?? null;
      }

      if (!custData) { setNotFound(true); return; }

      setCustomer(custData);

      // Load their active plans with balances
      const { data: planData } = await db
        .from('plan_balances')
        .select('*')
        .eq('customer_id', custData.id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      setPlans(planData ?? []);

      // Load pending disbursements
      const { data: disbData } = await db
        .from('pending_disbursements')
        .select('*')
        .eq('customer_id', custData.id)
        .order('requested_at', { ascending: false });

      setDisbursements(disbData ?? []);
    } finally {
      setSearching(false);
    }
  }, [query]);

  async function handleApprove(disb: DisbursementWithContext) {
    setActionLoading(disb.id);
    setActionMsg('');
    try {
      await approveDisbursement(rep, {
        disbursement_id: disb.id,
        plan_id: disb.plan_id,
        amount: disb.amount,
        customer_id: disb.customer_id,
      });
      setActionMsg(`✅ Payout of ${fmt(disb.amount)} approved and marked paid.`);
      // Refresh disbursements
      const { data } = await db
        .from('pending_disbursements')
        .select('*')
        .eq('customer_id', disb.customer_id);
      setDisbursements(data ?? []);
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(`❌ ${err instanceof Error ? err.message : 'Approval failed.'}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(disb: DisbursementWithContext) {
    const reason = prompt('Reason for rejection (optional):') ?? '';
    setActionLoading(disb.id);
    try {
      await rejectDisbursement(rep.id, 'representative', {
        disbursement_id: disb.id,
        reason,
      });
      setActionMsg(`Payout request rejected.`);
      const { data } = await db
        .from('pending_disbursements')
        .select('*')
        .eq('customer_id', disb.customer_id);
      setDisbursements(data ?? []);
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(`❌ ${err instanceof Error ? err.message : 'Rejection failed.'}`);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
        Customer Search
      </h2>

      {/* Search box */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Search by phone, email, or last name…"
          style={{
            flex: 1, padding: '12px 16px', border: '1px solid #e2e8f0',
            borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff',
          }}
        />
        <button onClick={search} disabled={searching || !query.trim()} style={{
          padding: '12px 20px', background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
        }}>
          {searching ? '…' : '🔍 Search'}
        </button>
      </div>

      {notFound && (
        <div style={{
          background: '#fef9c3', color: '#92400e', padding: '12px 16px',
          borderRadius: 10, fontSize: 14, border: '1px solid #fde68a', marginBottom: 16,
        }}>
          No customer found matching "{query}". Try their full phone number.
        </div>
      )}

      {actionMsg && (
        <div style={{
          background: actionMsg.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
          color: actionMsg.startsWith('✅') ? '#059669' : '#dc2626',
          padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 16,
          border: `1px solid ${actionMsg.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {actionMsg}
        </div>
      )}

      {customer && (
        <>
          {/* Customer card */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 20,
            marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 48, height: 48, background: '#1a1a2e', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 18,
              }}>
                {customer.first_name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#1a1a2e' }}>
                  {customer.first_name} {customer.last_name}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{customer.phone}</div>
                {customer.email && (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{customer.email}</div>
                )}
              </div>
              <span style={{
                marginLeft: 'auto',
                background: customer.is_active ? '#dcfce7' : '#fee2e2',
                color: customer.is_active ? '#059669' : '#dc2626',
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              }}>
                {customer.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Plans summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <MiniStat label="Total Plans" value={String(plans.length)} />
              <MiniStat label="Active" value={String(plans.filter(p=>p.status==='active').length)} />
              <MiniStat
                label="Total Balance"
                value={fmt(plans.reduce((s,p)=>s+Number(p.balance),0))}
              />
            </div>
          </div>

          {/* Plans list */}
          {plans.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                Savings Plans
              </h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {plans.map((plan) => {
                  const pct = Math.min(100, Math.round((Number(plan.balance)/Number(plan.target_amount))*100));
                  return (
                    <div key={plan.plan_id} style={{
                      background: '#fff', borderRadius: 12, padding: '14px 16px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{plan.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {plan.frequency} · Due {fmtDate(plan.maturity_date)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>{fmt(plan.balance)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>of {fmt(plan.target_amount)}</div>
                        </div>
                      </div>
                      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                        <div style={{
                          height: '100%', borderRadius: 2, width: `${pct}%`,
                          background: pct >= 100 ? '#059669' : '#2563eb',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending disbursements */}
          {disbursements.filter(d=>d.status==='pending').length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                Pending Payout Requests
              </h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {disbursements.filter(d=>d.status==='pending').map((disb) => {
                  const cfg = DISBURSEMENT_STATUS_CONFIG[disb.status];
                  const isLoading = actionLoading === disb.id;
                  const sufficient = Number(disb.plan_balance ?? 0) >= Number(disb.amount);
                  return (
                    <div key={disb.id} style={{
                      background: '#fff', borderRadius: 12, padding: '16px',
                      border: '1px solid #fef3c7', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>
                            {fmt(disb.amount)}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {disb.type === 'emergency' ? '🚨 Emergency' : '🎯 Milestone'}
                            {' · '}{disb.plan_name} · {fmtDate(disb.requested_at)}
                          </div>
                          {disb.reason && (
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, fontStyle: 'italic' }}>
                              "{disb.reason}"
                            </div>
                          )}
                        </div>
                        <span style={{
                          background: cfg.bgColor, color: cfg.color,
                          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          alignSelf: 'flex-start',
                        }}>{cfg.label}</span>
                      </div>

                      {/* Balance check */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 12,
                        padding: '8px 10px', background: sufficient ? '#f0fdf4' : '#fef2f2',
                        borderRadius: 6, marginBottom: 10,
                      }}>
                        <span style={{ color: '#64748b' }}>Plan balance:</span>
                        <span style={{ fontWeight: 600, color: sufficient ? '#059669' : '#dc2626' }}>
                          {fmt(disb.plan_balance ?? 0)} {!sufficient && '⚠️ Insufficient'}
                        </span>
                      </div>

                      {sufficient && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <button
                            onClick={() => handleApprove(disb)}
                            disabled={isLoading}
                            style={{
                              padding: '10px 0', background: isLoading ? '#94a3b8' : '#059669',
                              color: '#fff', border: 'none', borderRadius: 8,
                              fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 13,
                            }}
                          >
                            {isLoading ? '…' : '✅ Approve & Pay'}
                          </button>
                          <button
                            onClick={() => handleReject(disb)}
                            disabled={isLoading}
                            style={{
                              padding: '10px 0', background: '#fef2f2', color: '#dc2626',
                              border: '1px solid #fecaca', borderRadius: 8,
                              fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 13,
                            }}
                          >
                            {isLoading ? '…' : '❌ Reject'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>{value}</div>
    </div>
  );
}
