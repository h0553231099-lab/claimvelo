/*
  # Fix recursive admin profiles policy

  The "Admins can read all profiles" policy was causing a 500 Internal Server Error
  because it queried the profiles table from within a profiles policy, creating
  infinite recursion. This replaces it with a JWT-based check using app_metadata.

  1. Changes
    - Drop the recursive admin SELECT policy on profiles
    - Add a non-recursive admin SELECT policy using auth.jwt() app_metadata
    - Also set the admin role in app_metadata for the existing admin user so the
      JWT check works
*/

DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

CREATE POLICY "Admins can read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
