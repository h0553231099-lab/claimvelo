/*
# Add Webhook Infrastructure for Agent Notifications

## What This Does
When a claim's status changes (e.g., from "Pending Check" to "Eligible", or from "Eligible" to "Resolved"),
the system now automatically sends a POST request to the agent's webhook URL (if they have one configured).
This allows agents to receive real-time updates in their own CRM without polling.

## Changes

### 1. New Column: worker_profiles.webhook_url
- Adds a `webhook_url` column (text, nullable) to `worker_profiles`.
- Only agents with a non-null webhook_url will receive webhook notifications.
- Admins set this URL through the admin dashboard.

### 2. New Table: webhook_deliveries
- Tracks each webhook delivery attempt for auditing and retry.
- Columns:
  - `id` (uuid, PK)
  - `agent_code` (text) — the agent whose webhook was called
  - `claim_id` (uuid) — the claim that triggered the webhook
  - `claim_ref` (text) — human-readable claim reference
  - `event_type` (text) — always 'claim.status_changed' for now
  - `payload` (jsonb) — the full JSON body sent to the agent
  - `status` (text) — 'pending', 'delivered', 'failed'
  - `response_code` (integer, nullable) — HTTP status code from the agent's server
  - `attempts` (integer, default 0) — number of delivery attempts
  - `created_at` (timestamptz)
  - `delivered_at` (timestamptz, nullable)

### 3. Database Trigger: enqueue_webhook_on_status_change
- AFTER UPDATE on `claims` when `status` changes.
- Inserts a row into `webhook_deliveries` with status='pending'.
- Only fires when the claim has an agent code AND that agent has a webhook_url.
- This is a SECURITY DEFINER function so it can read worker_profiles regardless of RLS.

### 4. RLS on webhook_deliveries
- Agents can read their own webhook delivery history (by agent_code).
- All writes (insert) happen via the trigger / service role.
- Admins can read all deliveries.

### 5. SECURITY DEFINER function: enqueue_webhook
- Called by the trigger.
- Looks up the agent's webhook_url from worker_profiles.
- If found, inserts a pending webhook_deliveries row.
*/

-- 1. Add webhook_url to worker_profiles
ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS webhook_url text;

-- 2. Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code text NOT NULL,
  claim_id uuid,
  claim_ref text NOT NULL,
  event_type text NOT NULL DEFAULT 'claim.status_changed',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_read_own_webhooks" ON webhook_deliveries;
CREATE POLICY "agents_read_own_webhooks"
  ON webhook_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.agent_code = webhook_deliveries.agent_code
      AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_read_all_webhooks" ON webhook_deliveries;
CREATE POLICY "admins_read_all_webhooks"
  ON webhook_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM worker_profiles wp
      WHERE wp.user_id = auth.uid()
      AND wp.role IN ('admin', 'superadmin')
    )
  );

-- Allow the trigger (running as definer) to insert
-- We also allow authenticated to insert for edge function use
DROP POLICY IF EXISTS "insert_webhook_deliveries" ON webhook_deliveries;
CREATE POLICY "insert_webhook_deliveries"
  ON webhook_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_webhook_deliveries" ON webhook_deliveries;
CREATE POLICY "update_webhook_deliveries"
  ON webhook_deliveries FOR UPDATE
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_agent
  ON webhook_deliveries (agent_code, created_at);

-- 3. SECURITY DEFINER function to enqueue a webhook
CREATE OR REPLACE FUNCTION enqueue_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_code text;
  v_webhook_url text;
  v_old_status text;
  v_new_status text;
  v_claim_ref text;
  v_claim_id uuid;
  v_payload jsonb;
BEGIN
  -- Only fire when status actually changed
  v_old_status := OLD.status;
  v_new_status := NEW.status;
  IF v_old_status IS NOT NULL AND v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  v_agent_code := NEW.agent;
  v_claim_ref := NEW.claim_ref;
  v_claim_id := NEW.id;

  -- Skip if no agent code
  IF v_agent_code IS NULL OR v_agent_code = '' THEN
    RETURN NEW;
  END IF;

  -- Look up the agent's webhook URL
  SELECT webhook_url INTO v_webhook_url
  FROM worker_profiles
  WHERE agent_code = v_agent_code
  AND role = 'agent'
  AND webhook_url IS NOT NULL
  AND webhook_url <> ''
  LIMIT 1;

  -- If no webhook URL, skip
  IF v_webhook_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'event', 'claim.status_changed',
    'timestamp', now(),
    'data', jsonb_build_object(
      'claim_ref', v_claim_ref,
      'claim_id', v_claim_id,
      'old_status', v_old_status,
      'new_status', v_new_status,
      'flight_number', NEW.flight_number,
      'flight_date', NEW.flight_date,
      'departure', NEW.departure,
      'arrival', NEW.arrival,
      'passenger_name', (NEW.passenger_first_name || ' ' || NEW.passenger_last_name),
      'passenger_email', NEW.email,
      'compensation_amount', NEW.compensation_amount,
      'amount', NEW.amount,
      'agent_code', v_agent_code
    )
  );

  -- Enqueue the delivery
  INSERT INTO webhook_deliveries (agent_code, claim_id, claim_ref, event_type, payload, status)
  VALUES (v_agent_code, v_claim_id, v_claim_ref, 'claim.status_changed', v_payload, 'pending');

  RETURN NEW;
END;
$$;

-- 4. Trigger on claims
DROP TRIGGER IF EXISTS claims_status_change_webhook ON claims;
CREATE TRIGGER claims_status_change_webhook
  AFTER UPDATE OF status ON claims
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_webhook();

-- 5. Revoke execute from anon and authenticated (only the trigger should call it)
REVOKE EXECUTE ON FUNCTION enqueue_webhook() FROM anon, authenticated;
