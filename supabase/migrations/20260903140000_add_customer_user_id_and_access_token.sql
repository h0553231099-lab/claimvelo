/*
  # Add customer_user_id and access_token to claims

  ## Purpose
  - customer_user_id: links a claim to an authenticated customer's auth.users id
    so RLS can enforce ownership without relying on email matching.
  - access_token_hash: a SHA-256 hash of a cryptographically random token
    for secure server-side claim lookup by unauthenticated users (via RPC,
    never via direct RLS SELECT). The raw token is presented once to the
    customer and never stored.

  Both columns are nullable:
  - customer_user_id is NULL for anonymous submissions until the customer
    creates an account and is linked.
  - access_token_hash stores a SHA-256 hash of the cryptographically random
    access token. The raw token is presented ONCE to the customer (via the
    create-claim edge function response) and is NEVER stored in the database.
    The public tracking RPC hashes the supplied token and compares against
    this column.
*/

-- pgcrypto provides digest() for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Store only the hash — never the raw token
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS access_token_hash text;

CREATE INDEX IF NOT EXISTS idx_claims_customer_user_id
  ON claims(customer_user_id)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_access_token_hash
  ON claims(access_token_hash)
  WHERE access_token_hash IS NOT NULL;
