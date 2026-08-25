/*
# Add compensation amount and agent commission fields

## Purpose
Sub-Step A of the financial module: when the rules engine marks a claim
"Eligible", it calculates an estimated compensation value, saves it to the
claim, and computes the travel agent's commission based on their profile's
commission_rate, rolling the cut up into total_payout_earned.

## Changes

### claims table
- `compensation_amount` (numeric, nullable, default null)
  Stores the estimated compensation value calculated by the rules engine.
  Null means the claim hasn't been evaluated yet or wasn't eligible.

### worker_profiles table
- `commission_rate` (numeric, nullable, default 10)
  The agent's commission percentage (e.g. 10 = 10%). Defaults to 10% so
  existing agents get a sensible value without manual setup.
- `total_payout_earned` (numeric, nullable, default 0)
  Running total of commission earned across all eligible claims attributed
  to this agent. Incremented atomically each time a claim is marked eligible.

## Security
No new tables. No RLS policy changes — existing policies on claims and
worker_profiles remain in effect. The new columns inherit the same
row-level access controls already in place.

## Notes
1. `compensation_amount` is nullable so old claims that pre-date the
   financial module are not affected.
2. `commission_rate` defaults to 10 (percent) — admins can override per
   agent through the existing worker_profiles management interface.
3. `total_payout_earned` defaults to 0 and is only ever incremented by
   the financial service, never overwritten.
*/

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS compensation_amount numeric DEFAULT NULL;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 10;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS total_payout_earned numeric DEFAULT 0;
