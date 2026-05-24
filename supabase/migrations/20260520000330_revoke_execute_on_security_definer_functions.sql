/*
  # Revoke public EXECUTE on SECURITY DEFINER functions

  ## Problem
  Two SECURITY DEFINER functions were executable by the `anon` and `authenticated`
  roles via the PostgREST RPC endpoint, which is a security risk:
  - `public.generate_stale_notifications()` — internal scheduled job, should not be
    callable by any end user
  - `public.update_updated_at()` — trigger helper, should never be called directly

  ## Changes
  1. Revoke EXECUTE on both functions from `anon`, `authenticated`, and `public`
  2. Grant EXECUTE only to `service_role` for `generate_stale_notifications` so it
     can still be invoked from a trusted backend/edge function context

  ## Security
  - No data loss, no schema changes
  - Closes the RPC exposure for both functions
*/

-- Revoke from public (covers anon + authenticated implicitly)
REVOKE EXECUTE ON FUNCTION public.generate_stale_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;

-- Revoke explicitly from anon and authenticated roles
REVOKE EXECUTE ON FUNCTION public.generate_stale_notifications() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated;

-- Grant only to service_role for generate_stale_notifications (cron / edge function use)
GRANT EXECUTE ON FUNCTION public.generate_stale_notifications() TO service_role;
