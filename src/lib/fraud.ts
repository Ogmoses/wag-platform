// src/lib/fraud.ts
// WAG ENTERPRISES — Fraud Detection Library
// Client-side fraud flagging helpers

import { db } from './supabase';
import type { FraudFlag, FraudSeverity, FraudType } from '../types/fraud';
import { computeAgentScore, scoreLabel, scoreColor } from '../types/fraud';

// ─────────────────────────────────────────
// FLAG FRAUD
// ─────────────────────────────────────────
interface FlagFraudPayload {
  type: FraudType;
  severity: FraudSeverity;
  user_id: string;
  plan_id?: string | null;
  description: string;
}

export async function flagFraud(payload: FlagFraudPayload): Promise<void> {
  try {
    // Only insert if no unresolved flag of this type exists for this user
    const { data: existing } = await db
      .from('fraud_flags')
      .select('id')
      .eq('type', payload.type)
      .eq('user_id', payload.user_id)
      .eq('resolved', false)
      .limit(1);

    if (existing && existing.length > 0) return;  // Already flagged

    await db.from('fraud_flags').insert({
      type: payload.type,
      severity: payload.severity,
      user_id: payload.user_id,
      plan_id: payload.plan_id ?? null,
      description: payload.description,
      resolved: false,
    });
  } catch (e) {
    console.warn('[WAG Fraud] Flag insert failed:', e);
  }
}

// ─────────────────────────────────────────
// COLLECTION FRAUD CHECKS
// ─────────────────────────────────────────
export async function checkLargeCollection(
  amount: number,
  agentId: string,
  planId: string
): Promise<void> {
  if (amount > 50_000) {
    await flagFraud({
      type: 'LARGE_SINGLE_TX',
      severity: 'medium',
      user_id: agentId,
      plan_id: planId,
      description: `Unusually large collection of ₦${amount.toLocaleString()} by agent`,
    });
  }
}

export async function checkRepDailyVolume(
  agentId: string,
  newAmount: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const { data: txs } = await db
    .from('transactions')
    .select('amount')
    .eq('agent_id', agentId)
    .eq('type', 'deposit')
    .gte('created_at', today);

  const dailyTotal = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0);
  if (dailyTotal + newAmount > 500_000) {
    await flagFraud({
      type: 'LARGE_DAILY_VOLUME',
      severity: 'high',
      user_id: agentId,
      description: `Agent daily total ₦${(dailyTotal + newAmount).toLocaleString()} would exceed ₦500,000 limit`,
    });
  }
}

// ─────────────────────────────────────────
// AGENT SCORE
// ─────────────────────────────────────────
export async function getAgentScore(repId: string): Promise<{
  score: number;
  label: string;
  color: string;
}> {
  const { data } = await db
    .from('fraud_flags')
    .select('severity')
    .eq('user_id', repId)
    .eq('resolved', false);

  const score = computeAgentScore((data ?? []) as Pick<FraudFlag, 'severity'>[]);
  return { score, label: scoreLabel(score), color: scoreColor(score) };
}

// ─────────────────────────────────────────
// READ FRAUD FLAGS (admin)
// ─────────────────────────────────────────
export async function getUnresolvedFlags(): Promise<FraudFlag[]> {
  const { data, error } = await db
    .from('fraud_flags')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load fraud flags: ${error.message}`);
  return data ?? [];
}

export async function resolveFlag(flagId: string): Promise<void> {
  const { error } = await db
    .from('fraud_flags')
    .update({ resolved: true })
    .eq('id', flagId);

  if (error) throw new Error(`Failed to resolve flag: ${error.message}`);
}
