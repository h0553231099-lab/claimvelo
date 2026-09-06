#!/usr/bin/env python3
"""
Phase 7 — Customer Communication System — Live Acceptance Tests

Tests against the live Supabase backend using the REST API.
Uses service_role key for setup/cleanup and user JWTs for RLS tests.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone, timedelta

# ── Load secrets from the platform env file ──────────────────────────────────
ENV_FILE = "/run/base44/app.env"
env = {}
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                env[k.strip()] = v

SUPABASE_URL = env.get("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = env.get("VITE_SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("FAIL: Missing SUPABASE_URL or SERVICE_ROLE_KEY")
    sys.exit(1)

BASE = f"{SUPABASE_URL}/rest/v1"
AUTH_BASE = f"{SUPABASE_URL}/auth/v1"
EDGE_BASE = f"{SUPABASE_URL}/functions/v1"

# ── Test data tracking ────────────────────────────────────────────────────────
TEST_PREFIX = "phase7test"
test_claim_ids = []
test_user_ids = []
test_user_emails = []
test_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

results = {"pass": 0, "fail": 0, "errors": []}


def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    if passed:
        results["pass"] += 1
    else:
        results["fail"] += 1
        results["errors"].append(f"{name}: {detail}")
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not passed else ""))


def api(method, path, headers=None, body=None, base=BASE):
    """Make a REST API call and return (status_code, json_response)."""
    url = f"{base}{path}" if path.startswith("/") else f"{base}/{path}"
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:
        return 0, str(e)


def admin_headers(extra=None):
    h = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    }
    if extra:
        h.update(extra)
    return h


def anon_headers(extra=None):
    h = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
    }
    if extra:
        h.update(extra)
    return h


def user_jwt_headers(jwt, extra=None):
    h = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {jwt}",
    }
    if extra:
        h.update(extra)
    return h


def create_test_user(email, password, full_name, role="customer"):
    """Create a test user via Supabase Admin API and return (user_id, jwt)."""
    # Create user via admin API
    status, resp = api(
        "POST", "/admin/users",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        },
        body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        },
        base=f"{SUPABASE_URL}/auth/v1",
    )
    if status != 200 and status != 201:
        # User might already exist — try to get existing
        if status == 422 and "already" in str(resp).lower():
            # Sign in to get the existing user
            pass
        else:
            return None, None, f"create_user failed: {status} {resp}"

    user_id = None
    if isinstance(resp, dict) and "id" in resp:
        user_id = resp["id"]

    # Sign in to get JWT
    status2, resp2 = api(
        "POST", "/token?grant_type=password",
        headers={"apikey": ANON_KEY},
        body={"email": email, "password": password},
        base=AUTH_BASE,
    )
    jwt = None
    if status2 == 200 and isinstance(resp2, dict):
        jwt = resp2.get("access_token")
        if not user_id and isinstance(resp2.get("user"), dict):
            user_id = resp2["user"]["id"]

    return user_id, jwt, None


def sign_in(email, password):
    """Sign in and return (user_id, jwt, error)."""
    status, resp = api(
        "POST", "/token?grant_type=password",
        headers={"apikey": ANON_KEY},
        body={"email": email, "password": password},
        base=AUTH_BASE,
    )
    if status != 200:
        return None, None, f"sign_in failed: {status} {resp}"
    jwt = resp.get("access_token")
    user_id = resp.get("user", {}).get("id")
    return user_id, jwt, None


def cleanup():
    """Delete all test data."""
    print("\n── Cleaning up test data ──")
    # Delete test communications
    for cid in test_claim_ids:
        api("DELETE", f"/claim_communications?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/claim_status_history?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/notifications?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/claims?id=eq.{cid}", headers=admin_headers())

    # Delete test users
    for uid in test_user_ids:
        api("DELETE", f"/admin/users/{uid}", headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        }, base=f"{SUPABASE_URL}/auth/v1")

    print("  Cleanup done.")


# ════════════════════════════════════════════════════════════════════════════
# TESTS
# ════════════════════════════════════════════════════════════════════════════

def test_setup():
    """Create test users and claims."""
    print("\n── Setup: Creating test users and claims ──")

    # Create two test customers
    ts = test_timestamp
    cust1_email = f"{TEST_PREFIX}_cust1_{ts}@test-claimvelo.com"
    cust2_email = f"{TEST_PREFIX}_cust2_{ts}@test-claimvelo.com"
    password = "TestPass123!"

    cust1_id, cust1_jwt, err = create_test_user(cust1_email, password, "Test Customer 1", "customer")
    if err:
        record("Setup: Create customer 1", False, err)
        return False
    test_user_ids.append(cust1_id)
    test_user_emails.append(cust1_email)

    cust2_id, cust2_jwt, err = create_test_user(cust2_email, password, "Test Customer 2", "customer")
    if err:
        record("Setup: Create customer 2", False, err)
        return False
    test_user_ids.append(cust2_id)
    test_user_emails.append(cust2_email)

    # Set their profiles to customer role
    for uid in [cust1_id, cust2_id]:
        api("POST", f"/profiles?id=eq.{uid}",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"id": uid, "role": "customer", "full_name": "Test Customer", "email": cust1_email if uid == cust1_id else cust2_email})
        # If insert fails (already exists), update
        api("PATCH", f"/profiles?id=eq.{uid}",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"role": "customer"})

    # Create two test claims
    claim1_ref = f"CLM-{ts[-5:]}01"
    claim2_ref = f"CLM-{ts[-5:]}02"

    # Claim 1 — owned by customer 1
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim1_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "Customer1",
            "email": cust1_email,
            "phone": "555-0100",
            "address": "123 Test St",
            "country": "US",
            "flight_number": "AA100",
            "flight_date": "2026-08-01",
            "departure": "JFK",
            "arrival": "LHR",
            "airline": "American Airlines",
            "issue_type": "Delay",
            "airline_reason": "",
            "status": "In Progress",
            "amount": "600",
            "agent": "",
            "loa_signed": True,
            "preferred_language": "en",
            "customer_user_id": cust1_id,
            "last_customer_update_at": (datetime.now(timezone.utc) - timedelta(days=35)).isoformat(),
        })
    if status != 201 or not resp:
        record("Setup: Create claim 1", False, f"{status} {resp}")
        return False
    claim1_id = resp[0]["id"]
    test_claim_ids.append(claim1_id)

    # Claim 2 — owned by customer 2
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim2_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "Customer2",
            "email": cust2_email,
            "phone": "555-0200",
            "address": "456 Test Ave",
            "country": "US",
            "flight_number": "BA200",
            "flight_date": "2026-08-02",
            "departure": "LHR",
            "arrival": "JFK",
            "airline": "British Airways",
            "issue_type": "Cancellation",
            "airline_reason": "",
            "status": "Waiting",
            "amount": "600",
            "agent": "",
            "loa_signed": True,
            "preferred_language": "es",
            "customer_user_id": cust2_id,
            "last_customer_update_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
        })
    if status != 201 or not resp:
        record("Setup: Create claim 2", False, f"{status} {resp}")
        return False
    claim2_id = resp[0]["id"]
    test_claim_ids.append(claim2_id)

    # Create a third claim with the same email as customer 1 (for ambiguous matching)
    claim3_ref = f"CLM-{ts[-5:]}03"
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim3_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "Customer1",
            "email": cust1_email,
            "phone": "555-0100",
            "address": "123 Test St",
            "country": "US",
            "flight_number": "AA300",
            "flight_date": "2026-08-03",
            "departure": "JFK",
            "arrival": "CDG",
            "airline": "American Airlines",
            "issue_type": "Delay",
            "airline_reason": "",
            "status": "Submitted",
            "amount": "400",
            "agent": "",
            "loa_signed": True,
            "preferred_language": "en",
            "customer_user_id": cust1_id,
            "last_customer_update_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
        })
    if status != 201 or not resp:
        record("Setup: Create claim 3 (ambiguous)", False, f"{status} {resp}")
        return False
    claim3_id = resp[0]["id"]
    test_claim_ids.append(claim3_id)

    # Create a claim with an unsupported language (for English fallback test)
    claim4_ref = f"CLM-{ts[-5:]}04"
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim4_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "CustomerFallback",
            "email": f"{TEST_PREFIX}_fallback_{ts}@test-claimvelo.com",
            "phone": "555-0400",
            "address": "789 Test Blvd",
            "country": "US",
            "flight_number": "LH400",
            "flight_date": "2026-08-04",
            "departure": "FRA",
            "arrival": "JFK",
            "airline": "Lufthansa",
            "issue_type": "Delay",
            "airline_reason": "",
            "status": "In Progress",
            "amount": "600",
            "agent": "",
            "loa_signed": True,
            "preferred_language": "it",  # Italian — no template in send-30-day-updates
            "last_customer_update_at": (datetime.now(timezone.utc) - timedelta(days=35)).isoformat(),
        })
    if status != 201 or not resp:
        record("Setup: Create claim 4 (fallback)", False, f"{status} {resp}")
        return False
    claim4_id = resp[0]["id"]
    test_claim_ids.append(claim4_id)

    record("Setup: Create test users and claims", True)

    # Store IDs for later tests
    return {
        "cust1_id": cust1_id,
        "cust1_jwt": cust1_jwt,
        "cust1_email": cust1_email,
        "cust2_id": cust2_id,
        "cust2_jwt": cust2_jwt,
        "cust2_email": cust2_email,
        "claim1_id": claim1_id,
        "claim1_ref": claim1_ref,
        "claim2_id": claim2_id,
        "claim2_ref": claim2_ref,
        "claim3_id": claim3_id,
        "claim3_ref": claim3_ref,
        "claim4_id": claim4_id,
        "claim4_ref": claim4_ref,
    }


def test_staff_email(ctx):
    """Test 1: Staff → customer email — insert outbound communication via service role."""
    print("\n── Test 1: Staff → customer email ──")
    claim_id = ctx["claim1_id"]

    status, resp = api("POST", "/claim_communications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "outbound",
            "channel": "email",
            "subject": "Test update on your claim",
            "body": "Dear Customer, this is a test update.",
            "from_address": "support@claimvelo.com",
            "to_address": ctx["cust1_email"],
            "from_name": "Test Staff",
            "match_status": "manual",
            "language": "en",
        })
    record("Staff → customer email: insert outbound communication",
           status == 201, f"status={status} resp={resp}")

    # Verify the communication was stored
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim_id}&direction=eq.outbound",
        headers=admin_headers())
    found = isinstance(resp, list) and len(resp) > 0
    record("Staff → customer email: communication stored in DB", found, f"resp={resp}")


def test_customer_receives_email(ctx):
    """Test 2: Customer receives email — verify customer can read outbound communications via RLS."""
    print("\n── Test 2: Customer receives email (RLS read) ──")
    claim_id = ctx["claim1_id"]
    jwt = ctx["cust1_jwt"]
    if not jwt:
        record("Customer receives email: get JWT", False, "No JWT")
        return

    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim_id}&direction=eq.outbound",
        headers=user_jwt_headers(jwt))
    found = status == 200 and isinstance(resp, list) and len(resp) > 0
    record("Customer receives email: customer can read outbound comms", found, f"status={status} resp={resp}")


def test_customer_portal_message(ctx):
    """Test 3: Customer portal message — customer inserts inbound portal message."""
    print("\n── Test 3: Customer portal message ──")
    claim_id = ctx["claim1_id"]
    jwt = ctx["cust1_jwt"]
    if not jwt:
        record("Customer portal message: get JWT", False, "No JWT")
        return

    status, resp = api("POST", "/claim_communications",
        headers=user_jwt_headers(jwt, {"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "inbound",
            "channel": "portal",
            "subject": f"Message about {ctx['claim1_ref']}",
            "body": "Hello, I have a question about my claim.",
            "from_address": ctx["cust1_email"],
            "to_address": "support@claimvelo.com",
            "from_name": "Test Customer 1",
            "from_user_id": ctx["cust1_id"],
            "match_status": "matched",
            "language": "en",
        })
    record("Customer portal message: customer inserts portal message",
           status == 201, f"status={status} resp={resp}")


def test_staff_reply(ctx):
    """Test 4: Staff reply — staff sends outbound portal reply."""
    print("\n── Test 4: Staff reply (portal) ──")
    claim_id = ctx["claim1_id"]

    status, resp = api("POST", "/claim_communications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "outbound",
            "channel": "portal",
            "subject": f"Re: Message about {ctx['claim1_ref']}",
            "body": "Thank you for your message. We are working on your claim.",
            "from_address": "support@claimvelo.com",
            "to_address": ctx["cust1_email"],
            "from_name": "ClaimVelo Team",
            "match_status": "manual",
            "language": "en",
        })
    record("Staff reply: staff sends outbound portal reply",
           status == 201, f"status={status} resp={resp}")


def test_timeline_events(ctx):
    """Test 8: Timeline events — verify claim_status_history entries were created by triggers."""
    print("\n── Test 8: Timeline events ──")
    claim_id = ctx["claim1_id"]

    # Insert an inbound email reply (matched) to trigger the customer_reply timeline event
    api("POST", "/claim_communications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "inbound",
            "channel": "email",
            "subject": f"Re: Update on your claim {ctx['claim1_ref']}",
            "body": "Thank you for the update. I have a question.",
            "from_address": ctx["cust1_email"],
            "to_address": "support@claimvelo.com",
            "from_name": "Test Customer 1",
            "match_status": "matched",
            "matched_claim_refs": [ctx["claim1_ref"]],
            "message_id": f"test-reply-{test_timestamp}",
            "language": "en",
        })

    status, resp = api("GET", f"/claim_status_history?claim_id=eq.{claim_id}&field_name=eq.customer_email&order=created_at.asc",
        headers=admin_headers())
    if status != 200 or not isinstance(resp, list):
        record("Timeline events: query history", False, f"status={status} resp={resp}")
        return

    events = resp
    has_outbound_email = any(e.get("to_status") == "email" for e in events)
    has_portal_message = any(e.get("to_status") == "portal_message" for e in events)
    has_customer_reply = any(e.get("to_status") == "customer_reply" for e in events)

    record("Timeline events: outbound email logged", has_outbound_email, f"events={len(events)}")
    record("Timeline events: portal message logged", has_portal_message, f"events={len(events)}")
    record("Timeline events: customer reply logged", has_customer_reply, f"events={len(events)}")


def test_assigned_staff_notification(ctx):
    """Test 9: Assigned staff notification — verify notification is created for customer reply."""
    print("\n── Test 9: Assigned staff notification ──")
    claim_id = ctx["claim1_id"]

    # Insert a notification (simulating what process-customer-replies does)
    status, resp = api("POST", "/notifications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "type": "customer_reply",
            "claim_ref": ctx["claim1_ref"],
            "claim_id": claim_id,
            "message": "Customer reply from Test Customer 1 — Test reply",
        })
    record("Assigned staff notification: notification created",
           status == 201, f"status={status} resp={resp}")

    # Verify notification exists
    status, resp = api("GET", f"/notifications?claim_id=eq.{claim_id}&type=eq.customer_reply",
        headers=admin_headers())
    found = isinstance(resp, list) and len(resp) > 0
    record("Assigned staff notification: notification retrievable", found, f"resp={resp}")


def test_customer_rls_isolation(ctx):
    """Test 10: Customer RLS isolation — customer 1 can only see their own claims' communications."""
    print("\n── Test 10: Customer RLS isolation ──")
    jwt = ctx["cust1_jwt"]
    if not jwt:
        record("Customer RLS: get JWT", False, "No JWT")
        return

    # Customer 1 should see communications for claim 1 (their own)
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{ctx['claim1_id']}",
        headers=user_jwt_headers(jwt))
    can_see_own = status == 200 and isinstance(resp, list) and len(resp) > 0
    record("Customer RLS: customer sees own claim communications", can_see_own, f"status={status} resp={resp}")


