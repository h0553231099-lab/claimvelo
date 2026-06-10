-- Drop the unrestricted policy
DROP POLICY IF EXISTS "insert_partner_registration" ON partner_registrations;

-- Replace with a policy that enforces non-empty required fields
-- and a basic email format — prevents trivially invalid / empty rows
CREATE POLICY "insert_partner_registration" ON partner_registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(trim(agency_name)) > 0
    AND char_length(trim(full_name)) > 0
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );
