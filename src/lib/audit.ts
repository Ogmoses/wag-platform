// src/lib/audit.ts
// WAG ENTERPRISES — Audit Log Library

import { db } from './supabase';
import type { AuditLog, AuditAction, AuditLogFilters, UserRole } from '../types/audit';

// ─────────────────────────────────────────
// WRITE AUDIT LOG
// ─────────────────────────────────────────
interface WriteAuditPayload {
  action: AuditAction | string;
  user_id: string | null;
  user_role: UserRole | string;
  description: string;
  amount?: number | null;
  plan_id?: string | null;
}

export async function writeAuditLog(payload: WriteAuditPayload): Promise<void> {
  try {
    await db.from('audit_log').insert({
      action: payload.action,
      user_id: payload.user_id,
      user_role: payload.user_role,
      description: payload.description,
      amount: payload.amount ?? null,
      plan_id: payload.plan_id ?? null,
    });
  } catch (e) {
    // Audit logging must never crash the application
    console.warn('[WAG Audit] Failed to write audit log:', e);
  }
}

// ─────────────────────────────────────────
// READ AUDIT LOG (admin)
// ─────────────────────────────────────────
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  let query = db
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.action) {
    query = query.eq('action', filters.action);
  }
  if (filters.user_role) {
    query = query.eq('user_role', filters.user_role);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load audit log: ${error.message}`);
  return data ?? [];
}

export function filterAuditLogs(logs: AuditLog[], search: string): AuditLog[] {
  if (!search.trim()) return logs;
  const q = search.toLowerCase();
  return logs.filter(
    (e) =>
      e.description?.toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q) ||
      e.user_role?.toLowerCase().includes(q) ||
      e.user_id?.toLowerCase().includes(q)
  );
}

// ─────────────────────────────────────────
// ACTION COLOR MAPPING (for UI display)
// ─────────────────────────────────────────
export function getAuditActionColor(action: string): string {
  const map: Record<string, string> = {
    deposit:              '#2563eb',
    opening:              '#2563eb',
    payout:               '#d97706',
    withdrawal:           '#d97706',
    approve:              '#059669',
    disbursement_paid:    '#059669',
    reject:               '#dc2626',
    disbursement_rejected:'#dc2626',
    elevate:              '#7c3aed',
    role_changed:         '#7c3aed',
    delete:               '#dc2626',
    plan_deleted:         '#dc2626',
    flag:                 '#dc2626',
    fraud_resolved:       '#059669',
    login:                '#6b7280',
    logout:               '#6b7280',
    plan_created:         '#2563eb',
    token_generated:      '#7c3aed',
    account_locked:       '#dc2626',
    account_unlocked:     '#059669',
    pin_reset_completed:  '#059669',
  };
  return map[action] ?? '#6b7280';
}