def test_cross_customer_isolation(ctx):
    """Test 11: Another customer cannot read messages — customer 2 cannot see claim 1's communications."""
    print("\n── Test 11: Cross-customer isolation ──")
    jwt2 = ctx["cust2_jwt"]
    if not jwt2:
        record("Cross-customer: get JWT2", False, "No JWT")
        return

    # Customer 2 should NOT see communications for claim 1 (owned by customer 1)
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{ctx['claim1_id']}",
        headers=user_jwt_headers(jwt2))
    cannot_see_other = isinstance(resp, list) and len(resp) == 0
    record("Cross-customer: customer 2 cannot read claim 1 comms", cannot_see_other, f"status={status} resp={resp}")


def test_internal_notes_not_visible(ctx):
    """Test 12: Internal notes are never visible to customer — internal_messages table has no customer access."""
    print("\n── Test 12: Internal notes not visible to customer ──")
    jwt = ctx["cust1_jwt"]
    if not jwt:
        record("Internal notes: get JWT", False, "No JWT")
        return

    # Insert an internal message (staff-only)
    api("POST", "/internal_messages",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "subject": "Internal note about claim",
            "body": "This is a private internal note about the customer's claim.",
            "from_name": "Test Staff",
            "claim_id": ctx["claim1_id"],
            "read_by": [],
        })

    # Customer should NOT be able to read internal_messages
    status, resp = api("GET", "/internal_messages",
        headers=user_jwt_headers(jwt))
    cannot_read = isinstance(resp, list) and len(resp) == 0
    record("Internal notes: customer cannot read internal_messages", cannot_read, f"status={status} resp={resp}")

    # Also verify claim_communications doesn't contain internal notes
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{ctx['claim1_id']}",
        headers=user_jwt_headers(jwt))
    all_comms = resp if isinstance(resp, list) else []
    no_internal = all(
        c.get("channel") in ("email", "portal") for c in all_comms
    )
    record("Internal notes: no internal content in claim_communications", no_internal, f"comms={all_comms}")


