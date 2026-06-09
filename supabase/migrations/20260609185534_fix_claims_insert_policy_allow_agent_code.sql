-- Fix claim INSERT policy: agent field holds a referral code, not a privileged value.
-- Only status needs to be restricted to prevent escalation.
DROP POLICY IF EXISTS "Users can submit new claims" ON public.claims;

CREATE POLICY "Users can submit new claims"
  ON public.claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'Untouched');
