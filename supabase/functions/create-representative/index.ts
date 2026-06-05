// supabase/functions/create-representative/index.ts
// WAG ENTERPRISES — Create Representative Edge Function
// Validates activation token, hashes PIN, creates rep record

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

function genRepId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { first_name, last_name, phone, email, pin, activation_token } = await req.json();

    // ── Validate fields
    if (!first_name || !last_name || !phone || !pin || !activation_token) {
      return json({ error: 'All fields including activation_token are required.' }, 400);
    }

    // ── Validate PIN
    if (!/^\d{4,8}$/.test(pin)) {
      return json({ error: 'PIN must be 4–8 digits.' }, 400);
    }

    // ── Normalise phone
    const digits = phone.replace(/\D/g, '');
    let normPhone = '';
    if (digits.length === 11 && digits[0] === '0') normPhone = '+234' + digits.slice(1);
    else if (digits.length === 13 && digits.startsWith('234')) normPhone = '+' + digits;
    else normPhone = '+234' + digits;

    // ── Validate activation token
    const tokenVal = activation_token.trim().toUpperCase();
    const { data: token, error: tokenErr } = await supabase
      .from('activation_tokens')
      .select('id, used, expires_at')
      .eq('token', tokenVal)
      .single();

    if (tokenErr || !token) return json({ error: 'Invalid activation token.' }, 400);
    if (token.used) return json({ error: 'Activation token has already been used.' }, 400);
    if (new Date(token.expires_at) < new Date()) {
      return json({ error: 'Activation token has expired. Request a new one from admin.' }, 400);
    }

    // ── Check duplicate phone
    const { data: existingRep } = await supabase
      .from('representatives')
      .select('id')
      .eq('phone', normPhone)
      .limit(1);

    if (existingRep && existingRep.length > 0) {
      return json({ error: 'A representative with this phone is already registered.' }, 409);
    }

    // ── Generate unique rep_id
    let repId = genRepId();
    for (let i = 0; i < 10; i++) {
      const { data: exists } = await supabase
        .from('representatives')
        .select('id')
        .eq('rep_id', repId)
        .limit(1);
      if (!exists || exists.length === 0) break;
      repId = genRepId();
    }

    // ── Hash PIN
    const pinHash = await bcrypt.hash(pin, await bcrypt.genSalt(BCRYPT_ROUNDS));

    // ── Insert representative
    const { data: rep, error: insertErr } = await supabase
      .from('representatives')
      .insert({
        first_name:      first_name.trim(),
        last_name:       last_name.trim(),
        phone:           normPhone,
        email:           (email ?? '').trim().toLowerCase(),
        pin_hash:        pinHash,
        rep_id:          repId,
        confirmed_count: 0,
        is_active:       true,
      })
      .select('id, first_name, last_name, phone, email, rep_id, confirmed_count, is_active, created_at')
      .single();

    if (insertErr || !rep) {
      return json({ error: `Registration failed: ${insertErr?.message}` }, 500);
    }

    // ── Mark token used
    await supabase
      .from('activation_tokens')
      .update({ used: true, used_by: rep.id, used_at: new Date().toISOString() })
      .eq('id', token.id);

    // ── Insert daily limits
    await supabase.from('rep_daily_limits').insert({
      representative_id: rep.id,
      max_single_tx:     100_000,
      max_daily_total:   500_000,
    }).onConflict('representative_id').ignore();

    // ── Audit
    await supabase.from('audit_log').insert({
      action:      'token_used',
      user_id:     rep.id,
      user_role:   'representative',
      description: `[SERVER] Representative registered: ${rep.first_name} ${rep.last_name} — Agent ID: ${repId}`,
    });

    return json({ success: true, rep });
  } catch (err) {
    console.error('[create-representative]', err);
    return json({ error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
