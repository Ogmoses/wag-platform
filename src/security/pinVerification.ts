// src/security/pinVerification.ts
// WAG ENTERPRISES — PIN Verification Module

import { hashPin } from '../utils/helpers';
import { validatePin } from '../lib/security';
import { db } from '../lib/supabase';
import { logSecurityEvent } from '../lib/security';

// ─────────────────────────────────────────
// PIN VERIFICATION
// Verifies a user-entered PIN against stored hash
// ─────────────────────────────────────────

export interface PinVerifyResult {
  valid: boolean;
  error?: string;
}

/** Verify a customer PIN by phone */
export async function verifyCustomerPin(
  phone: string,
  pin: string
): Promise<PinVerifyResult> {
  const validation = validatePin(pin);
  if (!validation.valid) return { valid: false, error: validation.error };

  const pinHash = await hashPin(pin);

  const { data, error } = await db
    .from('customers')
    .select('id, pin_hash, is_active')
    .eq('phone', phone)
    .single();

  if (error || !data) return { valid: false, error: 'Customer not found.' };
  if (!data.is_active) return { valid: false, error: 'Account is inactive.' };
  if (data.pin_hash !== pinHash) return { valid: false, error: 'Incorrect PIN.' };

  return { valid: true };
}

/** Verify a representative PIN by rep_id */
export async function verifyRepPin(
  repId: string,
  pin: string
): Promise<PinVerifyResult> {
  const pinHash = await hashPin(pin);

  const { data, error } = await db
    .from('representatives')
    .select('id, pin_hash, is_active')
    .eq('rep_id', repId)
    .single();

  if (error || !data) return { valid: false, error: 'Representative not found.' };
  if (!data.is_active) return { valid: false, error: 'Account is deactivated.' };
  if (data.pin_hash !== pinHash) return { valid: false, error: 'Incorrect PIN.' };

  return { valid: true };
}

// ─────────────────────────────────────────
// PIN CHANGE
// ─────────────────────────────────────────
export async function changeCustomerPin(
  customerId: string,
  currentPin: string,
  newPin: string
): Promise<PinVerifyResult> {
  const newValidation = validatePin(newPin);
  if (!newValidation.valid) return { valid: false, error: newValidation.error };

  const currentHash = await hashPin(currentPin);
  const { data, error } = await db
    .from('customers')
    .select('pin_hash')
    .eq('id', customerId)
    .single();

  if (error || !data) return { valid: false, error: 'Customer not found.' };
  if (data.pin_hash !== currentHash) return { valid: false, error: 'Current PIN is incorrect.' };
  if (currentPin === newPin) return { valid: false, error: 'New PIN must differ from current PIN.' };

  const newHash = await hashPin(newPin);
  const { error: updateErr } = await db
    .from('customers')
    .update({ pin_hash: newHash })
    .eq('id', customerId);

  if (updateErr) return { valid: false, error: 'Failed to update PIN.' };

  await logSecurityEvent({
    event_type: 'pin_reset_completed',
    user_id: customerId,
    user_role: 'customer',
    metadata: {},
  });

  return { valid: true };
}

export async function changeRepPin(
  repId: string,
  currentPin: string,
  newPin: string
): Promise<PinVerifyResult> {
  const newValidation = validatePin(newPin);
  if (!newValidation.valid) return { valid: false, error: newValidation.error };

  const currentHash = await hashPin(currentPin);
  const { data, error } = await db
    .from('representatives')
    .select('pin_hash, id')
    .eq('id', repId)
    .single();

  if (error || !data) return { valid: false, error: 'Representative not found.' };
  if (data.pin_hash !== currentHash) return { valid: false, error: 'Current PIN is incorrect.' };
  if (currentPin === newPin) return { valid: false, error: 'New PIN must differ from current PIN.' };

  const newHash = await hashPin(newPin);
  const { error: updateErr } = await db
    .from('representatives')
    .update({ pin_hash: newHash })
    .eq('id', repId);

  if (updateErr) return { valid: false, error: 'Failed to update PIN.' };

  await logSecurityEvent({
    event_type: 'pin_reset_completed',
    user_id: repId,
    user_role: 'representative',
    metadata: {},
  });

  return { valid: true };
}
