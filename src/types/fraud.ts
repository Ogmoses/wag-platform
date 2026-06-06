// src/types/fraud.ts
// WAG ENTERPRISES — Fraud Detection Types

export type FraudSeverity = 'low' | 'medium' | 'high';

export type FraudType =
  | 'LARGE_SINGLE_TX'
  | 'RAPID_COLLECTIONS'
  | 'EXCESS_EMERGENCY'
  | 'FAILED_PIN_ATTEMPTS'
  | 'LARGE_DAILY_VOLUME'
  | 'ROUND_AMOUNT_PATTERN'
  | 'OFF_HOURS_COLLECTION'
  | 'RAPID_PLAN_CREATION'
  | string;   // extensible

export interface FraudFlag {
  id: string;
  type: FraudType;
  severity: FraudSeverity;
  user_id: string;
  plan_id: string | null;
  description: string;
  resolved: boolean;
  created_at: string;
}

export interface FraudRule {
  id: string;
  rule_name: string;
  description: string;
  threshold: number | null;
  period_hours: number | null;
  severity: FraudSeverity;
  is_active: boolean;
  updated_at: string;
}

/** Display config for fraud flag cards in admin UI */
export const FRAUD_SEVERITY_CONFIG: Record<
  FraudSeverity,
  { color: string; bgColor: string; borderColor: string; label: string }
> = {
  low:    { color: '#92400e', bgColor: '#fef3c7', borderColor: '#d97706', label: 'LOW' },
  medium: { color: '#92400e', bgColor: '#fed7aa', borderColor: '#ea580c', label: 'MEDIUM' },
  high:   { color: '#991b1b', bgColor: '#fee2e2', borderColor: '#dc2626', label: 'HIGH' },
};

/** Fraud summary for admin dashboard */
export interface FraudSummary {
  total_unresolved: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  flags: FraudFlag[];
}

/** Agent reliability score */
export interface AgentReliabilityScore {
  representative_id: string;
  score: number;      // 0–100
  label: string;
  color: string;
  flag_count: number;
}

/** Compute agent score from fraud flags */
export function computeAgentScore(flags: Pick<FraudFlag, 'severity'>[]): number {
  let score = 100;
  for (const f of flags) {
    if (f.severity === 'high')   score -= 15;
    else if (f.severity === 'medium') score -= 8;
    else score -= 3;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number): 'excellent' | 'good' | 'needs review' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  return 'needs review';
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--green)';
  if (score >= 60) return 'var(--yellow)';
  return 'var(--red)';
}
