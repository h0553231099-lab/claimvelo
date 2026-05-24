/*
  # Stale Claim Notification Function

  Creates a Postgres function `generate_stale_notifications()` that:
  1. Finds claims that have been "Untouched" for any length of time and inserts a new_claim alert if one doesn't exist yet
  2. Finds claims "In Progress" for 7+ days with no recent stale notification and inserts a stale_in_progress alert
  3. Finds claims "Waiting" for 6+ weeks with no recent stale_waiting notification and inserts a stale_waiting alert

  Avoids duplicate notifications by checking for existing unread ones of the same type + claim_id.
*/

CREATE OR REPLACE FUNCTION generate_stale_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

  -- Untouched claims: insert new_claim notification if none exists yet
  INSERT INTO notifications (type, claim_ref, claim_id, message)
  SELECT
    'new_claim',
    c.claim_ref,
    c.id,
    c.claim_ref || ' — ' || c.passenger_first_name || ' ' || c.passenger_last_name ||
      CASE WHEN c.airline <> '' THEN ' (' || c.airline || ')' ELSE '' END ||
      ' is still Untouched'
  FROM claims c
  WHERE c.status = 'Untouched'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.claim_id = c.id
        AND n.type = 'new_claim'
        AND n.read = false
    );

  -- In Progress for 7+ days
  INSERT INTO notifications (type, claim_ref, claim_id, message)
  SELECT
    'stale_in_progress',
    c.claim_ref,
    c.id,
    c.claim_ref || ' — ' || c.passenger_first_name || ' ' || c.passenger_last_name ||
      ' has been In Progress for ' ||
      EXTRACT(DAY FROM now() - c.updated_at)::int || ' days'
  FROM claims c
  WHERE c.status = 'In Progress'
    AND c.updated_at < now() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.claim_id = c.id
        AND n.type = 'stale_in_progress'
        AND n.read = false
        AND n.created_at > now() - INTERVAL '7 days'
    );

  -- Waiting for 6+ weeks
  INSERT INTO notifications (type, claim_ref, claim_id, message)
  SELECT
    'stale_waiting',
    c.claim_ref,
    c.id,
    c.claim_ref || ' — ' || c.passenger_first_name || ' ' || c.passenger_last_name ||
      ' has been Waiting for ' ||
      EXTRACT(DAY FROM now() - c.updated_at)::int || ' days with no update'
  FROM claims c
  WHERE c.status = 'Waiting'
    AND c.updated_at < now() - INTERVAL '42 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.claim_id = c.id
        AND n.type = 'stale_waiting'
        AND n.read = false
        AND n.created_at > now() - INTERVAL '7 days'
    );

END;
$$;