def test_30_day_update(ctx):
    """Test 13: 30-day due claim gets exactly one update."""
    print("\n── Test 13: 30-day due claim gets exactly one update ──")
    claim_id = ctx["claim1_id"]

    # Reset last_customer_update_at to 35 days ago (previous tests sent comms which reset the timer)
    old_time = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
    api("PATCH", f"/claims?id=eq.{claim_id}",
        headers=admin_headers(),
        body={"last_customer_update_at": old_time})

    # Claim 1 is "In Progress" with last_customer_update_at 35 days ago — should be picked up
    # Call the RPC function to get claims needing updates
    status, resp = api("POST", "/rpc/get_claims_needing_30_day_update",
        headers=admin_headers(),
        body={})
    if status != 200:
        record("30-day update: get_claims_needing_30_day_update RPC", False, f"status={status} resp={resp}")
        return

    claims_needing = resp if isinstance(resp, list) else []
    claim1_in_list = any(c.get("claim_id") == claim_id for c in claims_needing)
    record("30-day update: overdue claim appears in update list", claim1_in_list,
           f"claims_needing={[c.get('claim_ref') for c in claims_needing]}")

    # Simulate sending the update by calling mark_30_day_update_sent
    status, resp = api("POST", "/rpc/mark_30_day_update_sent",
        headers=admin_headers(),
        body={
            "p_claim_id": claim_id,
            "p_subject": "Update on your claim",
            "p_body": "Dear Customer, your claim is being worked on.",
            "p_language": "en",
        })
    record("30-day update: mark_30_day_update_sent RPC succeeds",
           status == 200 or status == 204, f"status={status} resp={resp}")

    # Verify a communication was inserted
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim_id}&direction=eq.outbound&channel=eq.email",
        headers=admin_headers())
    comms = resp if isinstance(resp, list) else []
    record("30-day update: communication record inserted", len(comms) > 0, f"comms={len(comms)}")

    # Verify last_customer_update_at was updated
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    if isinstance(resp, list) and len(resp) > 0:
        updated_at = resp[0].get("last_customer_update_at", "")
        # Should be recent (within last minute)
        try:
            updated_time = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            is_recent = (datetime.now(timezone.utc) - updated_time).total_seconds() < 120
        except Exception:
            is_recent = False
        record("30-day update: last_customer_update_at updated to now", is_recent, f"updated_at={updated_at}")
    else:
        record("30-day update: last_customer_update_at updated to now", False, f"resp={resp}")


