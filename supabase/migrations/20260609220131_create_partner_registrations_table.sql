CREATE TABLE IF NOT EXISTS partner_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_partner_registration" ON partner_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "select_partner_registrations_admin" ON partner_registrations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "update_partner_registrations_admin" ON partner_registrations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "delete_partner_registrations_admin" ON partner_registrations
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
  );
