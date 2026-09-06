#!/usr/bin/env python3
"""
Phase 8B — Agent & Sales Manager UI — Live Acceptance Tests

Tests against the live Supabase backend using the REST API + edge functions.
Uses service_role key for setup/cleanup and user JWTs for RLS / workflow tests.

Covers:
  1.  Agent sees only their own dashboard data (claims + commissions)
  2.  Agent sees correct claim count and commission totals
  3.  Agent referral link/QR preserves correct attribution
  4.  Agent-created lead is attributed correctly (server-side validation)
  5.  Agent cannot alter commission rate/amount/status directly
  6.  Manager sees only their own team (agents, claims, commissions)
  7.  Manager filters return correct results
  8.  Commission status workflow persists correctly (pending → approved → paid)
  9.  Existing customer/admin flows still work
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

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
ACCESS_TOKEN = env.get("SUPABASE_ACCESS_TOKEN", "")
PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "") if SUPABASE_URL else ""

if not SUPABASE_URL or not SERVICE_ROLE_KEY or not ANON_KEY:
    print("FAIL: Missing SUPABASE_URL, SERVICE_ROLE_KEY, or ANON_KEY")
    sys.exit(1)

BASE = f"{SUPABASE_URL}/rest/v1"
AUTH_BASE = f"{SUPABASE_URL}/auth/v1"
EDGE_BASE = f"{SUPABASE_URL}/functions/v1"

TEST_PREFIX = "p8b"
ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
results = {"pass": 0, "fail": 0, "errors": []}

created_user_ids = []
created_worker_ids = []
created_claim_ids = []


def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    if passed:
        results["pass"] += 1
    else:
        results["fail"] += 1
        results["errors"].append(f"{name}: {detail}")
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not passed else ""))


def api(method, path, headers=None, body=None, base=BASE):
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
    h = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    if extra:
        h.update(extra)
    return h


def anon_headers(extra=None):
    h = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    if extra:
        h.update(extra)
    return h


def user_headers(jwt, extra=None):
    h = {"apikey": ANON_KEY, "Authorization": f"Bearer {jwt}"}
    if extra:
        h.update(extra)
    return h


def create_user(email, password, full_name, role="customer"):
    """Create a test user via Admin API, set profile role, return (user_id, jwt)."""
    api("POST", "/admin/users",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        body={"email": email, "password": password, "email_confirm": True,
              "user_metadata": {"full_name": full_name}},
        base=AUTH_BASE)
    status, resp = api("POST", "/token?grant_type=password",
        headers={"apikey": ANON_KEY},
        body={"email": email, "password": password},
        base=AUTH_BASE)
    jwt = None
    user_id = None
    if status == 200 and isinstance(resp, dict):
        jwt = resp.get("access_token")
        u = resp.get("user")
        if isinstance(u, dict):
            user_id = u.get("id")
    if not user_id or not jwt:
        return None, None
    created_user_ids.append(user_id)
    # Upsert profile (INSERT if missing, then PATCH role)
    api("POST", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation,resolution=merge-duplicates"}),
        body={"id": user_id, "role": role, "full_name": full_name, "email": email})
    api("PATCH", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"role": role, "full_name": full_name, "email": email})
    return user_id, jwt


def cleanup():
    print("\n── Cleaning up test data ──")
    for cid in created_claim_ids:
        api("DELETE", f"/claims?id=eq.{cid}", headers=admin_headers())
    for uid in created_user_ids:
        api("DELETE", f"/worker_profiles?user_id=eq.{uid}", headers=admin_headers())
    for uid in created_user_ids:
        api("DELETE", f"/admin/users/{uid}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
            base=AUTH_BASE)
    api("DELETE", f"/worker_profiles?email=like.{TEST_PREFIX}%25", headers=admin_headers())
    print("  Cleanup complete.")


def main():
    print("=" * 70)
    print("Phase 8B — Agent & Sales Manager UI — Acceptance Tests")
    print("=" * 70)

    # ── Setup ─────────────────────────────────────────────────────────────────
    print("\n── Setup: creating test users ──")
    mgrA_id, mgrA_jwt = create_user(f"{TEST_PREFIX}_mgrA_{ts}@test.com", "TestPass123!", f"P8B MgrA {ts}", "sales_manager")
    mgrB_id, mgrB_jwt = create_user(f"{TEST_PREFIX}_mgrB_{ts}@test.com", "TestPass123!", f"P8B MgrB {ts}", "sales_manager")
    agentA1_id, agentA1_jwt = create_user(f"{TEST_PREFIX}_agentA1_{ts}@test.com", "TestPass123!", f"P8B AgentA1 {ts}", "agent")
    agentB1_id, agentB1_jwt = create_user(f"{TEST_PREFIX}_agentB1_{ts}@test.com", "TestPass123!", f"P8B AgentB1 {ts}", "agent")
    cust_id, cust_jwt = create_user(f"{TEST_PREFIX}_cust_{ts}@test.com", "TestPass123!", f"P8B Cust {ts}", "customer")

    if not all([mgrA_id, mgrB_id, agentA1_id, agentB1_id, cust_id]):
        print("FAIL: could not create all test users")
        cleanup()
        sys.exit(1)

    codeA1 = f"A1{ts[-4:]}"
    codeB1 = f"B1{ts[-4:]}"

    for uid, name, code, mgr in [
        (agentA1_id, f"P8B AgentA1 {ts}", codeA1, mgrA_id),
        (agentB1_id, f"P8B AgentB1 {ts}", codeB1, mgrB_id),
    ]:
        st, resp = api("POST", "/worker_profiles",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"user_id": uid, "email": f"{TEST_PREFIX}_agent_{code}@test.com",
                  "full_name": name, "role": "agent", "status": "active",
                  "agent_code": code, "manager_id": mgr, "commission_rate": 10})
        if isinstance(resp, list) and resp:
            created_worker_ids.append(resp[0]["id"])

    st, wpA = api("GET", f"/worker_profiles?user_id=eq.{agentA1_id}&select=id,agent_code",
        headers=admin_headers())
    wpA_id = wpA[0]["id"] if isinstance(wpA, list) and wpA else None
    st, wpB = api("GET", f"/worker_profiles?user_id=eq.{agentB1_id}&select=id,agent_code",
        headers=admin_headers())
    wpB_id = wpB[0]["id"] if isinstance(wpB, list) and wpB else None

    if not wpA_id or not wpB_id:
        print("FAIL: could not create worker profiles")
        cleanup()
        sys.exit(1)

    # Create claims: 3 for agent A1, 1 for agent B1
    claim_a_ids = []
    for i in range(3):
        st, resp = api("POST", "/claims",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"claim_ref": f"P8B-A{i}-{ts}", "passenger_first_name": "Test",
                  "passenger_last_name": str(i), "email": f"{TEST_PREFIX}_cust_{ts}@test.com",
                  "flight_number": "BA100", "departure": "LHR", "arrival": "JFK",
                  "airline": "British Airways", "issue_type": "Delay",
                  "status": "Resolved" if i < 2 else "In Progress",
                  "eligibility_status": "Eligible" if i < 2 else "Pending Check",
                  "amount": "€600", "agent": codeA1, "agent_id": wpA_id,
                  "compensation_amount": 600 if i < 2 else None,
                  "country": "United Kingdom"})
        if isinstance(resp, list) and resp:
            claim_a_ids.append(resp[0]["id"])
            created_claim_ids.append(resp[0]["id"])

    st, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"claim_ref": f"P8B-B0-{ts}", "passenger_first_name": "TestB",
              "passenger_last_name": "0", "email": f"{TEST_PREFIX}_custB_{ts}@test.com",
              "flight_number": "AF200", "departure": "CDG", "arrival": "LAX",
              "airline": "Air France", "issue_type": "Cancellation",
              "status": "Resolved", "eligibility_status": "Eligible",
              "amount": "€600", "agent": codeB1, "agent_id": wpB_id,
              "compensation_amount": 600, "country": "France"})
    if isinstance(resp, list) and resp:
        created_claim_ids.append(resp[0]["id"])

    # Create commission records for agent A1's resolved claims
    comm_a_ids = []
    for cid in claim_a_ids[:2]:
        st, resp = api("POST", "/commissions",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"agent_id": wpA_id, "claim_id": cid,
                  "commission_rate": 10, "commission_amount": 60,
                  "commission_status": "pending"})
        if isinstance(resp, list) and resp:
            comm_a_ids.append(resp[0]["id"])

    # ── Test 1: Agent sees only their own dashboard data ──────────────────────
    print("\n── Test 1: Agent sees only own data ──")
    st, resp = api("GET", f"/claims?agent_id=eq.{wpA_id}&select=id,agent_id",
        headers=user_headers(agentA1_jwt))
    a_claims = resp if isinstance(resp, list) else []
    record("Agent A1 sees own claims", len(a_claims) == 3,
           f"expected 3, got {len(a_claims)}")

    st, resp = api("GET", f"/commissions?agent_id=eq.{wpA_id}&select=id",
        headers=user_headers(agentA1_jwt))
    a_comms = resp if isinstance(resp, list) else []
    record("Agent A1 sees own commissions", len(a_comms) == 2,
           f"expected 2, got {len(a_comms)}")

    st, resp = api("GET", f"/claims?agent_id=eq.{wpB_id}&select=id",
        headers=user_headers(agentA1_jwt))
    cross = resp if isinstance(resp, list) else []
    record("Agent A1 cannot see agent B1 claims", len(cross) == 0,
           f"got {len(cross)}")

    # ── Test 2: Agent sees correct claim count and commission totals ──────────
    print("\n── Test 2: Correct claim count and commission totals ──")
    st, resp = api("GET", f"/claims?agent_id=eq.{wpA_id}&select=status,compensation_amount",
        headers=user_headers(agentA1_jwt))
    claims_data = resp if isinstance(resp, list) else []
    resolved_count = sum(1 for c in claims_data if c.get("status") == "Resolved")
    record("Agent A1 resolved count correct", resolved_count == 2,
           f"expected 2, got {resolved_count}")
    comp_total = sum((c.get("compensation_amount") or 0) for c in claims_data)
    record("Agent A1 compensation total correct", comp_total == 1200,
           f"expected 1200, got {comp_total}")

    st, resp = api("GET", f"/commissions?agent_id=eq.{wpA_id}&select=commission_amount,commission_status",
        headers=user_headers(agentA1_jwt))
    comm_data = resp if isinstance(resp, list) else []
    comm_total = sum((c.get("commission_amount") or 0) for c in comm_data)
    record("Agent A1 commission total correct", comm_total == 120,
           f"expected 120, got {comm_total}")

    # ── Test 3: Agent referral link/QR preserves attribution ────────────────────
    print("\n── Test 3: Referral link preserves attribution ──")
    st, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(), body={"p_code": codeA1})
    valid = isinstance(resp, list) and resp and resp[0].get("valid") is True
    record("validate_agent_code accepts valid code", valid, str(resp))

    st, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(), body={"p_code": "FAKE999"})
    invalid = (isinstance(resp, list) and len(resp) == 0) or resp is None
    record("validate_agent_code rejects invalid code", invalid, str(resp))

    # ── Test 4: Agent-created lead is attributed correctly ─────────────────────
    print("\n── Test 4: Agent-created lead attributed correctly ──")
    st, resp = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": {
            "passenger_first_name": "LeadTest", "passenger_last_name": "P8B",
            "email": f"{TEST_PREFIX}_lead_{ts}@test.com",
            "flight_number": "LH400", "flight_date": "2026-08-01",
            "departure": "FRA", "arrival": "JFK", "airline": "Lufthansa",
            "issue_type": "Delay", "agent": codeA1, "loa_signed": False,
        }}, base=EDGE_BASE)
    lead_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    lead_claim_id = resp.get("claim_id") if isinstance(resp, dict) else None
    if lead_claim_id:
        created_claim_ids.append(lead_claim_id)
    record("Create-claim accepts agent code", lead_ok, str(resp)[:200] if not lead_ok else "")

    if lead_claim_id:
        st, resp = api("GET", f"/claims?id=eq.{lead_claim_id}&select=agent,agent_id",
            headers=admin_headers())
        lead_data = resp[0] if isinstance(resp, list) and resp else {}
        record("Lead attributed to correct agent_code", lead_data.get("agent") == codeA1,
               str(lead_data))
        record("Lead attributed to correct agent_id", lead_data.get("agent_id") == wpA_id,
               str(lead_data))

    # Invalid code is silently dropped (no fake attribution)
    st, resp = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": {
            "passenger_first_name": "BadLead", "passenger_last_name": "P8B",
            "email": f"{TEST_PREFIX}_badlead_{ts}@test.com",
            "flight_number": "BA999", "departure": "LHR", "arrival": "CDG",
            "airline": "British Airways", "issue_type": "Delay",
            "agent": "FAKE999", "loa_signed": False,
        }}, base=EDGE_BASE)
    bad_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    bad_id = resp.get("claim_id") if isinstance(resp, dict) else None
    if bad_id:
        created_claim_ids.append(bad_id)
    if bad_ok and bad_id:
        st, resp = api("GET", f"/claims?id=eq.{bad_id}&select=agent,agent_id",
            headers=admin_headers())
        bad_data = resp[0] if isinstance(resp, list) and resp else {}
        record("Invalid agent code dropped (no fake attribution)",
               bad_data.get("agent") == "—" and bad_data.get("agent_id") is None,
               str(bad_data))
    else:
        record("Invalid agent code dropped (no fake attribution)", False, "create-claim failed")

    # ── Test 5: Agent cannot alter commission rate/amount/status directly ─────
    print("\n── Test 5: Agent cannot alter commission fields directly ──")
    if comm_a_ids:
        # Attempt to change commission_status — verify it did NOT change
        api("PATCH", f"/commissions?id=eq.{comm_a_ids[0]}",
            headers=user_headers(agentA1_jwt),
            body={"commission_status": "paid"})
        st, resp = api("GET", f"/commissions?id=eq.{comm_a_ids[0]}&select=commission_status",
            headers=admin_headers())
        cur_status = resp[0].get("commission_status") if isinstance(resp, list) and resp else None
        record("Agent cannot update commission_status", cur_status == "pending",
               f"status is {cur_status}")

        api("PATCH", f"/commissions?id=eq.{comm_a_ids[0]}",
            headers=user_headers(agentA1_jwt),
            body={"commission_amount": 9999})
        st, resp = api("GET", f"/commissions?id=eq.{comm_a_ids[0]}&select=commission_amount",
            headers=admin_headers())
        cur_amt = resp[0].get("commission_amount") if isinstance(resp, list) and resp else None
        record("Agent cannot update commission_amount", cur_amt == 60,
               f"amount is {cur_amt}")

    # Attempt to change own commission_rate — verify it did NOT change
    api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_headers(agentA1_jwt),
        body={"commission_rate": 99})
    st, resp = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=commission_rate",
        headers=admin_headers())
    cur_rate = resp[0].get("commission_rate") if isinstance(resp, list) and resp else None
    record("Agent cannot update own commission_rate", cur_rate == 10,
           f"rate is {cur_rate}")

    api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_headers(agentA1_jwt),
        body={"total_payout_earned": 99999})
    st, resp = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=total_payout_earned",
        headers=admin_headers())
    cur_payout = resp[0].get("total_payout_earned") if isinstance(resp, list) and resp else None
    record("Agent cannot update own total_payout_earned", cur_payout == 0,
           f"payout is {cur_payout}")

    # ── Test 6: Manager sees only their own team ───────────────────────────────
    print("\n── Test 6: Manager sees only own team ──")
    st, resp = api("GET", "/worker_profiles?select=id,agent_code,manager_id",
        headers=user_headers(mgrA_jwt))
    mgr_agents = resp if isinstance(resp, list) else []
    mgr_a_codes = [a.get("agent_code") for a in mgr_agents]
    record("Manager A sees agent A1", codeA1 in mgr_a_codes, str(mgr_a_codes))
    record("Manager A cannot see agent B1", codeB1 not in mgr_a_codes, str(mgr_a_codes))

    st, resp = api("GET", "/claims?select=id,agent_id,claim_ref",
        headers=user_headers(mgrA_jwt))
    mgr_claims = resp if isinstance(resp, list) else []
    mgr_a_claim_agents = set(c.get("agent_id") for c in mgr_claims if c.get("agent_id"))
    record("Manager A sees team A claims", wpA_id in mgr_a_claim_agents, str(mgr_a_claim_agents))
    record("Manager A cannot see team B claims", wpB_id not in mgr_a_claim_agents,
           str(mgr_a_claim_agents))

    st, resp = api("GET", "/commissions?select=id,agent_id",
        headers=user_headers(mgrA_jwt))
    mgr_comms = resp if isinstance(resp, list) else []
    mgr_comm_agents = set(c.get("agent_id") for c in mgr_comms if c.get("agent_id"))
    record("Manager A sees team A commissions", wpA_id in mgr_comm_agents, str(mgr_comm_agents))
    record("Manager A cannot see team B commissions", wpB_id not in mgr_comm_agents,
           str(mgr_comm_agents))

    # ── Test 7: Manager filters return correct results ─────────────────────────
    print("\n── Test 7: Manager filters return correct results ──")
    st, resp = api("GET", "/claims?airline=eq.British%20Airways&select=claim_ref,airline",
        headers=user_headers(mgrA_jwt))
    ba_claims = resp if isinstance(resp, list) else []
    all_ba = all(c.get("airline") == "British Airways" for c in ba_claims)
    record("Airline filter returns only matching claims", all_ba and len(ba_claims) > 0,
           f"got {len(ba_claims)} claims")

    st, resp = api("GET", "/claims?status=eq.Resolved&select=claim_ref,status",
        headers=user_headers(mgrA_jwt))
    resolved_claims = resp if isinstance(resp, list) else []
    all_resolved = all(c.get("status") == "Resolved" for c in resolved_claims)
    record("Status filter returns only resolved claims", all_resolved, str(resolved_claims)[:200])

    st, resp = api("GET", "/claims?country=eq.United%20Kingdom&select=claim_ref,country",
        headers=user_headers(mgrA_jwt))
    uk_claims = resp if isinstance(resp, list) else []
    all_uk = all(c.get("country") == "United Kingdom" for c in uk_claims)
    record("Country filter returns only UK claims", all_uk, str(uk_claims)[:200])

    # ── Test 8: Commission status workflow persists (server-side) ──────────────
    print("\n── Test 8: Commission workflow persists via server-side logic ──")
    if comm_a_ids:
        # Approve via edge function as manager A
        st, resp = api("POST", "/manage-agent-finance",
            headers=user_headers(mgrA_jwt),
            body={"action": "approve-commission", "commissionId": comm_a_ids[0]},
            base=EDGE_BASE)
        approved = st == 200 and isinstance(resp, dict) and resp.get("success") is True
        record("Manager A approves commission (pending → approved)", approved,
               str(resp)[:200] if not approved else "")

        st, resp = api("GET", f"/commissions?id=eq.{comm_a_ids[0]}&select=commission_status",
            headers=admin_headers())
        status = resp[0].get("commission_status") if isinstance(resp, list) and resp else None
        record("Commission status persisted as approved", status == "approved",
               f"got {status}")

        # Pay via edge function as manager A
        st, resp = api("POST", "/manage-agent-finance",
            headers=user_headers(mgrA_jwt),
            body={"action": "pay-commission", "commissionId": comm_a_ids[0]},
            base=EDGE_BASE)
        paid = st == 200 and isinstance(resp, dict) and resp.get("success") is True
        record("Manager A marks commission paid (approved → paid)", paid,
               str(resp)[:200] if not paid else "")

        st, resp = api("GET", f"/commissions?id=eq.{comm_a_ids[0]}&select=commission_status,paid_at",
            headers=admin_headers())
        row = resp[0] if isinstance(resp, list) and resp else {}
        record("Commission status persisted as paid", row.get("commission_status") == "paid",
               str(row))
        record("Commission paid_at set", row.get("paid_at") is not None, str(row))

        # Cannot approve an already-paid commission (should fail)
        st, resp = api("POST", "/manage-agent-finance",
            headers=user_headers(mgrA_jwt),
            body={"action": "approve-commission", "commissionId": comm_a_ids[0]},
            base=EDGE_BASE)
        record("Cannot re-approve paid commission", st >= 400, f"got status {st}")

        # Cannot pay a pending commission (must be approved first)
        if len(comm_a_ids) > 1:
            st, resp = api("POST", "/manage-agent-finance",
                headers=user_headers(mgrA_jwt),
                body={"action": "pay-commission", "commissionId": comm_a_ids[1]},
                base=EDGE_BASE)
            record("Cannot pay pending commission (must approve first)", st >= 400,
                   f"got status {st}")

        # Manager B cannot approve team A's commission
        st, resp = api("POST", "/manage-agent-finance",
            headers=user_headers(mgrB_jwt),
            body={"action": "approve-commission", "commissionId": comm_a_ids[1]},
            base=EDGE_BASE)
        record("Manager B cannot approve team A commission", st >= 400,
               f"got status {st}")

    # ── Test 9: Existing customer/admin flows still work ───────────────────────
    print("\n── Test 9: Existing customer/admin flows still work ──")
    st, resp = api("GET", f"/profiles?id=eq.{cust_id}&select=id,role",
        headers=user_headers(cust_jwt))
    cust_ok = st == 200 and isinstance(resp, list) and len(resp) == 1 and resp[0].get("role") == "customer"
    record("Customer can read own profile", cust_ok, str(resp)[:200])

    st, resp = api("GET", "/claims?select=id&limit=5", headers=admin_headers())
    admin_ok = st == 200 and isinstance(resp, list)
    record("Admin can read claims", admin_ok, str(resp)[:200])

    st, resp = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": {
            "passenger_first_name": "PublicTest", "passenger_last_name": "P8B",
            "email": f"{TEST_PREFIX}_public_{ts}@test.com",
            "flight_number": "EZ500", "departure": "LGW", "arrival": "DUB",
            "airline": "EasyJet", "issue_type": "Delay", "loa_signed": False,
        }}, base=EDGE_BASE)
    public_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    pub_id = resp.get("claim_id") if isinstance(resp, dict) else None
    if pub_id:
        created_claim_ids.append(pub_id)
    record("Public create-claim still works", public_ok,
           str(resp)[:200] if not public_ok else "")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"Results: {results['pass']} passed, {results['fail']} failed")
    if results["errors"]:
        print("Failures:")
        for e in results["errors"]:
            print(f"  - {e}")
    print("=" * 70)

    cleanup()
    sys.exit(0 if results["fail"] == 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        cleanup()
        sys.exit(1)