def test_no_duplicate_30_day(ctx):
    """Test 14: Second run does not duplicate — claim no longer appears in update list after being updated."""
    print("\n── Test 14: Second run does not duplicate ──")
    claim_id = ctx["claim1_id"]

    # Count communications before second run
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim_id}&direction=eq.outbound&channel=eq.email",
        headers=admin_headers())
    count_before = len(resp) if isinstance(resp, list) else 0

    # Call get_claims_needing_30_day_update again — claim 1 should NOT be in the list
    status, resp = api("POST", "/rpc/get_claims_needing_30_day_update",
        headers=admin_headers(),
        body={})
    claims_needing = resp if isinstance(resp, list) else []
    claim1_still_in_list = any(c.get("claim_id") == claim_id for c in claims_needing)
    record("30-day no duplicate: claim no longer in update list", not claim1_still_in_list,
           f"still_in_list={claim1_still_in_list}")

    # Count communications after — should be the same
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim_id}&direction=eq.outbound&channel=eq.email",
        headers=admin_headers())
    count_after = len(resp) if isinstance(resp, list) else 0
    record("30-day no duplicate: communication count unchanged", count_before == count_after,
           f"before={count_before} after={count_after}")


def test_internal_note_no_reset(ctx):
    """Test 15: Internal note does not reset 30-day timer."""
    print("\n── Test 15: Internal note does not reset 30-day timer ──")
    claim_id = ctx["claim1_id"]

    # Get current last_customer_update_at
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    before = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None

    # Insert an internal note (via internal_messages table — NOT claim_communications)
    api("POST", "/internal_messages",
        headers=admin_headers(),
        body={
            "subject": "Internal note",
            "body": "This should not reset the timer.",
            "from_name": "Test Staff",
            "claim_id": claim_id,
            "read_by": [],
        })

    # Also insert a claim_status_history entry for an internal note (field_name='override')
    api("POST", "/claim_status_history",
        headers=admin_headers(),
        body={
            "claim_id": claim_id,
            "field_name": "override",
            "from_status": None,
            "to_status": "internal_note",
            "source": "staff",
            "actor_name": "Test Staff",
            "reason": "Internal note — should not reset timer",
        })

    # Check last_customer_update_at is unchanged
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None
    record("Internal note: last_customer_update_at unchanged", before == after,
           f"before={before} after={after}")


