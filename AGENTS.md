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
- **NOT done yet (Phase 9C+):** lawyer dashboard UI, payment processor
  integration.
- Acceptance/security tests: `python3 supabase/tests/phase9a_acceptance.py`
  (needs secrets in `/run/base44/app.env`; creates + cleans up test users).
