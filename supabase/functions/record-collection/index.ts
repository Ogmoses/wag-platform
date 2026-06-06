// supabase/functions/record-collection/index.ts
// WAG ENTERPRISES — Record Collection Edge Function
// Server-authoritative collection recording with full validation
// Uses SERVICE ROLE — bypasses RLS to write the immutable ledger

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_SINGLE_TX     = 100_000;
const MAX_DAILY_TOTAL   = 500_000;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // ── Parse body
    const { customer_id, plan_id, amount, method, notes, agent_id } = await req.json();

    // ── Basic validation
    if (!customer_id || !plan_id || !amount || !agent_id) {
      return json({ error: 'Missing required fields.' }, 400);
    }

    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      return json({ error: 'Amount must be a positive number.' }, 400);
    }
    if (amt > MAX_SINGLE_TX) {
      return json({ error: `Single transaction limit is ₦${MAX_SINGLE_TX.toLocaleString()}.` }, 400);
    }

    // ── Verify agent exists and is active
    const { data: rep, error: repErr } = await supabase
      .from('representatives')
      .select('id, is_active, confirmed_count')
      .eq('id', agent_id)
      .single();

    if (repErr || !rep) return json({ error: 'Agent not found.' }, 404);
    if (!rep.is_active) return json({ error: 'Agent account is inactive.' }, 403);

    // ── Verify customer exists and is active
    const { data: cust, error: custErr } = await supabase
      .from('customers')
      .select('id, is_active')
      .eq('id', customer_id)
      .single();

    if (custErr || !cust) return json({ error: 'Customer not found.' }, 404);
    if (!cust.is_active) return json({ error: 'Customer account is inactive.' }, 403);

    // ── Verify plan exists and is active
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id, status, customer_id')
      .eq('id', plan_id)
      .single();

    if (planErr || !plan) return json({ error: 'Plan not found.' }, 404);
    if (plan.status !== 'active') return json({ error: 'Plan is not active.' }, 400);
    if (plan.customer_id !== customer_id) return json({ error: 'Plan does not belong to this customer.' }, 400);

    // ── Check agent daily limit
    const today = new Date().toISOString().split('T')[0];
    const { data: todayTxs } = await supabase
      .from('transactions')
      .select('amount')
      .eq('agent_id', agent_id)
      .eq('type', 'deposit')
      .gte('created_at', today);

    const todayTotal = (todayTxs ?? []).reduce((s, t) => s + Number(t.amount), 0);
    if (todayTotal + amt > MAX_DAILY_TOTAL) {
      return json({
        error: `Daily collection limit reached. Today: ₦${todayTotal.toLocaleString()}, Limit: ₦${MAX_DAILY_TOTAL.toLocaleString()}.`,
      }, 400);
    }

    // ── Check agent per-tx limit from rep_daily_limits
    const { data: limits } = await supabase
      .from('rep_daily_limits')
      .select('max_single_tx, max_daily_total')
      .eq('representative_id', agent_id)
      .single();

    const singleLimit = Number(limits?.max_single_tx ?? MAX_SINGLE_TX);
    const dailyLimit  = Number(limits?.max_daily_total ?? MAX_DAILY_TOTAL);

    if (amt > singleLimit) {
      return json({ error: `Transaction exceeds your single-transaction limit of ₦${singleLimit.toLocaleString()}.` }, 400);
    }
    if (todayTotal + amt > dailyLimit) {
      return json({ error: `Transaction would exceed your daily limit of ₦${dailyLimit.toLocaleString()}.` }, 400);
    }

    // ── Off-hours check (6am–10pm WAT = UTC+1)
    const nowWAT = new Date(Date.now() + 60 * 60 * 1000);
    const hour   = nowWAT.getUTCHours();
    if (hour < 6 || hour >= 22) {
      // Flag but do NOT block (just create fraud flag server-side)
      await supabase.from('fraud_flags').insert({
        type: 'OFF_HOURS_COLLECTION',
        severity: 'low',
        user_id: agent_id,
        plan_id,
        description: `Collection recorded at ${hour}:00 WAT (outside 06:00–22:00)`,
      });
    }

    // ── Generate unique reference
    const ref = `WAG-TX-${Math.floor(10000 + Math.random() * 90000)}`;

    // ── Insert transaction (immutable ledger append)
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        ref,
        type: 'deposit',
        amount: amt,
        plan_id,
        customer_id,
        agent_id,
        method: method ?? 'Cash',
        notes: notes ?? null,
        status: 'confirmed',
      })
      .select()
      .single();

    if (txErr || !tx) {
      return json({ error: `Transaction insert failed: ${txErr?.message}` }, 500);
    }

    // ── Increment rep confirmed_count
    await supabase
      .from('representatives')
      .update({ confirmed_count: (rep.confirmed_count ?? 0) + 1 })
      .eq('id', agent_id);

    // ── Write audit log
    await supabase.from('audit_log').insert({
      action:      'deposit',
      user_id:     agent_id,
      user_role:   'representative',
      description: `[SERVER] Collected ₦${amt} — Ref: ${ref}`,
      amount:      amt,
      plan_id,
    });

    // ── Get updated balance
    const { data: balData } = await supabase
      .from('plan_balances')
      .select('balance, name')
      .eq('plan_id', plan_id)
      .single();

    return json({
      success: true,
      ref,
      amount: amt,
      plan_name: balData?.name ?? '—',
      new_balance: Number(balData?.balance ?? 0),
      transaction_id: tx.id,
    });
  } catch (err) {
    console.error('[record-collection]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
