-- Update the claims INSERT policy to allow 'Pending Check' status alongside 'Untouched'
-- This is needed for the bulk historical import feature
DROP POLICY IF EXISTS "Users can submit new claims" ON public.claims;
CREATE POLICY "Users can submit new claims" ON public.claims
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'Untouched' OR status = 'Pending Check');