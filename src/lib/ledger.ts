// src/lib/ledger.ts
// WAG ENTERPRISES — Ledger Library
// All transaction and plan balance operations
// IMMUTABLE: insert only, no updates to transactions

import { db } from './supabase';
import { writeAuditLog } from './audit';
import { genRef } from '../utils/helpers';
import type {
  Transaction, RecordCollectionPayload, CollectionReceipt, TransactionFilters
} from '../types/transaction';
import type { Plan, PlanBalance, CreatePlanPayload } from '../types/plan';
import type { CustomerSession } from '../types/customer';
import type { RepresentativeSession } from '../types/representative';

// ─────────────────────────────────────────
// PLAN OPERATIONS
// ─────────────────────────────────────────

export async function getCustomerPlans(customerId: string): Promise<PlanBalance[]> {
  const { data, error } = await db
    .from('plan_balances')
    .select('*')
    .eq('customer_id', customerId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  return data ?? [];
}

export async function getPlanBalance(planId: string): Promise<PlanBalance | null> {
  const { data, error } = await db
    .from('plan_balances')
    .select('*')
    .eq('plan_id', planId)
    .single();

  if (error) return null;
  return data;
}

export async function createPlan(
  customer: CustomerSession,
  payload: CreatePlanPayload
): Promise<Plan> {
  const { data: plan, error } = await db
    .from('plans')
    .insert({
      customer_id: customer.id,
      name: payload.name,
      frequency: payload.frequency as any,
      target_amount: payload.target_amount,
      regular_contribution: payload.regular_contribution,
      maturity_date: payload.maturity_date,
      status: 'active',
      milestone_shown: false,
    })
    .select()
    .single();

  if (error || !plan) throw new Error(`Failed to create plan: ${error?.message}`);

  // Record opening contribution transaction
  const ref = genRef();
  const { error: txErr } = await db.from('transactions').insert({
    ref,
    type: 'opening',
    amount: payload.opening_contribution,
    plan_id: plan.id,
    customer_id: customer.id,
    agent_id: null,
    method: 'Opening',
    notes: `Plan created: ${payload.name}`,
    status: 'confirmed',
  });

  if (txErr) throw new Error(`Plan created but opening transaction failed: ${txErr.message}`);

  await writeAuditLog({
    action: 'plan_created',
    user_id: customer.id,
    user_role: 'customer',
    description: `Created plan "${payload.name}" with opening ₦${payload.opening_contribution} — Ref: ${ref}`,
    amount: payload.opening_contribution,
    plan_id: plan.id,
  });

  return plan;
}

export async function softDeletePlan(planId: string, customerId: string, planName: string): Promise<void> {
  const { error } = await db
    .from('plans')
    .update({ status: 'deleted' })
    .eq('id', planId)
    .eq('customer_id', customerId);

  if (error) throw new Error(`Failed to delete plan: ${error.message}`);

  await writeAuditLog({
    action: 'delete',
    user_id: customerId,
    user_role: 'customer',
    description: `Deleted plan "${planName}"`,
    plan_id: planId,
  });
}

export async function markMilestoneShown(planId: string): Promise<void> {
  await db.from('plans').update({ milestone_shown: true }).eq('id', planId);
}

// ─────────────────────────────────────────
// TRANSACTION OPERATIONS
// ─────────────────────────────────────────

export async function getPlanTransactions(
  planId: string,
  filters: TransactionFilters = {}
): Promise<Transaction[]> {
  let query = db
    .from('transactions')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false });

  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type);
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load transactions: ${error.message}`);
  return data ?? [];
}

export async function getRepTransactions(repId: string): Promise<Transaction[]> {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('agent_id', repId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to load rep transactions: ${error.message}`);
  return data ?? [];
}

// ─────────────────────────────────────────
// COLLECTION RECORDING (Representative action)
// ─────────────────────────────────────────
export async function recordCollection(
  rep: RepresentativeSession,
  payload: RecordCollectionPayload
): Promise<CollectionReceipt> {
  const ref = genRef();

  // Insert deposit transaction (immutable ledger append)
  const { error: txErr } = await db.from('transactions').insert({
    ref,
    type: 'deposit',
    amount: payload.amount,
    plan_id: payload.plan_id,
    customer_id: payload.customer_id,
    agent_id: rep.id,
    method: payload.method,
    notes: payload.notes ?? null,
    status: 'confirmed',
  });

  if (txErr) throw new Error(`Collection failed: ${txErr.message}`);

  // Update rep confirmed count
  await db
    .from('representatives')
    .update({ confirmed_count: (rep.confirmed_count ?? 0) + 1 })
    .eq('id', rep.id);

  // Get updated balance
  const planBal = await getPlanBalance(payload.plan_id);

  await writeAuditLog({
    action: 'deposit',
    user_id: rep.id,
    user_role: 'representative',
    description: `Collected ₦${payload.amount} — Ref: ${ref}`,
    amount: payload.amount,
    plan_id: payload.plan_id,
  });

  return {
    ref,
    amount: payload.amount,
    plan_name: planBal?.name ?? '—',
    customer_name: '—',    // Caller fills this in from repFoundCust
    agent_id: rep.rep_id,
    agent_name: `${rep.first_name} ${rep.last_name}`,
    method: payload.method,
    new_balance: Number(planBal?.balance ?? 0),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────
// BALANCE CALCULATION (client-side, for schedule engine)
// ─────────────────────────────────────────
export function getScheduleInfo(
  plan: Pick<Plan, 'created_at' | 'frequency' | 'regular_contribution'>,
  balance: number
): { expected: number; label: string; expectedTotal: number; missed: number } {
  const start  = new Date(plan.created_at);
  const today  = new Date();
  const days   = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
  let expected = 0;
  let label    = '';

  if (plan.frequency === 'Daily')        { expected = days;               label = 'daily'; }
  else if (plan.frequency === 'Weekly')  { expected = Math.floor(days/7); label = 'weekly'; }
  else if (plan.frequency === 'Monthly') { expected = Math.floor(days/30);label = 'monthly'; }

  const contrib      = Number(plan.regular_contribution) || 1000;
  const expectedTotal = expected * contrib;
  const missed       = Math.max(0, expected - Math.floor(balance / contrib));

  return { expected, label, expectedTotal, missed };
}
