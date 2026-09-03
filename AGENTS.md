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