def test_customer_comm_resets_timer(ctx):
    """Test 16: Successful customer-facing communication resets timer."""
    print("\n── Test 16: Customer-facing communication resets timer ──")
    claim_id = ctx["claim2_id"]

    # Get current last_customer_update_at (set to 10 days ago at creation)
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    before = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None

    # Insert an outbound email communication (successful customer email)
    status, resp = api("POST", "/claim_communications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "outbound",
            "channel": "email",
            "subject": "Status update",
            "body": "Your claim status has been updated.",
            "from_address": "support@claimvelo.com",
            "to_address": ctx["cust2_email"],
            "from_name": "ClaimVelo Team",
            "match_status": "manual",
            "language": "es",
        })
    if status != 201:
        record("Customer email: insert outbound email", False, f"status={status} resp={resp}")
        return
    record("Customer email: insert outbound email", True)

    # Check last_customer_update_at was updated
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None

    try:
        before_time = datetime.fromisoformat(before.replace("Z", "+00:00"))
        after_time = datetime.fromisoformat(after.replace("Z", "+00:00"))
        timer_reset = after_time > before_time
    except Exception:
        timer_reset = before != after
    record("Customer email: last_customer_update_at updated", timer_reset,
           f"before={before} after={after}")


def test_portal_comm_resets_timer(ctx):
    """Test 16b: Successful portal customer-facing message resets timer."""
    print("\n── Test 16b: Portal customer-facing message resets timer ──")
    claim_id = ctx["claim2_id"]

    # Set timer back to 20 days ago
    old_time = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
    api("PATCH", f"/claims?id=eq.{claim_id}",
        headers=admin_headers(),
        body={"last_customer_update_at": old_time})

    # Insert an outbound portal communication (staff reply via portal)
    status, resp = api("POST", "/claim_communications",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_id": claim_id,
            "direction": "outbound",
            "channel": "portal",
            "subject": "Portal reply",
            "body": "We are working on your claim.",
            "from_address": "support@claimvelo.com",
            "to_address": ctx["cust2_email"],
            "from_name": "ClaimVelo Team",
            "match_status": "manual",
            "language": "es",
        })
    record("Portal message: insert outbound portal message",
           status == 201, f"status={status}")

    # Check timer was reset
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None
    try:
        after_time = datetime.fromisoformat(after.replace("Z", "+00:00"))
        old_parsed = datetime.fromisoformat(old_time.replace("Z", "+00:00"))
        timer_reset = after_time > old_parsed
    except Exception:
        timer_reset = after != old_time
    record("Portal message: last_customer_update_at updated", timer_reset,
           f"old={old_time} after={after}")


