/*
  # Add customer_user_id and access_token to claims

  ## Purpose
  - customer_user_id: links a claim to an authenticated customer's auth.users id
    so RLS can enforce ownership without relying on email matching.
  - access_token: an unguessable token for secure server-side claim lookup
    by unauthenticated users (via RPC, never via direct RLS SELECT).

  Both columns are nullable:
  - customer_user_id is NULL for anonymous submissions until the customer
    creates an account and is linked.
  - access_token is generated for every claim so the customer can track it
    without logging in.
*/

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS access_token uuid DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_claims_customer_user_id
  ON claims(customer_user_id)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_access_token
  ON claims(access_token)
  WHERE access_token IS NOT NULL;
