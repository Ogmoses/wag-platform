// supabase/functions/approve-disbursement/index.ts
// WAG ENTERPRISES — Approve Disbursement Edge Function
// Server-authoritative: verifies balance, updates status, creates payout transaction

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { disbursement_id, actor_id, actor_role } = await req.json();

    if (!disbursement_id || !actor_id) {
      return json({ error: 'Missing required fields.' }, 400);
    }

    // ── Load disbursement
    const { data: disb, error: disbErr } = await supabase
      .from('disbursements')
      .select('*')
      .eq('id', disbursement_id)
      .single();

    if (disbErr || !disb) return json({ error: 'Disbursement not found.' }, 404);
    if (disb.status !== 'pending') {
      return json({ error: `Cannot approve: disbursement is already "${disb.status}".` }, 400);
    }

    // ── Verify actor role
    if (!['representative', 'admin'].includes(actor_role ?? '')) {
      return json({ error: 'Only representatives or admins can approve disbursements.' }, 403);
    }

    // ── Re-verify plan balance (server-side, no trust client)
    const { data: balData } = await supabase
      .from('plan_balances')
      .select('balance, name')
      .eq('plan_id', disb.plan_id)
      .single();

    const balance = Number(balData?.balance ?? 0);
    if (balance < disb.amount) {
      return json({
        error: `Insufficient balance. Available: ₦${balance.toLocaleString()}, Requested: ₦${disb.amount.toLocaleString()}.`,
      }, 400);
    }

    // ── Update disbursement to paid
    const updatedHistory = [
      ...(disb.stage_history ?? []),
      { stage: 'paid', timestamp: new Date().toISOString(), by: actor_id },
    ];

    const { error: updateErr } = await supabase
      .from('disbursements')
      .update({
        status:       'paid',
        confirmed_by: actor_id,
        confirmed_at: new Date().toISOString(),
        stage_history: updatedHistory,
      })
      .eq('id', disbursement_id)
      .eq('status', 'pending');  // Optimistic lock

    if (updateErr) return json({ error: `Update failed: ${updateErr.message}` }, 500);

    // ── Create payout transaction in ledger
    const payRef = `WAG-PAY-${disbursement_id.substring(0, 8).toUpperCase()}`;
    const { error: txErr } = await supabase.from('transactions').insert({
      ref:         payRef,
      type:        'payout',
      amount:      disb.amount,
      plan_id:     disb.plan_id,
      customer_id: disb.customer_id,
      agent_id:    actor_role === 'representative' ? actor_id : null,
      method:      'Disbursement',
      notes:       `Disbursement ${disb.ref} — ${disb.type} — approved by ${actor_role}`,
      status:      'confirmed',
    });

    if (txErr) {
      console.error('[approve-disbursement] Payout tx insert failed:', txErr);
      // Don't fail — disbursement status already updated
    }

    // ── Audit
    await supabase.from('audit_log').insert({
      action:      'approve',
      user_id:     actor_id,
      user_role:   actor_role ?? 'representative',
      description: `[SERVER] Disbursement ${disb.ref} approved & paid — ₦${disb.amount}`,
      amount:      disb.amount,
      plan_id:     disb.plan_id,
    });

    // ── Update rep confirmed_count if rep
    if (actor_role === 'representative') {
      const { data: rep } = await supabase
        .from('representatives')
        .select('confirmed_count')
        .eq('id', actor_id)
        .single();
      if (rep) {
        await supabase.from('representatives')
          .update({ confirmed_count: (rep.confirmed_count ?? 0) + 1 })
          .eq('id', actor_id);
      }
    }

    return json({
      success: true,
      payout_ref: payRef,
      amount: disb.amount,
      new_balance: balance - disb.amount,
    });
  } catch (err) {
    console.error('[approve-disbursement]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
