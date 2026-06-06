// supabase/functions/create-customer/index.ts
// WAG ENTERPRISES — Create Customer Edge Function
// Handles registration with server-side PIN hashing via bcrypt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BCRYPT_ROUNDS    = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const {
      first_name, last_name, phone, email, address, pin,
    } = await req.json();

    // ── Validate required fields
    if (!first_name || !last_name || !phone || !pin) {
      return json({ error: 'first_name, last_name, phone, and pin are required.' }, 400);
    }

    // ── Normalise phone
    const digits = phone.replace(/\D/g, '');
    let normPhone = '';
    if (digits.length === 11 && digits[0] === '0') normPhone = '+234' + digits.slice(1);
    else if (digits.length === 13 && digits.startsWith('234')) normPhone = '+' + digits;
    else normPhone = '+234' + digits;

    // ── Validate PIN
    if (!/^\d{4,8}$/.test(pin)) {
      return json({ error: 'PIN must be 4–8 digits.' }, 400);
    }
    if (/^(.)\1+$/.test(pin)) {
      return json({ error: 'PIN cannot be all the same digit.' }, 400);
    }

    // ── Check duplicate phone
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', normPhone)
      .limit(1);

    if (existing && existing.length > 0) {
      return json({ error: 'This phone number is already registered.' }, 409);
    }

    // ── Hash PIN with bcrypt (server-side — never send hash to client)
    const pinHash = await bcrypt.hash(pin, await bcrypt.genSalt(BCRYPT_ROUNDS));

    // ── Insert customer
    const { data: customer, error: insertErr } = await supabase
      .from('customers')
      .insert({
        first_name: first_name.trim(),
        last_name:  last_name.trim(),
        phone:      normPhone,
        email:      (email ?? '').trim().toLowerCase(),
        address:    (address ?? '').trim(),
        pin_hash:   pinHash,
        is_active:  true,
        kyc_status: 'pending',
      })
      .select('id, first_name, last_name, phone, email, is_active, kyc_status, created_at')
      .single();

    if (insertErr || !customer) {
      return json({ error: `Registration failed: ${insertErr?.message}` }, 500);
    }

    // ── Audit
    await supabase.from('audit_log').insert({
      action:      'plan_created',
      user_id:     customer.id,
      user_role:   'customer',
      description: `[SERVER] Customer registered: ${customer.first_name} ${customer.last_name} (${normPhone})`,
    });

    return json({ success: true, customer });
  } catch (err) {
    console.error('[create-customer]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
