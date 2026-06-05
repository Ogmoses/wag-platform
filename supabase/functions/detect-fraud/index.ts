// supabase/functions/detect-fraud/index.ts
// WAG ENTERPRISES — Server-side Fraud Detection Edge Function
// Called by other edge functions or a scheduled cron job

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FraudCheckResult {
  flagged: boolean;
  flags: { type: string; severity: string; description: string }[];
}

async function runFraudChecks(
  supabase: ReturnType<typeof createClient>,
  context: {
    agent_id?: string;
    customer_id?: string;
    amount?: number;
    plan_id?: string;
    tx_type?: string;
  }
): Promise<FraudCheckResult> {
  const flags: FraudCheckResult['flags'] = [];
  const { agent_id, customer_id, amount, plan_id } = context;

  // ── 1. LARGE_SINGLE_TX
  if (amount && amount > 50_000) {
    flags.push({
      type: 'LARGE_SINGLE_TX',
      severity: 'medium',
      description: `Single transaction ₦${amount.toLocaleString()} exceeds ₦50,000 threshold`,
    });
  }

  // ── 2. RAPID_COLLECTIONS (agent makes 10+ deposits in 1 hour)
  if (agent_id) {
    const since1h = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent_id)
      .eq('type', 'deposit')
      .gte('created_at', since1h);

    if ((count ?? 0) >= 10) {
      flags.push({
        type: 'RAPID_COLLECTIONS',
        severity: 'high',
        description: `Agent made ${count} collections in the last hour`,
      });
    }

    // ── 3. LARGE_DAILY_VOLUME
    const today = new Date().toISOString().split('T')[0];
    const { data: dayTxs } = await supabase
      .from('transactions')
      .select('amount')
      .eq('agent_id', agent_id)
      .eq('type', 'deposit')
      .gte('created_at', today);

    const dayTotal = (dayTxs ?? []).reduce((s, t) => s + Number(t.amount), 0);
    if (dayTotal + (amount ?? 0) > 500_000) {
      flags.push({
        type: 'LARGE_DAILY_VOLUME',
        severity: 'high',
        description: `Agent daily total ₦${(dayTotal + (amount ?? 0)).toLocaleString()} exceeds ₦500,000`,
      });
    }

    // ── 4. ROUND_AMOUNT_PATTERN (5+ round amounts in 24h)
    if (amount && amount % 1000 === 0) {
      const since24h = new Date(Date.now() - 86_400_000).toISOString();
      const { count: roundCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent_id)
        .eq('type', 'deposit')
        .gte('created_at', since24h)
        .filter('amount::numeric % 1000', 'eq', 0);

      if ((roundCount ?? 0) >= 5) {
        flags.push({
          type: 'ROUND_AMOUNT_PATTERN',
          severity: 'low',
          description: `${roundCount} round-amount transactions in 24 hours`,
        });
      }
    }
  }

  // ── 5. EXCESS_EMERGENCY (customer > 3 emergency requests in 30d)
  if (customer_id) {
    const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count: emergCount } = await supabase
      .from('disbursements')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer_id)
      .eq('type', 'emergency')
      .gte('requested_at', since30d);

    if ((emergCount ?? 0) >= 3) {
      flags.push({
        type: 'EXCESS_EMERGENCY',
        severity: 'high',
        description: `Customer has ${emergCount} emergency requests in 30 days`,
      });
    }
  }

  // ── 6. OFF_HOURS (6am–10pm WAT)
  const nowWAT = new Date(Date.now() + 3_600_000);
  const hour   = nowWAT.getUTCHours();
  if ((agent_id || customer_id) && (hour < 6 || hour >= 22)) {
    flags.push({
      type: 'OFF_HOURS_COLLECTION',
      severity: 'low',
      description: `Activity at ${hour}:00 WAT (outside 06:00–22:00)`,
    });
  }

  // ── Insert new flags (deduplicated)
  for (const flag of flags) {
    const userId = agent_id ?? customer_id ?? 'unknown';
    const { data: existing } = await supabase
      .from('fraud_flags')
      .select('id')
      .eq('type', flag.type)
      .eq('user_id', userId)
      .eq('resolved', false)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('fraud_flags').insert({
        type:        flag.type,
        severity:    flag.severity,
        user_id:     userId,
        plan_id:     plan_id ?? null,
        description: flag.description,
        resolved:    false,
      });
    }
  }

  return { flagged: flags.length > 0, flags };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const body = await req.json();
    const result = await runFraudChecks(supabase, body);
    return json(result);
  } catch (err) {
    console.error('[detect-fraud]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
