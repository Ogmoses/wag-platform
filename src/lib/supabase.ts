// src/lib/supabase.ts
// WAG ENTERPRISES — Supabase Client Singleton
// Single source of truth for all Supabase access

import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

// ─────────────────────────────────────────
// Environment configuration
// ─────────────────────────────────────────
const SUPABASE_URL  = (window as any).SUPABASE_URL  || import.meta?.env?.VITE_SUPABASE_URL  || '';
const SUPABASE_ANON = (window as any).SUPABASE_ANON || import.meta?.env?.VITE_SUPABASE_ANON || '';

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('[WAG] Supabase credentials not configured. Database calls will fail.');
}

// ─────────────────────────────────────────
// Typed database schema (generated from migrations)
// ─────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      customers: {
        Row: import('../types/customer').Customer;
        Insert: Omit<import('../types/customer').Customer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<import('../types/customer').Customer>;
      };
      representatives: {
        Row: import('../types/representative').Representative;
        Insert: Omit<import('../types/representative').Representative, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<import('../types/representative').Representative>;
      };
      plans: {
        Row: import('../types/plan').Plan;
        Insert: Omit<import('../types/plan').Plan, 'id' | 'created_at'>;
        Update: Partial<import('../types/plan').Plan>;
      };
      transactions: {
        Row: import('../types/transaction').Transaction;
        Insert: Omit<import('../types/transaction').Transaction, 'id' | 'created_at'>;
        Update: never;   // Immutable — no updates from app
      };
      disbursements: {
        Row: import('../types/disbursement').Disbursement;
        Insert: Omit<import('../types/disbursement').Disbursement, 'id' | 'requested_at'>;
        Update: Partial<Pick<import('../types/disbursement').Disbursement,
          'status' | 'confirmed_by' | 'confirmed_at' | 'stage_history'>>;
      };
      audit_log: {
        Row: import('../types/audit').AuditLog;
        Insert: Omit<import('../types/audit').AuditLog, 'id' | 'created_at'>;
        Update: never;   // Immutable
      };
      fraud_flags: {
        Row: import('../types/fraud').FraudFlag;
        Insert: Omit<import('../types/fraud').FraudFlag, 'id' | 'created_at'>;
        Update: Partial<Pick<import('../types/fraud').FraudFlag, 'resolved'>>;
      };
      activation_tokens: {
        Row: {
          id: string; token: string; used: boolean;
          used_by: string | null; used_at: string | null;
          expires_at: string; generated_by: string; generated_at: string;
        };
        Insert: { token: string; generated_by?: string; expires_at?: string };
        Update: { used: boolean; used_by?: string; used_at?: string };
      };
    };
    Views: {
      plan_balances: {
        Row: import('../types/plan').PlanBalance;
      };
      pending_disbursements: {
        Row: import('../types/disbursement').DisbursementWithContext;
      };
      rep_today_collections: {
        Row: import('../types/representative').RepTodaySummary;
      };
    };
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_cost?: number; p_max?: number; p_refill?: number };
        Returns: number;
      };
    };
  };
}

// ─────────────────────────────────────────
// Client singleton
// ─────────────────────────────────────────
let _client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.warn('[WAG] Supabase not configured');
    return {} as SupabaseClient<Database>;
  }
  try {
    _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });
  } catch (e) {
    console.error('[WAG] Supabase init failed:', e);
    return {} as SupabaseClient<Database>;
  }
  return _client;
}

export const db = getSupabaseClient();

// ─────────────────────────────────────────
// Health check — verify connection
// ─────────────────────────────────────────
export async function checkDbConnection(): Promise<boolean> {
  try {
    const { error } = await db.from('customers').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────
// Auth helpers re-exported
// ─────────────────────────────────────────
export type { Session, User };

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && !SUPABASE_URL.includes('YOUR_') &&
                 SUPABASE_ANON && !SUPABASE_ANON.includes('YOUR_'));
}