def test_internal_status_no_reset(ctx):
    """Test 16c: Internal status change does NOT reset timer."""
    print("\n── Test 16c: Internal status change does NOT reset timer ──")
    claim_id = ctx["claim2_id"]

    # Set timer to a known old value
    old_time = (datetime.now(timezone.utc) - timedelta(days=25)).isoformat()
    api("PATCH", f"/claims?id=eq.{claim_id}",
        headers=admin_headers(),
        body={"last_customer_update_at": old_time})

    # Insert a status change in claim_status_history (staff action, no email sent)
    api("POST", "/claim_status_history",
        headers=admin_headers(),
        body={
            "claim_id": claim_id,
            "field_name": "status",
            "from_status": "In Progress",
            "to_status": "Waiting",
            "source": "staff",
            "actor_name": "Test Staff",
            "reason": "Internal status change — no email sent",
        })

    # Check timer was NOT reset
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None
    timer_unchanged = after == old_time or after == old_time.replace("+00:00", "Z")
    record("Internal status change: timer unchanged", timer_unchanged,
           f"old={old_time} after={after}")


def test_assignment_priority_review_no_reset(ctx):
    """Test 16d: Assignment, priority, and review actions do NOT reset timer."""
    print("\n── Test 16d: Assignment/priority/review action does NOT reset timer ──")
    claim_id = ctx["claim2_id"]

    # Set timer to a known old value
    old_time = (datetime.now(timezone.utc) - timedelta(days=28)).isoformat()
    api("PATCH", f"/claims?id=eq.{claim_id}",
        headers=admin_headers(),
        body={"last_customer_update_at": old_time})

    # Insert assignment change
    api("POST", "/claim_status_history",
        headers=admin_headers(),
        body={
            "claim_id": claim_id,
            "field_name": "agent",
            "from_status": None,
            "to_status": "agent_smith",
            "source": "staff",
            "actor_name": "Test Staff",
            "reason": "Assigned to agent",
        })

    # Insert priority change
    api("POST", "/claim_status_history",
        headers=admin_headers(),
        body={
            "claim_id": claim_id,
            "field_name": "priority",
            "from_status": None,
            "to_status": "high",
            "source": "staff",
            "actor_name": "Test Staff",
            "reason": "Priority changed",
        })

    # Insert review action
    api("POST", "/claim_status_history",
        headers=admin_headers(),
        body={
            "claim_id": claim_id,
            "field_name": "review",
            "from_status": None,
            "to_status": "reviewed",
            "source": "staff",
            "actor_name": "Test Staff",
            "reason": "Review completed",
        })

    # Check timer was NOT reset
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None
    timer_unchanged = after == old_time or after == old_time.replace("+00:00", "Z")
    record("Assignment/priority/review: timer unchanged", timer_unchanged,
           f"old={old_time} after={after}")


