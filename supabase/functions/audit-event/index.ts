// supabase/functions/audit-event/index.ts
// WAG ENTERPRISES — Audit Event Edge Function
// Server-authoritative audit write — used when client cannot write directly

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ACTIONS = new Set([
  'login','logout','deposit','payout','opening','withdrawal',
  'approve','reject','elevate','delete','flag',
  'plan_created','plan_completed','plan_deleted',
  'disbursement_request','disbursement_approved','disbursement_paid','disbursement_rejected',
  'fraud_resolved','role_changed','account_locked','account_unlocked',
  'token_generated','pin_reset_requested','pin_reset_completed',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { action, user_id, user_role, description, amount, plan_id } = await req.json();

    if (!action || !description) {
      return json({ error: 'action and description are required.' }, 400);
    }

    if (!VALID_ACTIONS.has(action)) {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    const { data, error } = await supabase
      .from('audit_log')
      .insert({
        action,
        user_id:     user_id ?? null,
        user_role:   user_role ?? 'system',
        description: description.substring(0, 500),  // Truncate
        amount:      amount ?? null,
        plan_id:     plan_id ?? null,
      })
      .select('id')
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ success: true, id: data.id });
  } catch (err) {
    console.error('[audit-event]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
