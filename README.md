# WAG ENTERPRISES — Production Platform v2.0
## Complete Deployment & Migration Guide

---

## OVERVIEW

This is the complete production-grade rebuild of the WAG Enterprises thrift collection platform.
The existing UI is fully preserved. Only the underlying architecture has been replaced.

**What changed:**
- Permissive `anon_all` RLS policies → strict role-scoped policies
- No auth → PIN-based session authentication with lockout protection
- No audit trail → immutable audit log with DB triggers
- No fraud detection → multi-layer DB + application fraud checks
- No ledger constraints → balance checks, state machine, negative-balance prevention
- Client-side everything → server-authoritative edge functions for critical operations

**What is preserved:**
- All existing UI layout, branding, colors, and navigation flows
- All existing table structures (columns added, none removed)
- All existing customer and representative workflows
- Plan creation, collection recording, disbursement request flows

---

## PROJECT STRUCTURE

```
wag-platform/
├── .env.example                          # Environment template
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_auth_redesign.sql         # user_identities, session_tokens, PIN reset
│   │   ├── 002_roles.sql                 # Role enum, permissions table, helper functions
│   │   ├── 003_profiles.sql              # auth_id column on customers/reps, notifications
│   │   ├── 004_representative_assignments.sql  # Rep-customer assignments, daily limits
│   │   ├── 005_security_events.sql       # Security event log, rate limit buckets
│   │   ├── 006_rls_policies.sql          # All production RLS policies (replaces anon_all)
│   │   ├── 007_audit_triggers.sql        # Immutable audit trail, auto-audit triggers
│   │   ├── 008_ledger_constraints.sql    # Balance checks, negative-balance prevention
│   │   ├── 009_disbursement_workflow.sql # State machine, auto payout transaction
│   │   ├── 010_fraud_detection.sql       # DB-layer fraud rules and triggers
│   │   ├── 011_indexes.sql               # All performance indexes
│   │   └── 012_production_hardening.sql  # search_path lock, grants, timeouts
│   │
│   └── functions/
│       ├── record-collection/index.ts    # Server-authoritative collection recording
│       ├── approve-disbursement/index.ts # Server-authoritative disbursement approval
│       ├── create-customer/index.ts      # Registration with bcrypt PIN hashing
│       ├── create-representative/index.ts # Rep registration with token validation
│       ├── create-transaction/index.ts   # Generic ledger append (opening, admin)
│       ├── reverse-transaction/index.ts  # Admin-only transaction reversal
│       ├── detect-fraud/index.ts         # Server-side fraud detection
│       └── audit-event/index.ts          # Server-authoritative audit write
│
├── src/
│   ├── App.tsx                           # Root app router
│   │
│   ├── types/
│   │   ├── customer.ts
│   │   ├── representative.ts
│   │   ├── transaction.ts
│   │   ├── plan.ts
│   │   ├── disbursement.ts
│   │   ├── audit.ts
│   │   └── fraud.ts
│   │
│   ├── lib/
│   │   ├── supabase.ts                   # Typed client singleton
│   │   ├── auth.ts                       # Login, logout, session management
│   │   ├── roles.ts                      # Permission checks (mirrors RLS)
│   │   ├── security.ts                   # Security event logging, rate limit, sanitization
│   │   ├── ledger.ts                     # Plan and transaction operations
│   │   ├── disbursement.ts               # Disbursement request, approve, reject
│   │   ├── fraud.ts                      # Fraud flagging and score computation
│   │   └── audit.ts                      # Audit log read/write
│   │
│   ├── security/
│   │   ├── pinVerification.ts            # PIN verify and change
│   │   ├── lockoutProtection.ts          # Failed-attempt tracking and lockout
│   │   ├── sessionProtection.ts          # Idle timeout, cross-tab logout
│   │   ├── rateLimit.ts                  # Per-action rate limiting
│   │   └── permissionChecks.ts           # Runtime guards (throw PermissionError)
│   │
│   ├── utils/
│   │   └── helpers.ts                    # fmt, fmtDate, normPhone, genRef, hashPin, etc.
│   │
│   └── features/
│       ├── auth/
│       │   ├── AuthProvider.tsx          # Session context + idle warning modal
│       │   ├── ProtectedRoute.tsx        # Route guard + RoleGuard component
│       │   ├── Login.tsx                 # Customer / Rep / Admin login tabs
│       │   ├── Register.tsx              # Customer registration
│       │   └── RepresentativeRegister.tsx # Rep registration with activation token
│       │
│       ├── customer/
│       │   ├── CustomerDashboard.tsx     # Plans tab, balance card, modals
│       │   ├── CustomerTransactions.tsx  # Transaction history with filters
│       │   ├── CustomerDisbursements.tsx # Payout requests and stage tracker
│       │   ├── CustomerProfile.tsx       # Profile edit + PIN change
│       │   └── CustomerNotifications.tsx # In-app notification feed
│       │
│       ├── representative/
│       │   ├── RepresentativeDashboard.tsx # Stats header, daily limit bar, agent score
│       │   ├── AssignedCustomers.tsx     # Customer search + disbursement approval
│       │   ├── RecordCollection.tsx      # 4-step collection wizard
│       │   ├── CollectionHistory.tsx     # Rep transaction history
│       │   └── RepresentativeProfile.tsx # Profile + PIN change
│       │
│       └── admin/
│           ├── AdminDashboard.tsx        # Overview + 7-tab navigation
│           ├── CustomerManagement.tsx    # Customer list, activate/KYC actions
│           ├── RepresentativeManagement.tsx # Rep list + token generation
│           ├── DisbursementApproval.tsx  # Admin payout queue
│           ├── FraudMonitor.tsx          # Unresolved fraud flags
│           ├── AuditLogs.tsx             # Full audit log with search
│           └── Analytics.tsx            # 30-day platform analytics
│
└── tests/
    ├── setup.ts                          # Global test setup (crypto mock, etc.)
    ├── auth.test.ts                      # Session, lockout, PIN validation tests
    ├── rls.test.ts                       # Role permission matrix tests
    ├── ledger.test.ts                    # Schedule engine, amount validation, ref gen
    ├── customer-isolation.test.ts        # Data isolation + PermissionError tests
    ├── representative-access.test.ts     # Rep boundary enforcement tests
    ├── fraud.test.ts                     # Score computation + flag deduplication
    └── disbursement.test.ts              # State machine + request validation tests
```