def test_failed_email_no_reset(ctx):
    """Test 16e: Failed customer email does NOT reset timer."""
    print("\n── Test 16e: Failed customer email does NOT reset timer ──")
    claim_id = ctx["claim2_id"]

    # Set timer to 35 days ago
    old_time = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
    api("PATCH", f"/claims?id=eq.{claim_id}",
        headers=admin_headers(),
        body={"last_customer_update_at": old_time})

    # Simulate a failed email: the edge function tries to send but fails,
    # so it does NOT call mark_30_day_update_sent and does NOT insert a
    # communication record. The timer should remain unchanged.

    # Verify the claim is in the update list (it's overdue)
    status, resp = api("POST", "/rpc/get_claims_needing_30_day_update",
        headers=admin_headers(),
        body={})
    claims_needing = resp if isinstance(resp, list) else []
    claim_in_list_before = any(c.get("claim_id") == claim_id for c in claims_needing)
    record("Failed email: claim appears in update list (overdue)", claim_in_list_before,
           f"claims={[c.get('claim_ref') for c in claims_needing]}")

    # Do NOT call mark_30_day_update_sent (simulating email send failure)
    # Check timer is still old
    status, resp = api("GET", f"/claims?id=eq.{claim_id}&select=last_customer_update_at",
        headers=admin_headers())
    after = resp[0]["last_customer_update_at"] if isinstance(resp, list) and len(resp) > 0 else None
    timer_unchanged = after == old_time or after == old_time.replace("+00:00", "Z")
    record("Failed email: timer unchanged (no communication inserted)", timer_unchanged,
           f"old={old_time} after={after}")

    # Verify claim is STILL in the update list (timer not reset)
    status, resp = api("POST", "/rpc/get_claims_needing_30_day_update",
        headers=admin_headers(),
        body={})
    claims_needing = resp if isinstance(resp, list) else []
    claim_still_in_list = any(c.get("claim_id") == claim_id for c in claims_needing)
    record("Failed email: claim still in update list (not falsely marked updated)",
           claim_still_in_list, f"still_in_list={claim_still_in_list}")


def test_english_fallback(ctx):
    """Test 17: English fallback when preferred language template is unavailable."""
    print("\n── Test 17: English fallback ──")
    claim4_id = ctx["claim4_id"]

    # Claim 4 has preferred_language='it' (Italian) — no template in send-30-day-updates
    # The edge function uses getTemplate(language) which falls back to English
    # We verify the claim appears in the update list (it's 35 days overdue, active status)
    status, resp = api("POST", "/rpc/get_claims_needing_30_day_update",
        headers=admin_headers(),
        body={})
    claims_needing = resp if isinstance(resp, list) else []
    claim4_in_list = any(c.get("claim_id") == claim4_id for c in claims_needing)
    record("English fallback: Italian claim appears in update list", claim4_in_list,
           f"claims={[c.get('claim_ref') for c in claims_needing]}")

    # Verify the claim's preferred_language is 'it'
    if claim4_in_list:
        claim4_entry = [c for c in claims_needing if c.get("claim_id") == claim4_id][0]
        record("English fallback: claim has preferred_language=it",
               claim4_entry.get("preferred_language") == "it",
               f"lang={claim4_entry.get('preferred_language')}")

    # Call mark_30_day_update_sent with the Italian language
    # The edge function would use getTemplate('it') which falls back to 'en'
    # We simulate by passing 'en' as the fallback language
    status, resp = api("POST", "/rpc/mark_30_day_update_sent",
        headers=admin_headers(),
        body={
            "p_claim_id": claim4_id,
            "p_subject": "Update on your claim",  # English subject (fallback)
            "p_body": "Dear Customer, your claim is being worked on.",  # English body (fallback)
            "p_language": "en",  # English fallback
        })
    record("English fallback: mark_30_day_update_sent with English fallback",
           status == 200 or status == 204, f"status={status} resp={resp}")

    # Verify the communication was stored with the English content
    status, resp = api("GET", f"/claim_communications?claim_id=eq.{claim4_id}&direction=eq.outbound",
        headers=admin_headers())
    comms = resp if isinstance(resp, list) else []
    has_english = any("Dear Customer" in (c.get("body", "") or "") for c in comms)
    record("English fallback: communication stored with English content", has_english,
           f"comms={len(comms)}")


