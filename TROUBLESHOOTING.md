# WAG Platform — Troubleshooting Guide

---

## Problem 1: Blank white page after deploy to GitHub Pages

**Symptom:** The site URL loads but shows nothing. Browser console shows 404 errors for JS/CSS files.

**Cause:** The `base` in `vite.config.ts` does not match your repository name.

**Fix:**
```ts
// vite.config.ts
export default defineConfig({
  base: '/YOUR_EXACT_REPO_NAME/',   // ← must match GitHub repo name character for character
  ...
})
```

If your repo is `wag-platform`, use `/wag-platform/`. If it is `WAG-Platform`, use `/WAG-Platform/`.

---

## Problem 2: "Supabase not configured" banner appears on the live site

**Symptom:** A red warning banner appears at the top of the page saying Supabase is not configured.

**Cause:** The GitHub Actions secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON` are not set, or are set incorrectly.

**Fix:**
1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Confirm both secrets exist with the correct names (exactly as above — case sensitive)
3. Delete and re-create them if you are unsure about the values
4. Re-run the GitHub Actions workflow (Actions tab → re-run last workflow)

---

## Problem 3: Login says "Invalid phone or PIN" even with correct credentials

**Symptom:** A customer registered successfully but cannot log in.

**Cause (most likely):** The PIN was hashed with SHA-256 during registration (client-side) but the stored hash does not match because of a phone normalisation mismatch.

**Diagnosis:** Run this in the Supabase SQL editor:
```sql
SELECT id, phone, LEFT(pin_hash, 10) AS hash_preview
FROM customers
WHERE phone LIKE '%YOUR_TEST_PHONE%';
```
Check that the phone is stored as `+234XXXXXXXXXX` format, not `0XXXXXXXXXX`.

**Fix:** The registration form normalises via `normPhone()`. If the phone was inserted manually or via the old schema without normalisation, update it:
```sql
UPDATE customers
SET phone = '+234' || SUBSTRING(phone, 2)
WHERE phone LIKE '0%';
```

---

## Problem 4: RLS error — "new row violates row-level security policy"

**Symptom:** An insert or update returns a Postgres RLS error.

**Cause:** The action being attempted is not permitted for the current session's role. This is correct behaviour — RLS is working.

**Common triggers:**
- A customer trying to insert a plan for a different customer_id
- A representative trying to insert a transaction without agent_id = their own ID
- An unauthenticated request (anon key) hitting a table that now requires authentication

**Fix for development:** Check that the session is set correctly and that the `user_id` in the session matches the row being inserted.

**Fix for production bugs:** Check the `security_events` and `audit_log` tables for context, then review `006_rls_policies.sql` to see the exact policy governing that table and operation.

---

## Problem 5: Edge function returns 500 with "Internal server error"

**Symptom:** Calling an edge function (e.g. record-collection) returns a 500 error.

**Cause options:**
1. A Supabase secret is missing or wrong
2. The function code has a runtime error
3. The Deno runtime threw an unhandled exception

**Diagnosis:** Go to Supabase → Edge Functions → select the function → Logs. The full Deno error message is there.

**Most common fix:** The `SUPABASE_SERVICE_ROLE_KEY` secret is wrong or not set.
```bash
supabase secrets list
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key_here
# Then redeploy:
supabase functions deploy record-collection
```

---

## Problem 6: "This token has already been used" when rep tries to register

**Symptom:** A representative enters a valid token but gets a "used" error.

**Cause:** Either the token was actually used, or the `used_at` timestamp was set incorrectly.

**Fix — generate a new token** (admin SQL editor or admin dashboard):
```sql
INSERT INTO activation_tokens (token, generated_by, expires_at)
VALUES ('WAGE-NEWTOKEN', 'admin', NOW() + INTERVAL '7 days');
```

---

## Problem 7: GitHub Actions build fails with "tsc: error"

**Symptom:** The workflow fails at the "Type check" step.

**Cause:** A TypeScript type error in your source code.

**Fix:** Run `npx tsc --noEmit` locally to see the exact error, then fix it before pushing.

If you want to skip type checking during the build temporarily (not recommended for production):
```yaml
# In .github/workflows/deploy.yml, comment out:
# - name: Type check
#   run: npx tsc --noEmit
```

---

## Problem 8: Tests fail in CI but pass locally

**Symptom:** `npm test` passes on your machine but the GitHub Actions "Run test suite" step fails.

**Cause:** Usually a missing global mock (e.g. `crypto`, `localStorage`) that works in your Node version but not in the CI environment.

**Fix:** Make sure `tests/setup.ts` mocks everything that the tests depend on from the browser environment. The `crypto` mock is already included, but check if tests are accessing any other browser APIs.

---

## Problem 9: Collections record but balance does not update in customer dashboard

**Symptom:** A representative records a collection, the receipt shows the new balance, but the customer's plan card still shows the old balance.

**Cause:** The `plan_balances` view is computed in real time but the customer dashboard may be using a stale in-memory state.

**Fix:** The `load()` function in `CustomerDashboard.tsx` needs to be called after the collection is confirmed. This is already wired up via `onSuccess → load()`. If it is not refreshing:
1. Check that `onSuccess` is being called in `RecordCollection.tsx` after the receipt step
2. Check that the customer is looking at the right plan (phone number matches)

---

## Problem 10: GitHub Pages shows old version after deploying

**Symptom:** You push changes but the live site still shows the previous version.

**Cause:** Browser or CDN caching.

**Fix:**
1. Hard-refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Open the site in an incognito window
3. Check the GitHub Actions tab to confirm the latest workflow ran and deployed successfully
4. Vite's build uses content-hashed filenames, so once the browser fetches the new `index.html`, it will pull the new assets automatically

---

## Problem 11: Supabase free plan — "project paused" after inactivity

**Symptom:** The site stops working and Supabase shows "Project paused".

**Cause:** Supabase free tier pauses projects after 1 week of inactivity.

**Fix options:**
1. Visit your Supabase dashboard and click "Restore project" (takes ~2 minutes)
2. Upgrade to the Pro plan ($25/month) to disable automatic pausing
3. Set up a cron job (e.g. via GitHub Actions schedule) that pings your Supabase URL every few days to keep it active

**Recommended cron ping** — add to `.github/workflows/keep-alive.yml`:
```yaml
name: Keep Supabase alive
on:
  schedule:
    - cron: '0 12 * * 1'   # Every Monday at noon UTC
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s ${{ secrets.VITE_SUPABASE_URL }}/rest/v1/ -o /dev/null
```

---

## Problem 12: CORS error when calling Supabase from the live site

**Symptom:** Browser console shows `Access-Control-Allow-Origin` error. API calls fail.

**Cause:** Your GitHub Pages domain is not in the Supabase CORS allowed list.

**Fix:**
1. Go to Supabase → Project Settings → API → CORS
2. Add: `https://YOUR_USERNAME.github.io`
3. Save and wait ~30 seconds for it to propagate

---

## Useful Supabase SQL queries for debugging

```sql
-- See last 20 audit events
SELECT action, user_role, description, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;

-- See unresolved fraud flags
SELECT type, severity, description, created_at
FROM fraud_flags
WHERE resolved = FALSE
ORDER BY created_at DESC;

-- Check a customer's plan balance
SELECT plan_id, name, balance, target_amount, status
FROM plan_balances
WHERE customer_id = 'CUSTOMER_UUID_HERE';

-- Verify RLS policies are in place
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check failed login attempts in last hour
SELECT event_type, user_role, ip_address, created_at
FROM security_events
WHERE event_type IN ('login_failed', 'pin_failed')
  AND created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- List active activation tokens
SELECT token, expires_at, generated_at
FROM activation_tokens
WHERE used = FALSE AND expires_at > NOW()
ORDER BY generated_at DESC;
```
