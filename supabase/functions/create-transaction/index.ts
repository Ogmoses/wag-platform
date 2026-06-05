// supabase/functions/create-transaction/index.ts
// WAG ENTERPRISES — Generic Transaction Create Edge Function
// Used for opening transactions and admin-initiated entries
// All deposits by reps should use record-collection instead

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_TYPES = ['opening', 'deposit', 'payout', 'withdrawal'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const {
      type, amount, plan_id, customer_id,
      agent_id, method, notes, actor_id, actor_role,
    } = await req.json();

    // ── Validate
    if (!type || !amount || !plan_id || !customer_id) {
      return json({ error: 'type, amount, plan_id, and customer_id are required.' }, 400);
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return json({ error: `Invalid type. Allowed: ${ALLOWED_TYPES.join(', ')}` }, 400);
    }

    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      return json({ error: 'Amount must be a positive number.' }, 400);
    }
    if (amt > 10_000_000) {
      return json({ error: 'Amount exceeds ₦10,000,000 maximum.' }, 400);
    }

    // ── Verify plan
    const { data: plan } = await supabase
      .from('plans')
      .select('id, customer_id, status')
      .eq('id', plan_id)
      .single();

    if (!plan) return json({ error: 'Plan not found.' }, 404);
    if (plan.customer_id !== customer_id) {
      return json({ error: 'Plan does not belong to this customer.' }, 400);
    }

    // ── For withdrawals/payouts: check balance
    if (['payout', 'withdrawal'].includes(type)) {
      const { data: balData } = await supabase
        .from('plan_balances')
        .select('balance')
        .eq('plan_id', plan_id)
        .single();

      const balance = Number(balData?.balance ?? 0);
      if (balance < amt) {
        return json({
          error: `Insufficient balance. Available: ₦${balance.toLocaleString()}, Requested: ₦${amt.toLocaleString()}`,
        }, 400);
      }
    }

    // ── Generate reference
    const ref = `WAG-TX-${Math.floor(10000 + Math.random() * 90000)}`;

    // ── Insert
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        ref,
        type,
        amount:      amt,
        plan_id,
        customer_id,
        agent_id:    agent_id ?? null,
        method:      method ?? null,
        notes:       notes ?? null,
        status:      'confirmed',
      })
      .select()
      .single();

    if (txErr || !tx) {
      return json({ error: `Transaction failed: ${txErr?.message}` }, 500);
    }

    // ── Audit
    await supabase.from('audit_log').insert({
      action:      type,
      user_id:     actor_id ?? customer_id,
      user_role:   actor_role ?? 'customer',
      description: `[SERVER] ${type} — ₦${amt} — Ref: ${ref}`,
      amount:      amt,
      plan_id,
    });

    return json({ success: true, ref, transaction_id: tx.id, amount: amt });
  } catch (err) {
    console.error('[create-transaction]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
