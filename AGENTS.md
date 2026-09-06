# Base44 Dev Environment

## Stack
- Vite 5 + React 18 + TypeScript SPA (no backend service in compose)
- Supabase is an **external** managed backend (auth, database, edge functions)
- Tailwind CSS for styling, i18next for i18n, react-router for routing

## Running the app
```
docker compose -f docker-compose.base44.yml up -d
```
- Web entry point: host port 3000 → container 5173 (Vite dev server)
- Live reload is active; edits appear in the preview automatically
- `vite.config.ts` has `server.host: true` + `allowedHosts: true` for the preview proxy

## Secrets
The app requires two env vars to connect to Supabase:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

Without real credentials, the app boots with placeholders (`.env.base44-defaults`)
and public pages render, but auth and data features won't work.
Provide real values via the Base44 secrets dashboard.

## Verification
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` returns the app HTML
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/src/main.tsx` returns live source (not a prebuilt bundle)

## Phase 8B — Agent & Sales Manager UI
- Agent Portal (`AgentDashboardPage`): Dashboard / Profile / Create Lead tabs.
  Commission values are **read-only** in the UI — all commission_rate, amount,
  status, and payout-total mutations go through the `manage-agent-finance` edge
  function (service role). Agents cannot edit sensitive worker_profiles columns
  (DB trigger `protect_worker_profile_sensitive_columns` enforces this).
- Agent referral link/QR uses the existing `/start?agent=CODE` flow; the
  `create-claim` edge function validates the code server-side and resolves
  `agent_id` — the frontend never sets `agent_id` directly.
- Sales Manager Portal (`SalesManagerPage`): Overview / Agents / Leads-Claims /
  Commissions / Performance views. Filters: agent, date range, country, airline,
  status. RLS restricts all data to the manager's own team.
- Commission workflow (pending → approved → paid) is driven by two new
  `manage-agent-finance` actions: `approve-commission` and `pay-commission`.
  Sales managers can approve/pay only their own team; admins can do anything.
  No actual payment processing (Phase 9).
- `get-agent-context` action returns the agent's manager display name (not
  readable via profiles RLS by an agent).
- Acceptance tests: `python3 supabase/tests/phase8b_acceptance.py` (needs
  secrets in `/run/base44/app.env`; deploys the edge function first via
  `npx supabase functions deploy manage-agent-finance --project-ref <ref>`).

## Phase 9A — Legal & Finance Foundations (schema + RLS + audit only)
- Migrations (applied to live DB): `20260906_p9a_01_fix_finance_rls.sql`,
  `20260906_p9a_02_legal_cases_and_claim_fields.sql`,
  `20260906_p9a_03_audit_coverage.sql`.
- **finance_transactions RLS fixed:** all duplicate/conflicting policies dropped;
  exactly 4 policies remain (SELECT/INSERT/UPDATE/DELETE), admin + super_admin
  only. New `transaction_type` column (CHECK: airline_payment, claimvelo_fee,
  customer_payout, agent_commission, legal_expense, general); existing rows
  backfilled to `general`. `category` kept for display.
- **legal_cases table:** one row per escalated claim (UNIQUE claim_id), with
  lawyer_id, legal_status, escalation_reason, escalated_at/by, next_deadline_date,
  deadlines (jsonb), notes. Links to existing claim infra — does NOT duplicate
  documents/comms. RLS: lawyer reads own; admin/super_admin read+write.
- **claims new columns:** lawyer_id, legal_case_id, escalated_at/by/reason,
  approved_compensation_amount/approved_at/approved_by (separate from estimated
  compensation_amount), airline_payment_status/amount/date/reference,
  claimvelo_fee_tier/rate/amount, customer_payout_status/amount/date/reference.
- **Lawyer RLS (least privilege):** lawyer sees only claims where
  `lawyer_id = auth.uid()`, and the files, communications, airline_emails,
  info_requests, review_notes, flight_segments, flight_evidence, and
  status_history for those claims. No finance, no audit_log, no global claims.
- **Audit coverage extended:** `audit_claim_change` now also fires on
  lawyer assignment, escalation, compensation approval, airline payment,
  customer payout, fee changes. New `audit_commission_change` (insert + status
  change). New `audit_legal_case_change` (insert/update/delete).
- **Phase 9B (done):** `manage-legal-finance` edge function implements the
  full legal/finance workflow: `escalate-claim` (creates legal_case + stamps
  claim), `approve-compensation`, `record-airline-payment`, `set-claimvelo-fee`
  (30%/50% tier calc), `record-customer-payout`, `record-legal-expense`
  (multiple per claim), `update-legal-case`, `get-legal-overview` (admin or
  assigned lawyer). Typed finance transactions use a manual check-then-upsert
  (the unique partial index `idx_finance_txn_unique_per_claim` has a WHERE
  clause that PostgREST `onConflict` cannot target). Migration
  `20260906_p9b_01_legal_finance_migration.sql` adds that index + a
  `legal_cases` updated_at trigger (reuses `update_updated_at()`).
  `20260906_p9b_02_fix_audit_trigger_order.sql` reorders the
  `audit_claim_change()` ELSIF chain so escalation fields are checked
  BEFORE status (escalating a claim also sets status='Escalated', which
  was masking the `claim.escalated` audit action).
