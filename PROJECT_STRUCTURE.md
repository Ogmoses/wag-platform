# WAG ENTERPRISES — Complete Project Structure & Deployment Guide
# Generated: Production-grade rebuild v2.0

## ─────────────────────────────────────────
## COMPLETE FILE TREE
## ─────────────────────────────────────────

```
wag-platform/
│
├── .env.example                          ← Copy to .env.local, fill credentials
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_auth_redesign.sql         ← user_identities, session_tokens, pin_reset
│   │   ├── 002_roles.sql                 ← role_permissions table, auth helper functions
│   │   ├── 003_profiles.sql              ← auth_id columns, admin_profiles, notifications
│   │   ├── 004_representative_assignments.sql ← assignments, daily limits, view
│   │   ├── 005_security_events.sql       ← security_events, pin_attempts, rate_limit_buckets
│   │   ├── 006_rls_policies.sql          ← REPLACES anon_all with role-scoped policies
│   │   ├── 007_audit_triggers.sql        ← immutable ledger triggers, auto-audit
│   │   ├── 008_ledger_constraints.sql    ← balance checks, no-negative guard
│   │   ├── 009_disbursement_workflow.sql ← state machine, payout auto-tx, limits
│   │   ├── 010_fraud_detection.sql       ← fraud rules, DB-layer fraud triggers
│   │   ├── 011_indexes.sql               ← all performance indexes
│   │   └── 012_production_hardening.sql  ← search_path locks, grants, timeouts
│   │
│   └── functions/
│       ├── record-collection/index.ts    ← SERVER: collection with full validation
│       ├── approve-disbursement/index.ts ← SERVER: approve + payout tx creation
│       ├── create-customer/index.ts      ← SERVER: register with bcrypt PIN hash
│       ├── create-representative/index.ts← SERVER: register with token validation
│       ├── create-transaction/index.ts   ← SERVER: generic ledger append
│       ├── reverse-transaction/index.ts  ← SERVER: admin-only reversal (compensating entry)
│       ├── detect-fraud/index.ts         ← SERVER: full fraud rule engine
│       └── audit-event/index.ts          ← SERVER: authoritative audit write
│
├── src/
│   ├── App.tsx                           ← Root app, auth routing
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
│   │   ├── supabase.ts                   ← Typed singleton client
│   │   ├── auth.ts                       ← Login, logout, session management
│   │   ├── roles.ts                      ← Client-side permission checks
│   │   ├── security.ts                   ← Rate limiting, validation, sanitisation
│   │   ├── ledger.ts                     ← Plans and transaction operations
│   │   ├── disbursement.ts               ← Disbursement CRUD
│   │   ├── fraud.ts                      ← Client-side fraud flagging
│   │   └── audit.ts                      ← Audit log write/read
│   │
│   ├── security/
│   │   ├── pinVerification.ts            ← PIN verify/change
│   │   ├── lockoutProtection.ts          ← Failed attempt tracking, lockout
│   │   ├── sessionProtection.ts          ← Idle timeout, cross-tab logout
│   │   ├── rateLimit.ts                  ← Action-specific rate limit wrappers
│   │   └── permissionChecks.ts           ← Runtime guards (throw PermissionError)
│   │
│   ├── utils/
│   │   └── helpers.ts                    ← fmt, fmtDate, normPhone, genRef, hashPin
│   │
│   └── features/
│       ├── auth/
│       │   ├── AuthProvider.tsx          ← Context, idle warning, cross-tab sync
│       │   ├── ProtectedRoute.tsx        ← Route guard + RoleGuard component
│       │   ├── Login.tsx                 ← Customer / Rep / Admin login (3 tabs)
│       │   ├── Register.tsx              ← Customer registration
│       │   └── RepresentativeRegister.tsx← Rep registration with activation token
│       │
│       ├── customer/
│       │   ├── CustomerDashboard.tsx     ← Main dashboard: plans, balance, modals
│       │   ├── CustomerTransactions.tsx  ← Transaction history with filters
│       │   ├── CustomerDisbursements.tsx ← Request + track payouts
│       │   ├── CustomerProfile.tsx       ← Profile edit + PIN change
│       │   └── CustomerNotifications.tsx ← In-app notification feed
│       │
│       ├── representative/
│       │   ├── RepresentativeDashboard.tsx ← Main dashboard: stats, agent score
│       │   ├── AssignedCustomers.tsx     ← Customer search + disbursement approval
│       │   ├── RecordCollection.tsx      ← 4-step collection wizard
│       │   ├── CollectionHistory.tsx     ← Rep's own transaction history
│       │   └── RepresentativeProfile.tsx ← Profile view + PIN change
│       │
│       └── admin/
│           ├── AdminDashboard.tsx        ← Control centre: 7-tab layout
│           ├── CustomerManagement.tsx    ← List, search, activate/deactivate, KYC
│           ├── RepresentativeManagement.tsx ← Manage reps + token generation
│           ├── DisbursementApproval.tsx  ← Approve/reject pending payouts
│           ├── FraudMonitor.tsx          ← Unresolved fraud flags
│           ├── AuditLogs.tsx             ← Full audit trail
│           └── Analytics.tsx             ← 30-day summary metrics
│
└── tests/
    ├── setup.ts                          ← Global test setup (crypto mock, etc.)
    ├── auth.test.ts                      ← Session management, lockout, PIN validation
    ├── rls.test.ts                       ← Permission system mirrors DB RLS policies
    ├── ledger.test.ts                    ← Schedule engine, amount validation, refs
    ├── customer-isolation.test.ts        ← Data isolation, permission boundaries
    ├── representative-access.test.ts     ← Rep cannot edit balances, daily limits
    ├── disbursement.test.ts              ← Disbursement workflow, state machine
    └── fraud.test.ts                     ← Agent scoring, fraud detection logic
```