---

## DEPLOYMENT — STEP BY STEP

### STEP 1 — Prerequisites
```bash
node >= 18
npm >= 9
supabase CLI installed: npm install -g supabase
```

### STEP 2 — Clone and install
```bash
git clone <your-repo>
cd wag-platform
npm install
```

### STEP 3 — Configure environment
```bash
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and anon key
```

### STEP 4 — Run migrations IN ORDER
Go to your Supabase project → SQL Editor → run each migration file in order:

```
001_auth_redesign.sql
002_roles.sql
003_profiles.sql
004_representative_assignments.sql
005_security_events.sql
006_rls_policies.sql       ← This removes anon_all policies
007_audit_triggers.sql
008_ledger_constraints.sql
009_disbursement_workflow.sql
010_fraud_detection.sql
011_indexes.sql
012_production_hardening.sql
```

> ⚠️  Run 006 LAST among the policy files. It drops ALL existing policies first.
> ⚠️  If you have existing data, run 001–005 first, verify data, then run 006+.

### STEP 5 — Deploy edge functions
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets first
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set WAG_ADMIN_PIN_HASH=your_bcrypt_hash

# Deploy all functions
supabase functions deploy record-collection
supabase functions deploy approve-disbursement
supabase functions deploy create-customer
supabase functions deploy create-representative
supabase functions deploy create-transaction
supabase functions deploy reverse-transaction
supabase functions deploy detect-fraud
supabase functions deploy audit-event
```

### STEP 6 — Generate admin PIN hash
The admin PIN is NEVER stored in code or env files client-side.
Generate the bcrypt hash server-side:

```bash
# Node.js one-liner to generate bcrypt hash
node -e "
  const bcrypt = require('bcryptjs');
  const pin = 'YOUR_CHOSEN_PIN';
  const hash = bcrypt.hashSync(pin, 10);
  console.log(hash);
"
# Then set it:
supabase secrets set WAG_ADMIN_PIN_HASH=\$2b\$10\$...
```

### STEP 7 — Generate first activation token
In the admin dashboard → Representatives → Generate Token.
Or directly in SQL:
```sql
INSERT INTO activation_tokens (token, generated_by, expires_at)
VALUES ('WAGE-FIRSTTOK', 'admin', NOW() + INTERVAL '7 days');
```

### STEP 8 — Build and deploy frontend
```bash
npm run build
# Deploy dist/ to your hosting (Vercel, Netlify, Cloudflare Pages, etc.)
```

### STEP 9 — Run tests
```bash
npm test               # Run all tests once
npm run test:watch     # Watch mode
npm run coverage       # Coverage report
```

---

## KEY SECURITY DECISIONS

| Decision | Rationale |
|---|---|
| `anon_all` removed | The original policies gave every visitor full DB access |
| PIN stored as SHA-256 (client) + bcrypt (server) | SHA-256 for quick client lookup; bcrypt in edge functions for registration |
| Immutable transactions | No UPDATE/DELETE on transactions — reversals are new rows |
| Balance check before disbursement approval | Prevents race condition via DB trigger + application check |
| Daily collection limit per rep | Caps blast radius of a compromised rep account |
| Activation token required for rep registration | No unauthenticated rep account creation |
| Session in sessionStorage, not localStorage | Cleared on tab close; not accessible cross-origin |
| Idle timeout (15–30 min by role) | Limits exposure from unattended sessions |
| Cross-tab logout broadcast | Via localStorage event — logs out all open tabs simultaneously |
| search_path locked on all functions | Prevents SQL injection via search_path manipulation |

---

## WHAT THE MIGRATIONS DO TO YOUR EXISTING DATA

| Migration | Effect on existing data |
|---|---|
| 001 | Adds new tables. No changes to existing rows. |
| 002 | Adds new tables. No changes to existing rows. |
| 003 | Adds columns (auth_id, is_active, etc.) with safe defaults. No row loss. |
| 004 | Adds new tables. No changes to existing rows. |
| 005 | Replaces pin_attempts with new schema — existing pin attempts are reset. |
| 006 | **DROPS ALL EXISTING POLICIES** and replaces them. Verify app works after. |
| 007 | Adds triggers. No data changes. |
| 008 | Adds constraints. Will FAIL if existing data violates them (negative amounts etc). |
| 009 | Adds triggers and workflow. No data changes. |
| 010 | Adds fraud rules and triggers. No data changes. |
| 011 | Adds indexes only. No data changes. |
| 012 | Adjusts grants and timeouts. No data changes. |

> Run `SELECT COUNT(*) FROM transactions WHERE amount <= 0` before 008 to check for bad data.

---

## ENVIRONMENT VARIABLES

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` | Supabase project URL |
| `VITE_SUPABASE_ANON` | `.env.local` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Vault | Edge function DB access |
| `WAG_ADMIN_PIN_HASH` | Supabase Vault | bcrypt hash of admin PIN |
