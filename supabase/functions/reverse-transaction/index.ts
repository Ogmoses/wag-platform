// supabase/functions/reverse-transaction/index.ts
// WAG ENTERPRISES — Reverse Transaction Edge Function
// Admin-only: creates a compensating withdrawal entry in the ledger
// NEVER deletes or modifies the original transaction

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_PIN_HASH   = Deno.env.get('WAG_ADMIN_PIN_HASH')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { transaction_id, reason, admin_id } = await req.json();

    if (!transaction_id || !reason || !admin_id) {
      return json({ error: 'transaction_id, reason, and admin_id are required.' }, 400);
    }

    // ── Load original transaction
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txErr || !tx) return json({ error: 'Transaction not found.' }, 404);

    // ── Only deposit/opening types can be reversed
    if (!['deposit', 'opening'].includes(tx.type)) {
      return json({ error: `Only deposit and opening transactions can be reversed. This is a "${tx.type}".` }, 400);
    }

    // ── Already reversed?
    if (tx.status === 'reversed') {
      return json({ error: 'This transaction has already been reversed.' }, 400);
    }

    // ── Check balance would not go negative
    const { data: balData } = await supabase
      .from('plan_balances')
      .select('balance')
      .eq('plan_id', tx.plan_id)
      .single();

    const balance = Number(balData?.balance ?? 0);
    if (balance < tx.amount) {
      return json({
        error: `Cannot reverse: plan balance (₦${balance.toLocaleString()}) is less than transaction amount (₦${tx.amount.toLocaleString()}).`,
      }, 400);
    }

    // ── Create compensating withdrawal transaction
    const reversalRef = `WAG-REV-${transaction_id.substring(0, 8).toUpperCase()}`;

    const { error: revErr } = await supabase.from('transactions').insert({
      ref:         reversalRef,
      type:        'withdrawal',
      amount:      tx.amount,
      plan_id:     tx.plan_id,
      customer_id: tx.customer_id,
      agent_id:    null,
      method:      'Reversal',
      notes:       `REVERSAL of ${tx.ref} — Reason: ${reason}`,
      status:      'confirmed',
    });

    if (revErr) return json({ error: `Reversal insert failed: ${revErr.message}` }, 500);

    // ── Mark original transaction as reversed
    await supabase
      .from('transactions')
      .update({ status: 'reversed' })
      .eq('id', transaction_id);

    // ── Audit log
    await supabase.from('audit_log').insert({
      action:      'withdrawal',
      user_id:     admin_id,
      user_role:   'admin',
      description: `[SERVER] Transaction reversed — Original: ${tx.ref} — Reversal: ${reversalRef} — Reason: ${reason}`,
      amount:      tx.amount,
      plan_id:     tx.plan_id,
    });

    // ── Security event
    await supabase.from('security_events').insert({
      event_type: 'suspicious_activity',
      user_id:    admin_id,
      user_role:  'admin',
      metadata:   { original_ref: tx.ref, reversal_ref: reversalRef, reason },
    });

    return json({
      success:      true,
      reversal_ref: reversalRef,
      original_ref: tx.ref,
      amount:       tx.amount,
    });
  } catch (err) {
    console.error('[reverse-transaction]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