---

## ─────────────────────────────────────────
## DEPLOYMENT ORDER
## ─────────────────────────────────────────

### STEP 1 — Run Database Migrations (in order)

Open Supabase SQL Editor and run each file in sequence:

```
001_auth_redesign.sql
002_roles.sql
003_profiles.sql
004_representative_assignments.sql
005_security_events.sql
006_rls_policies.sql          ← CRITICAL: replaces permissive anon_all policies
007_audit_triggers.sql
008_ledger_constraints.sql
009_disbursement_workflow.sql
010_fraud_detection.sql
011_indexes.sql
012_production_hardening.sql  ← LAST — locks down access
```

> ⚠️ Run 006 AFTER all other tables exist. Run 012 LAST.

---

### STEP 2 — Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Set secrets (never in .env for edge functions)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_key
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

---

### STEP 3 — Frontend Setup

```bash
# Install dependencies
npm install

# Create env file
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON

# Run tests
npm test

# Development server
npm run dev

# Production build
npm run build
```

---

### STEP 4 — Generate Admin PIN Hash

The admin PIN is never stored in code. Generate a bcrypt hash and set it as a Supabase secret:

```bash
# Using Node.js
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('YOUR_ADMIN_PIN', 10).then(h => console.log(h));
"

# Set the hash as a secret
supabase secrets set WAG_ADMIN_PIN_HASH='\$2b\$10\$...'
```

---

## ─────────────────────────────────────────
## SECURITY ARCHITECTURE SUMMARY
## ─────────────────────────────────────────

### Authentication Flow

```
User enters credentials
       ↓
Client-side lockout check (localStorage)
       ↓
Rate limit check (in-memory bucket)
       ↓
PIN hash (SHA-256 client-side lookup)  ← current behaviour preserved
       ↓
Supabase DB query (phone + pin_hash)
       ↓
Session stored in sessionStorage (not localStorage)
       ↓
Idle timer starts (15/20/30 min per role)
       ↓
Cross-tab logout sync via StorageEvent
```

### Transaction Safety

```
Rep clicks "Record Collection"
       ↓
Client validates: amount, daily limit, rate limit
       ↓
DB INSERT into transactions (immutable ledger)
       ↓
DB triggers fire:
  • auto_audit_transactions   → writes audit_log
  • detect_tx_fraud           → checks fraud rules
  • enforce_no_negative_balance → prevents negative
       ↓
Rep confirmed_count incremented
       ↓
Receipt shown to rep
```

### Disbursement Safety

```
Customer requests payout
       ↓
Client checks: plan balance, emergency limit
       ↓
DB INSERT into disbursements (status=pending)
       ↓
DB trigger: check_disbursement_request_limit
       ↓
Rep searches customer, sees pending request
       ↓
Rep clicks "Approve & Pay"
       ↓
DB UPDATE disbursements SET status='paid' (optimistic lock on status='pending')
       ↓
DB triggers fire:
  • enforce_disbursement_workflow → validates state transition
  • check_disbursement_balance   → re-checks balance server-side
  • create_payout_on_disbursement_paid → auto-creates payout transaction
  • auto_audit_disbursements     → writes audit_log
```

---

## ─────────────────────────────────────────
## KEY SECURITY GUARANTEES
## ─────────────────────────────────────────

| Guarantee                                        | Mechanism                                      |
|--------------------------------------------------|------------------------------------------------|
| Customers see only their own data                | DB RLS + client ownsCustomerRecord()           |
| Representatives cannot edit balances directly    | No UPDATE on transactions (append-only)        |
| Transactions are immutable                       | DB trigger prevent_transaction_mutation()      |
| Audit log is immutable                           | DB trigger prevent_audit_mutation()            |
| Disbursements respect plan balance               | DB trigger check_disbursement_balance()        |
| No negative balances ever                        | DB trigger enforce_no_negative_balance()       |
| PIN never stored in plaintext                    | SHA-256 hash client, bcrypt hash server        |
| Session expires on inactivity                    | sessionProtection.ts idle timer                |
| Logout in one tab affects all tabs               | localStorage StorageEvent broadcast            |
| Fraud patterns are flagged automatically         | DB triggers + client checks                    |
| Reps have daily collection limits                | rep_daily_limits table + edge function checks  |
| Activation tokens expire and are single-use      | expires_at + used boolean + optimistic lock    |
| Admin PIN never in source code                   | Supabase Vault secret only                     |
| anon access completely blocked in production     | Migration 012 revokes all anon grants          |

---

## ─────────────────────────────────────────
## WHAT WAS NOT CHANGED (UI PRESERVATION)
## ─────────────────────────────────────────

The following UI elements are IDENTICAL to the original:

- Color scheme: #1a1a2e (dark navy primary)
- Card layouts and border-radius (16px)
- Plan progress bars
- Transaction history display
- Milestone/goal celebration modal
- Collection receipt format
- Rep dashboard stats layout
- Phone format (07XXXXXXXXXX display)
- Currency format (₦X,XXX.XX)
- WAG branding and typography

Only the underlying data layer, authentication model, security
architecture, and backend implementation were replaced.
