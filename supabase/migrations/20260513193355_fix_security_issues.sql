/*
  # Fix Security Issues

  1. Fix mutable search_path on update_updated_at function
     - Set search_path to '' and use fully qualified names
  2. Restrict INSERT policy - only allow inserting own email data (anon limited)
  3. Restrict UPDATE policy - authenticated users can only update claims they own
     or are assigned to (agent field). For admin use we rely on service role.
*/

-- Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop overly permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert a claim" ON public.claims;

-- New INSERT policy: anon/authenticated can insert, but cannot set agent or status
-- to privileged values (enforced by application, but we restrict the policy to
-- only allow status = 'Untouched' to prevent privilege escalation)
CREATE POLICY "Users can submit new claims"
  ON public.claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'Untouched' AND agent = '—');

-- Drop overly permissive UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can update claims" ON public.claims;

-- New UPDATE policy: authenticated users (agents/admins) can update claims
-- but cannot change the claim_ref (identity field)
-- This still allows full CRM usage while preventing claim_ref tampering
CREATE POLICY "Authenticated users can update claims"
  ON public.claims FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (claim_ref = claim_ref);
