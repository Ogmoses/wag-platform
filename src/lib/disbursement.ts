// src/lib/disbursement.ts
// WAG ENTERPRISES — Disbursement Library
// All disbursement request, approval, and rejection operations

import { db } from './supabase';
import { writeAuditLog } from './audit';
import { flagFraud } from './fraud';
import { genRef } from '../utils/helpers';
import type {
  Disbursement,
  DisbursementWithContext,
  RequestDisbursementPayload,
  ApproveDisbursementPayload,
  RejectDisbursementPayload,
} from '../types/disbursement';
import type { RepresentativeSession } from '../types/representative';

// ─────────────────────────────────────────
// READ OPERATIONS
// ─────────────────────────────────────────

export async function getCustomerDisbursements(customerId: string): Promise<Disbursement[]> {
  const { data, error } = await db
    .from('disbursements')
    .select('*')
    .eq('customer_id', customerId)
    .order('requested_at', { ascending: false });

  if (error) throw new Error(`Failed to load disbursements: ${error.message}`);
  return data ?? [];
}

export async function getPendingDisbursementsForCustomer(
  customerId: string
): Promise<DisbursementWithContext[]> {
  const { data, error } = await db
    .from('pending_disbursements')
    .select('*')
    .eq('customer_id', customerId)
    .order('requested_at', { ascending: false });

  if (error) throw new Error(`Failed to load disbursements: ${error.message}`);
  return data ?? [];
}

export async function getAllPendingDisbursements(): Promise<DisbursementWithContext[]> {
  const { data, error } = await db
    .from('pending_disbursements')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) throw new Error(`Failed to load pending disbursements: ${error.message}`);
  return data ?? [];
}

// ─────────────────────────────────────────
// REQUEST DISBURSEMENT (Customer action)
// ─────────────────────────────────────────
export async function requestDisbursement(
  customerId: string,
  payload: RequestDisbursementPayload
): Promise<Disbursement> {
  // Verify plan balance is sufficient
  const { data: planBal } = await db
    .from('plan_balances')
    .select('balance, name')
    .eq('plan_id', payload.plan_id)
    .single();

  if (!planBal) throw new Error('Plan not found.');

  const balance = Number(planBal.balance ?? 0);
  if (payload.amount > balance) {
    throw new Error(
      `Requested amount ₦${payload.amount.toLocaleString()} exceeds plan balance of ₦${balance.toLocaleString()}.`
    );
  }

  const ref = genRef();
  const stageHistory = [
    { stage: 'pending', timestamp: new Date().toISOString(), by: customerId },
  ];

  const { data, error } = await db
    .from('disbursements')
    .insert({
      customer_id: customerId,
      plan_id: payload.plan_id,
      type: payload.type,
      amount: payload.amount,
      reason: payload.reason ?? null,
      ref,
      status: 'pending',
      stage_history: stageHistory,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Disbursement request failed: ${error?.message}`);

  // Fraud check: excess emergency requests
  if (payload.type === 'emergency') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from('disbursements')
      .select('id')
      .eq('customer_id', customerId)
      .eq('type', 'emergency')
      .gte('requested_at', since);

    if (recent && recent.length >= 3) {
      await flagFraud({
        type: 'EXCESS_EMERGENCY',
        severity: 'high',
        user_id: customerId,
        plan_id: payload.plan_id,
        description: `${recent.length} emergency requests in 30 days`,
      });
    }
  }

  await writeAuditLog({
    action: 'disbursement_request',
    user_id: customerId,
    user_role: 'customer',
    description: `${payload.type} payout request of ₦${payload.amount} — PENDING — Ref: ${ref}`,
    amount: payload.amount,
    plan_id: payload.plan_id,
  });

  return data;
}

// ─────────────────────────────────────────
// APPROVE DISBURSEMENT (Representative / Admin action)
// Note: DB trigger creates the payout transaction automatically
// ─────────────────────────────────────────
export async function approveDisbursement(
  rep: RepresentativeSession,
  payload: ApproveDisbursementPayload
): Promise<void> {
  // Re-verify balance before approval
  const { data: planBal } = await db
    .from('plan_balances')
    .select('balance')
    .eq('plan_id', payload.plan_id)
    .single();

  const balance = Number(planBal?.balance ?? 0);
  if (payload.amount > balance) {
    throw new Error(
      `Insufficient plan balance. Available: ₦${balance.toLocaleString()}, Requested: ₦${payload.amount.toLocaleString()}`
    );
  }

  const { error } = await db
    .from('disbursements')
    .update({
      status: 'paid',
      confirmed_by: rep.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', payload.disbursement_id)
    .eq('status', 'pending');   // Optimistic locking — only update if still pending

  if (error) throw new Error(`Approval failed: ${error.message}`);

  // Update rep confirmed_count
  await db
    .from('representatives')
    .update({ confirmed_count: (rep.confirmed_count ?? 0) + 1 })
    .eq('id', rep.id);

  await writeAuditLog({
    action: 'approve',
    user_id: rep.id,
    user_role: 'representative',
    description: `Approved & paid ₦${payload.amount} disbursement — DisbID: ${payload.disbursement_id}`,
    amount: payload.amount,
    plan_id: payload.plan_id,
  });
}

// ─────────────────────────────────────────
// REJECT DISBURSEMENT (Representative / Admin action)
// ─────────────────────────────────────────
export async function rejectDisbursement(
  actorId: string,
  actorRole: 'representative' | 'admin',
  payload: RejectDisbursementPayload
): Promise<void> {
  const { data: disb, error: fetchErr } = await db
    .from('disbursements')
    .select('amount, plan_id, ref')
    .eq('id', payload.disbursement_id)
    .single();

  if (fetchErr || !disb) throw new Error('Disbursement not found.');

  const { error } = await db
    .from('disbursements')
    .update({ status: 'rejected' })
    .eq('id', payload.disbursement_id)
    .in('status', ['pending', 'approved']);

  if (error) throw new Error(`Rejection failed: ${error.message}`);

  await writeAuditLog({
    action: 'reject',
    user_id: actorId,
    user_role: actorRole,
    description: `Rejected disbursement — Ref: ${disb.ref}${payload.reason ? ' — Reason: ' + payload.reason : ''}`,
    amount: disb.amount,
    plan_id: disb.plan_id,
  });
}
