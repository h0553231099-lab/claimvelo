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