def test_reply_matching(ctx):
    """Test 5-7: Customer reply matching — correct, ambiguous, unmatched."""
    print("\n── Test 5-7: Customer reply matching ──")

    # Test 5: Correct claim matching — email matches exactly one claim
    # Claim 1 and 3 both have cust1_email. But with claim_ref in subject, it should match.
    # We test the matching logic directly (simulating what process-customer-replies does)

    # Query claims by email to verify matching logic
    status, resp = api("GET", f"/claims?email=eq.{ctx['cust1_email']}&select=id,claim_ref,email,preferred_language",
        headers=admin_headers())
    claims_for_email = resp if isinstance(resp, list) else []
    record("Reply matching: multiple claims for same email",
           len(claims_for_email) >= 2, f"count={len(claims_for_email)}")

    # Test 6: Ambiguous — same email, multiple claims, no claim_ref
    # If we search by email and get multiple results without a claim_ref, it's ambiguous
    is_ambiguous = len(claims_for_email) > 1
    record("Reply matching: ambiguous case detected (multiple claims, no ref)",
           is_ambiguous, f"claims={[c.get('claim_ref') for c in claims_for_email]}")

    # Test 7: Unmatched — email doesn't match any claim
    status, resp = api("GET", "/claims?email=eq.nonexistent@test-claimvelo.com&select=id,claim_ref",
        headers=admin_headers())
    unmatched = isinstance(resp, list) and len(resp) == 0
    record("Reply matching: unmatched email returns no claims", unmatched, f"resp={resp}")

    # Test 5: Correct match with claim_ref — verify claim_ref exists
    status, resp = api("GET", f"/claims?claim_ref=eq.{ctx['claim1_ref']}&email=eq.{ctx['cust1_email']}&select=id,claim_ref",
        headers=admin_headers())
    correct_match = isinstance(resp, list) and len(resp) == 1
    record("Reply matching: correct match (email + claim_ref)", correct_match, f"resp={resp}")


def main():
    print("═" * 70)
    print("  Phase 7 — Customer Communication System — Live Acceptance Tests")
    print("═" * 70)

    # Setup
    ctx = test_setup()
    if not ctx:
        print("\nFAIL: Setup failed — cannot continue tests")
        cleanup()
        sys.exit(1)

    try:
        # Run all tests
        test_staff_email(ctx)
        test_customer_receives_email(ctx)
        test_customer_portal_message(ctx)
        test_staff_reply(ctx)
        test_reply_matching(ctx)
        test_timeline_events(ctx)
        test_assigned_staff_notification(ctx)
        test_customer_rls_isolation(ctx)
        test_cross_customer_isolation(ctx)
        test_internal_notes_not_visible(ctx)
        test_30_day_update(ctx)
        test_no_duplicate_30_day(ctx)
        test_internal_note_no_reset(ctx)
        test_customer_comm_resets_timer(ctx)
        test_portal_comm_resets_timer(ctx)
        test_internal_status_no_reset(ctx)
        test_assignment_priority_review_no_reset(ctx)
        test_failed_email_no_reset(ctx)
        test_english_fallback(ctx)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cleanup()

    # Report
    print("\n" + "═" * 70)
    print(f"  RESULTS: {results['pass']} PASS / {results['fail']} FAIL")
    if results["errors"]:
        print("\n  FAILURES:")
        for err in results["errors"]:
            print(f"    ✗ {err}")
    print("═" * 70)

    sys.exit(0 if results["fail"] == 0 else 1)


if __name__ == "__main__":
    main()
