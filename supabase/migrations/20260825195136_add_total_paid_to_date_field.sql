/*
# Add total_paid_to_date field for agent payout tracking

## Purpose
Sub-Step C of the financial module: tracks manual payouts to agents so
the admin can see the outstanding balance due for each agent.

## Changes

### worker_profiles table
- `total_paid_to_date` (numeric, nullable, default 0)
  Running total of all manual payouts logged by the admin. Incremented
  each time the admin settles a payout via the "Mark as Paid" action.

## Security
No new tables. No RLS policy changes — existing policies on
worker_profiles remain in effect.

## Notes
1. `total_paid_to_date` defaults to 0 and is only ever incremented by
   the admin payout action.
2. The agent's outstanding balance is computed as:
   balance_due = total_payout_earned - total_paid_to_date
*/

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS total_paid_to_date numeric DEFAULT 0;
