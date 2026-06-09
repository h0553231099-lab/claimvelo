-- 1. Extend profiles role check to include sales_manager, agent, seo_worker
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'worker', 'customer', 'sales_manager', 'agent', 'seo_worker'));

-- 2. Allow anon users to insert notifications (new claims come from unauthenticated users)
DROP POLICY IF EXISTS "Anon can insert notifications" ON notifications;

CREATE POLICY "Anon can insert notifications"
  ON notifications FOR INSERT
  TO anon
  WITH CHECK (true);
