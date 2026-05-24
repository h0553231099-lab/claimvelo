/*
  # Add User Roles System

  1. New Tables
    - `profiles`
      - `id` (uuid, FK to auth.users)
      - `role` (text: 'admin' | 'worker' | 'customer')
      - `full_name` (text)
      - `email` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on profiles
    - Users can read their own profile
    - Users can update their own profile
    - Admins can read all profiles

  3. Notes
    - Role is set on signup via the registration flow
    - Claims are linked to customer email for customer-specific views
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'worker', 'customer')),
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Update claims RLS to allow customers to see only their own claims
DROP POLICY IF EXISTS "Customers can view own claims" ON public.claims;

CREATE POLICY "Customers can view own claims"
  ON public.claims FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
  );

-- Allow anon select for the existing claim tracking (public)
DROP POLICY IF EXISTS "Anyone can view claims" ON public.claims;