- **Phase 9C (done):** Legal & Finance UI layer.
  - `LawyerDashboardPage` (`/lawyer-dashboard`): lists only the lawyer's
    assigned legal_cases (RLS: `legal_cases.lawyer_id = auth.uid()`). Case
    list with search + status filter, deadline urgency badges, summary cards.
    Clicking a case opens `LegalCaseDetail` in read-only mode (`isAdmin=false`).
  - `AdminLegalQueue` (Admin sidebar → ⚖️ Legal Queue): all escalated/unassigned
    legal cases. Admin can assign/reassign lawyers via dropdown (escalate-claim
    → update-legal-case). Case detail opens `LegalCaseDetail` in admin mode.
  - `FinanceDashboard` (Admin sidebar → 📊 Finance Dashboard): typed
    `finance_transactions` summary (airline payments, ClaimVelo fees, customer
    payouts, agent commissions, legal expenses). Filters: date range, airline,
    country, claim status, payment status, reconciliation status, search.
    Reconciliation computed from server-persisted rows only (no client math).
  - `ClaimFinancePanel` (Admin Claim Detail → Finance tab): full financial
    lifecycle per claim. Reads via `get-reconciliation`; all mutations
    (approve compensation, record airline payment, set fee, record payout,
    record legal expense) go through `manage-legal-finance`. Shows
    reconciliation status banner + mismatch flags.
  - `LegalCaseDetail` (shared): legal status, deadlines (jsonb), notes,
    lawyer assignment. Admin sees edit controls + audit_log escalation
    history; lawyer sees read-only + derived timeline. All writes via
    `update-legal-case` (admin-only, 403 for lawyers).
  - `legalFinanceApi.ts`: client wrapper for `manage-legal-finance` edge
    function. All mutations go through this; the frontend never writes
    protected legal/finance fields directly to Supabase.
  - Lint: 0 errors (1 pre-existing `react-hooks/exhaustive-deps` warning in
    App.tsx). TypeScript: clean. Production build: succeeds.
  - Acceptance/security tests: `python3 supabase/tests/phase9c_acceptance.py`
    (51 checks, all pass; needs secrets in `/run/base44/app.env`; creates +
    cleans up test users). Covers: lawyer RLS isolation (A sees own, B blocked),
    lawyer blocked from finance_transactions, admin assign/reassign, legal
    status/deadline/notes persistence, reconciliation values match DB,
    mismatch detection, finance filter correctness, RLS blocks direct client
    writes, non-admin roles (worker/customer/agent/sales_manager/lawyer) get
    403 on all admin-only actions, existing flows not regressed.
- **NOT done yet (Phase 10+):** payment processor integration.

## Excel Leads MVP — ingestion layer (no claim creation)
- Migration (applied to live DB): `20260906190000_excel_leads.sql` — four NEW
  additive tables (`import_batches`, `leads`, `import_raw_rows`,
  `lead_flight_segments`), all with RLS (admin/super_admin SELECT only; service
  role mutates via edge function). No existing table modified.
- Edge function `process-excel-import` (admin/super_admin only — verifies JWT +
  profile role): stores every raw row, deduplicates (within-batch identical rows
  + cross-batch via `leads.lead_key` unique index), groups by PNR + passenger →
  ONE lead per passenger, preserves ordered segments. **Never** creates claims,
  runs the rules engine, verifies flights, contacts customers, sends emails, or
  creates commissions. Resolves `agent_id` server-side from `agent_code`.
- Lead statuses: READY / WARNING (missing email or phone) / REVIEW (row mentions
  cancellation — NOT auto-interpreted as flight cancellation) / FUTURE (any
  flight date in the future) / DUPLICATE.
- Admin UI: "Excel Import" view (`ExcelImport.tsx`, reuses BulkImport parsing
  helpers but POSTs to the edge function instead of creating claims) + "Lead
  Queue" view (`LeadQueue.tsx`, expandable lead cards with segments). Both wired
  into `AdminPage.tsx` sidebar. The old claim-creating `BulkImport` is no longer
  rendered.
- Deploy edge function: `npx supabase functions deploy process-excel-import
  --project-ref <ref> --no-verify-jwt` (run inside the compose container).
- E2E test: `python3 supabase/tests/excel_leads_e2e.py` (15 checks, all pass;
  needs secrets in `/run/base44/app.env`; creates + cleans up a temp admin user).
- **NOT done yet:** Lead → Claim conversion (reserved nullable `leads.claim_id`
  FK + `lead_flight_segments` mirrors `claim_flight_segments` for this).
- Acceptance/security tests: `python3 supabase/tests/phase9a_acceptance.py`
  (needs secrets in `/run/base44/app.env`; creates + cleans up test users).
