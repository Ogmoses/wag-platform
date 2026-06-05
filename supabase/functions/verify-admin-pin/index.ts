// supabase/functions/verify-admin-pin/index.ts
// WAG ENTERPRISES — Admin PIN Verification Edge Function
// The admin PIN is NEVER stored client-side or in frontend env vars.
// This function holds the bcrypt hash in Supabase Vault (WAG_ADMIN_PIN_HASH)
// and verifies the submitted PIN server-side only.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_PIN_HASH    = Deno.env.get('WAG_ADMIN_PIN_HASH') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limit for admin login
// Resets on cold start — good enough for the admin use case
const failMap = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS     = 5;
const LOCKOUT_MS       = 30 * 60 * 1000;  // 30 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';

  try {
    // ── Rate limit check
    const state = failMap.get(ip);
    if (state && state.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((state.lockedUntil - Date.now()) / 60_000);
      return json({
        valid: false,
        error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      }, 429);
    }

    const { pin } = await req.json();

    if (!pin || typeof pin !== 'string') {
      return json({ valid: false, error: 'PIN is required.' }, 400);
    }

    // Validate format — digits only
    if (!/^\d{4,8}$/.test(pin)) {
      return json({ valid: false, error: 'Invalid PIN format.' }, 400);
    }

    if (!ADMIN_PIN_HASH) {
      console.error('[verify-admin-pin] WAG_ADMIN_PIN_HASH secret is not set.');
      return json({ valid: false, error: 'Admin authentication is not configured.' }, 503);
    }

    // ── Verify PIN against stored bcrypt hash
    const valid = await bcrypt.compare(pin, ADMIN_PIN_HASH);

    if (!valid) {
      // Record failed attempt
      const current = failMap.get(ip) ?? { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCKOUT_MS;
      }
      failMap.set(ip, current);

      // Log to security_events
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
      await supabase.from('security_events').insert({
        event_type: 'pin_failed',
        user_id:    null,
        user_role:  'admin',
        ip_address: ip,
        metadata:   { attempt: current.count },
      }).catch(() => {});

      const remaining = Math.max(0, MAX_ATTEMPTS - current.count);
      return json({
        valid: false,
        error: remaining > 0
          ? `Incorrect PIN. ${remaining} attempt(s) remaining.`
          : 'Account locked due to too many failed attempts.',
        locked: remaining === 0,
      }, 401);
    }

    // ── Success — clear fail count
    failMap.delete(ip);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Log successful admin login
    await supabase.from('security_events').insert({
      event_type: 'pin_verified',
      user_id:    null,
      user_role:  'admin',
      ip_address: ip,
      metadata:   {},
    }).catch(() => {});

    await supabase.from('audit_log').insert({
      action:      'login',
      user_id:     'admin',
      user_role:   'admin',
      description: '[SERVER] Admin PIN verified — admin session started',
    }).catch(() => {});

    return json({
      valid: true,
      admin: {
        id:        'admin',
        email:     'admin@wag.internal',
        full_name: 'WAG Administrator',
        role:      'admin',
      },
    });
  } catch (err) {
    console.error('[verify-admin-pin]', err);
    return json({ valid: false, error: 'Internal server error.' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
