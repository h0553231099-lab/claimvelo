/*
# Allow Rules Engine statuses on claims INSERT and UPDATE

## Purpose
The Global Automated Checking Engine (Rules Engine) automatically evaluates
claims and sets statuses: "Eligible", "Not Eligible", "Not Eligible - Expired",
and "Force Majeure". These statuses need to be allowed by RLS policies.

## Changes
1. Drops and recreates the INSERT policy to allow all engine statuses.
2. Drops and recreates the UPDATE policy to allow anon (bulk import) and
   authenticated staff to update claim status/notes.
3. No schema changes — only RLS policy updates.
*/

DROP POLICY IF EXISTS "Users can submit new claims" ON public.claims;
CREATE POLICY "Users can submit new claims"
  ON public.claims FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'Untouched'
    OR status = 'Pending Check'
    OR status = 'Eligible'
    OR status = 'Not Eligible'
    OR status = 'Not Eligible - Expired'
    OR status = 'Force Majeure'
  );

DROP POLICY IF EXISTS "Staff can update claims" ON public.claims;
CREATE POLICY "Staff can update claims"
  ON public.claims FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
