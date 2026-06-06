// src/types/plan.ts
// WAG ENTERPRISES — Savings Plan Domain Types

export type PlanFrequency = 'Daily' | 'Weekly' | 'Monthly';
export type PlanStatus = 'active' | 'completed' | 'deleted';

export interface Plan {
  id: string;
  customer_id: string;
  name: string;
  frequency: PlanFrequency;
  target_amount: number;
  regular_contribution: number;
  maturity_date: string;
  status: PlanStatus;
  milestone_shown: boolean;
  created_at: string;
}

/** Plan with computed live balance — from plan_balances view */
export interface PlanBalance extends Plan {
  plan_id: string;          // Alias for id in the view
  balance: number;
  deposit_count: number;
  last_deposit_at: string | null;
}

/** Create plan payload — from customer dashboard modal */
export interface CreatePlanPayload {
  name: string;
  frequency: PlanFrequency;
  target_amount: number;
  regular_contribution: number;
  opening_contribution: number;
  maturity_date: string;
}

/** New plan form state */
export interface NewPlanForm {
  name: string;
  frequency: PlanFrequency | '';
  target_amount: string;
  regular_contribution: string;
  opening_contribution: string;
  maturity_date: string;
}

/** Computed schedule info for the plan detail UI */
export interface PlanScheduleInfo {
  expected: number;          // Expected number of contributions so far
  label: string;             // 'daily' | 'weekly' | 'monthly'
  expectedTotal: number;     // Expected total contribution amount
  missed: number;            // Number of missed contributions
  isOverdue: boolean;
  percentComplete: number;
  isDone: boolean;
}

/** Plan progress summary card */
export interface PlanSummaryCard {
  plan_id: string;
  name: string;
  balance: number;
  target_amount: number;
  percent_complete: number;
  status: PlanStatus;
  frequency: PlanFrequency;
  maturity_date: string;
  is_overdue: boolean;
  missed_contributions: number;
}
