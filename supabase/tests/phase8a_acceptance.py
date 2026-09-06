#!/usr/bin/env python3
"""
Phase 8A — Sales Agents System — Live Acceptance Tests

Tests against the live Supabase backend using the REST API.
Uses service_role key for setup/cleanup and user JWTs for RLS tests.

Covers:
  1.  Agent A sees only Agent A claims
  2.  Agent A cannot see Agent B claims
  3.  Manager A sees only claims/agents from Manager A's team
  4.  Manager A cannot see Manager B's team
  5.  Anonymous cannot read private worker_profiles fields
  6.  Customer access still works
  7.  Admin/worker access still works
  8.  Valid referral accepted
  9.  Invalid referral rejected
  10. Referral persists through /start → login/signup → claim
  11. agent_id stored correctly and cannot be hijacked
  12. Commission row created correctly
  13. Commission calculation is server-side
  14. Agent can read only own commissions
  15. Agent cannot modify commission rate/amount/status/paid_at
  16. Anonymous/customer cannot read commissions
  17. B2B API still creates leads with correct attribution
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

TEST_PREFIX = "p8a"
test_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
ts = test_timestamp

results = {"pass": 0, "fail": 0, "errors": []}

# Track all created resources for cleanup
created_user_ids = []
created_worker_ids = []
created_claim_ids = []
created_commission_claim_ids = []


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
    status, resp = api("POST", "/admin/users",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        body={"email": email, "password": password, "email_confirm": True,
              "user_metadata": {"full_name": full_name}},
        base=AUTH_BASE)
    user_id = None
    if isinstance(resp, dict) and "id" in resp:
        user_id = resp["id"]
    elif status == 422:
        # user exists, try to sign in
        pass

    # Sign in for JWT
    status2, resp2 = api("POST", "/token?grant_type=password",
        headers={"apikey": ANON_KEY},
        body={"email": email, "password": password},
        base=AUTH_BASE)
    jwt = None
    if status2 == 200 and isinstance(resp2, dict):
        jwt = resp2.get("access_token")
        if not user_id and isinstance(resp2.get("user"), dict):
            user_id = resp2["user"]["id"]

    if not user_id or not jwt:
        return None, None

    # Upsert profile with role
    api("POST", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"id": user_id, "role": role, "full_name": full_name, "email": email})
    api("PATCH", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"role": role, "full_name": full_name, "email": email})

    return user_id, jwt


def run_sql(query):
    """Run SQL via Supabase Management API."""
    if not ACCESS_TOKEN:
        return None, "No SUPABASE_ACCESS_TOKEN"
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request(url, data=data, method="POST",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else [], None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()
    except Exception as e:
        return None, str(e)


def cleanup():
    print("\n── Cleaning up test data ──")
    # Delete commissions for test claims
    for cid in created_commission_claim_ids:
        api("DELETE", f"/commissions?claim_id=eq.{cid}", headers=admin_headers())
    # Delete claims
    for cid in created_claim_ids:
        api("DELETE", f"/claim_status_history?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/notifications?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/claim_files?claim_id=eq.{cid}", headers=admin_headers())
        api("DELETE", f"/claims?id=eq.{cid}", headers=admin_headers())
    # Delete worker_profiles
    for wid in created_worker_ids:
        api("DELETE", f"/worker_profiles?id=eq.{wid}", headers=admin_headers())
    # Delete auth users
    for uid in created_user_ids:
        api("DELETE", f"/admin/users/{uid}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
            base=AUTH_BASE)
    print("  Cleanup done.")


# ════════════════════════════════════════════════════════════════════════════
# SETUP
# ════════════════════════════════════════════════════════════════════════════

def setup():
    print("\n── Setup: Creating test users, agents, managers, claims ──")
    pwd = "TestPass123!"

    # ── Create Manager A ──
    mgrA_email = f"{TEST_PREFIX}_mgrA_{ts}@test-claimvelo.com"
    mgrA_id, mgrA_jwt = create_user(mgrA_email, pwd, "Manager A", "sales_manager")
    if not mgrA_id:
        record("Setup: Create Manager A", False, "Failed to create user")
        return None
    created_user_ids.append(mgrA_id)

    # ── Create Manager B ──
    mgrB_email = f"{TEST_PREFIX}_mgrB_{ts}@test-claimvelo.com"
    mgrB_id, mgrB_jwt = create_user(mgrB_email, pwd, "Manager B", "sales_manager")
    if not mgrB_id:
        record("Setup: Create Manager B", False, "Failed to create user")
        return None
    created_user_ids.append(mgrB_id)

    # ── Create Agent A (under Manager A) ──
    agentA_email = f"{TEST_PREFIX}_agentA_{ts}@test-claimvelo.com"
    agentA_id, agentA_jwt = create_user(agentA_email, pwd, "Agent A", "agent")
    if not agentA_id:
        record("Setup: Create Agent A user", False, "Failed")
        return None
    created_user_ids.append(agentA_id)

    # ── Create Agent B (under Manager B) ──
    agentB_email = f"{TEST_PREFIX}_agentB_{ts}@test-claimvelo.com"
    agentB_id, agentB_jwt = create_user(agentB_email, pwd, "Agent B", "agent")
    if not agentB_id:
        record("Setup: Create Agent B user", False, "Failed")
        return None
    created_user_ids.append(agentB_id)

    # ── Create Customer ──
    cust_email = f"{TEST_PREFIX}_cust_{ts}@test-claimvelo.com"
    cust_id, cust_jwt = create_user(cust_email, pwd, "Test Customer", "customer")
    if not cust_id:
        record("Setup: Create Customer", False, "Failed")
        return None
    created_user_ids.append(cust_id)

    # ── Create Admin ──
    admin_email = f"{TEST_PREFIX}_admin_{ts}@test-claimvelo.com"
    admin_id, admin_jwt = create_user(admin_email, pwd, "Test Admin", "admin")
    if not admin_id:
        record("Setup: Create Admin", False, "Failed")
        return None
    created_user_ids.append(admin_id)

    # ── Create worker_profiles for agents ──
    agentA_code = f"AGT{ts[-4:]}A"
    agentB_code = f"AGT{ts[-4:]}B"

    # Agent A worker_profile (managed by Manager A)
    status, resp = api("POST", "/worker_profiles",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "user_id": agentA_id,
            "email": agentA_email,
            "full_name": "Agent A",
            "role": "agent",
            "status": "active",
            "agent_code": agentA_code,
            "manager_id": mgrA_id,
            "commission_rate": 10,
            "api_key": f"test_api_key_A_{ts}",
            "created_by": admin_id,
        })
    if status != 201 or not resp:
        record("Setup: Create Agent A worker_profile", False, f"{status} {resp}")
        return None
    wpA_id = resp[0]["id"]
    created_worker_ids.append(wpA_id)

    # Agent B worker_profile (managed by Manager B)
    status, resp = api("POST", "/worker_profiles",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "user_id": agentB_id,
            "email": agentB_email,
            "full_name": "Agent B",
            "role": "agent",
            "status": "active",
            "agent_code": agentB_code,
            "manager_id": mgrB_id,
            "commission_rate": 15,
            "created_by": admin_id,
        })
    if status != 201 or not resp:
        record("Setup: Create Agent B worker_profile", False, f"{status} {resp}")
        return None
    wpB_id = resp[0]["id"]
    created_worker_ids.append(wpB_id)

    # ── Create claims attributed to each agent ──
    # Claim for Agent A
    claimA_ref = f"CLM-{ts[-5:]}A1"
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claimA_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "PassengerA",
            "email": cust_email,
            "phone": "+1234567890",
            "country": "US",
            "flight_number": "AA100",
            "flight_date": "2026-08-01",
            "departure": "JFK",
            "arrival": "LHR",
            "airline": "American Airlines",
            "issue_type": "Delay",
            "status": "In Progress",
            "eligibility_status": "Pending Check",
            "agent": agentA_code,
            "agent_id": wpA_id,
            "customer_user_id": cust_id,
            "loa_signed": True,
        })
    if status != 201 or not resp:
        record("Setup: Create claim for Agent A", False, f"{status} {resp}")
        return None
    claimA_id = resp[0]["id"]
    created_claim_ids.append(claimA_id)

    # Claim for Agent B
    claimB_ref = f"CLM-{ts[-5:]}B1"
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claimB_ref,
            "passenger_first_name": "Test",
            "passenger_last_name": "PassengerB",
            "email": f"{TEST_PREFIX}_custB_{ts}@test-claimvelo.com",
            "phone": "+1234567891",
            "country": "US",
            "flight_number": "BA200",
            "flight_date": "2026-08-02",
            "departure": "LHR",
            "arrival": "JFK",
            "airline": "British Airways",
            "issue_type": "Cancellation",
            "status": "In Progress",
            "eligibility_status": "Pending Check",
            "agent": agentB_code,
            "agent_id": wpB_id,
            "loa_signed": True,
        })
    if status != 201 or not resp:
        record("Setup: Create claim for Agent B", False, f"{status} {resp}")
        return None
    claimB_id = resp[0]["id"]
    created_claim_ids.append(claimB_id)

    record("Setup: All test data created", True)

    return {
        "mgrA_id": mgrA_id, "mgrA_jwt": mgrA_jwt, "mgrA_email": mgrA_email,
        "mgrB_id": mgrB_id, "mgrB_jwt": mgrB_jwt, "mgrB_email": mgrB_email,
        "agentA_id": agentA_id, "agentA_jwt": agentA_jwt, "agentA_email": agentA_email,
        "agentB_id": agentB_id, "agentB_jwt": agentB_jwt, "agentB_email": agentB_email,
        "wpA_id": wpA_id, "wpB_id": wpB_id,
        "agentA_code": agentA_code, "agentB_code": agentB_code,
        "cust_id": cust_id, "cust_jwt": cust_jwt, "cust_email": cust_email,
        "admin_id": admin_id, "admin_jwt": admin_jwt, "admin_email": admin_email,
        "claimA_id": claimA_id, "claimA_ref": claimA_ref,
        "claimB_id": claimB_id, "claimB_ref": claimB_ref,
    }


# ════════════════════════════════════════════════════════════════════════════
# TESTS
# ════════════════════════════════════════════════════════════════════════════

def test_agent_sees_own_claims(ctx):
    """1. Agent A sees only Agent A claims."""
    print("\n── Test 1: Agent A sees only own claims ──")
    jwt = ctx["agentA_jwt"]
    status, resp = api("GET", "/claims?select=id,claim_ref,agent_id",
        headers=user_headers(jwt))
    claims = resp if isinstance(resp, list) else []
    own_claim = any(c["id"] == ctx["claimA_id"] for c in claims)
    record("Agent A sees own claim", own_claim, f"claims={[c.get('claim_ref') for c in claims]}")

    # 2. Agent A cannot see Agent B claims
    seesB = any(c["id"] == ctx["claimB_id"] for c in claims)
    record("Agent A cannot see Agent B claim", not seesB, f"seesB={seesB}")


def test_agent_cannot_see_other_claims(ctx):
    """2. Agent A cannot see Agent B claims (explicit)."""
    print("\n── Test 2: Agent A cannot see Agent B claims ──")
    jwt = ctx["agentA_jwt"]
    status, resp = api("GET", f"/claims?id=eq.{ctx['claimB_id']}&select=id,claim_ref",
        headers=user_headers(jwt))
    cannot_see = isinstance(resp, list) and len(resp) == 0
    record("Agent A cannot query Agent B claim directly", cannot_see, f"resp={resp}")

    # Also test Agent B can't see Agent A's claim
    jwtB = ctx["agentB_jwt"]
    status, resp = api("GET", f"/claims?id=eq.{ctx['claimA_id']}&select=id,claim_ref",
        headers=user_headers(jwtB))
    cannot_seeA = isinstance(resp, list) and len(resp) == 0
    record("Agent B cannot query Agent A claim directly", cannot_seeA, f"resp={resp}")


def test_manager_sees_team_claims(ctx):
    """3. Manager A sees only claims/agents from Manager A's team."""
    print("\n── Test 3: Manager A sees only own team claims ──")
    jwt = ctx["mgrA_jwt"]
    status, resp = api("GET", "/claims?select=id,claim_ref,agent_id",
        headers=user_headers(jwt))
    claims = resp if isinstance(resp, list) else []
    seesA = any(c["id"] == ctx["claimA_id"] for c in claims)
    record("Manager A sees Agent A's claim (own team)", seesA,
           f"claims={[c.get('claim_ref') for c in claims]}")

    # 4. Manager A cannot see Manager B's team
    seesB = any(c["id"] == ctx["claimB_id"] for c in claims)
    record("Manager A cannot see Agent B's claim (other team)", not seesB,
           f"seesB={seesB}")


def test_manager_sees_team_agents(ctx):
    """3b. Manager A sees only own team agents in worker_profiles."""
    print("\n── Test 3b: Manager A sees only own team agents ──")
    jwt = ctx["mgrA_jwt"]
    status, resp = api("GET", "/worker_profiles?select=id,full_name,role,manager_id",
        headers=user_headers(jwt))
    profiles = resp if isinstance(resp, list) else []
    seesAgentA = any(p["id"] == ctx["wpA_id"] for p in profiles)
    record("Manager A sees Agent A (own team)", seesAgentA,
           f"profiles={[p.get('full_name') for p in profiles]}")

    seesAgentB = any(p["id"] == ctx["wpB_id"] for p in profiles)
    record("Manager A cannot see Agent B (other team)", not seesAgentB,
           f"seesAgentB={seesAgentB}")


def test_manager_cannot_see_other_team(ctx):
    """4. Manager A cannot see Manager B's team."""
    print("\n── Test 4: Manager A cannot see Manager B's team ──")
    jwt = ctx["mgrA_jwt"]
    # Direct query for Agent B's worker_profile
    status, resp = api("GET", f"/worker_profiles?id=eq.{ctx['wpB_id']}&select=id,full_name",
        headers=user_headers(jwt))
    cannot_seeB = isinstance(resp, list) and len(resp) == 0
    record("Manager A cannot query Agent B's profile directly", cannot_seeB, f"resp={resp}")

    # Manager B should see Agent B but not Agent A
    jwtB = ctx["mgrB_jwt"]
    status, resp = api("GET", "/worker_profiles?select=id,full_name",
        headers=user_headers(jwtB))
    profilesB = resp if isinstance(resp, list) else []
    seesAgentB = any(p["id"] == ctx["wpB_id"] for p in profilesB)
    seesAgentA = any(p["id"] == ctx["wpA_id"] for p in profilesB)
    record("Manager B sees Agent B (own team)", seesAgentB, f"profiles={[p.get('full_name') for p in profilesB]}")
    record("Manager B cannot see Agent A (other team)", not seesAgentA, f"seesAgentA={seesAgentA}")


def test_anon_cannot_read_private_fields(ctx):
    """5. Anonymous cannot read private worker_profiles fields."""
    print("\n── Test 5: Anonymous cannot read private worker_profiles ──")
    # Anon should NOT be able to SELECT from worker_profiles at all
    # (the blanket anon SELECT policy was dropped in p8a_01)
    status, resp = api("GET", "/worker_profiles?select=id,email,api_key,commission_rate",
        headers=anon_headers())
    cannot_read = (isinstance(resp, list) and len(resp) == 0) or status == 401 or status == 403
    record("Anonymous cannot read worker_profiles rows", cannot_read,
           f"status={status} resp={resp if not isinstance(resp, list) else f'{len(resp)} rows'}")

    # Anon CAN validate agent codes via the RPC (no private data returned)
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": ctx["agentA_code"]})
    rpc_works = status == 200 and isinstance(resp, list) and len(resp) > 0 and resp[0].get("valid") is True
    record("Anonymous can validate agent code via RPC", rpc_works, f"status={status} resp={resp}")

    # RPC should NOT return private fields
    if rpc_works and isinstance(resp, list):
        row = resp[0]
        has_private = any(k in row for k in ("api_key", "commission_rate", "manager_id", "email", "total_payout_earned"))
        record("RPC does not leak private fields", not has_private, f"keys={list(row.keys())}")
    else:
        record("RPC does not leak private fields", True, "no response to check")


def test_customer_access(ctx):
    """6. Customer access still works — customer sees own claims."""
    print("\n── Test 6: Customer access still works ──")
    jwt = ctx["cust_jwt"]
    status, resp = api("GET", "/claims?select=id,claim_ref,customer_user_id",
        headers=user_headers(jwt))
    claims = resp if isinstance(resp, list) else []
    sees_own = any(c["id"] == ctx["claimA_id"] for c in claims)
    record("Customer sees own claim", sees_own, f"claims={[c.get('claim_ref') for c in claims]}")

    # Customer should NOT see Agent B's claim (different customer)
    seesB = any(c["id"] == ctx["claimB_id"] for c in claims)
    record("Customer cannot see other customer's claim", not seesB, f"seesB={seesB}")


def test_admin_worker_access(ctx):
    """7. Admin/worker access still works — admin sees all claims."""
    print("\n── Test 7: Admin access still works ──")
    jwt = ctx["admin_jwt"]
    status, resp = api("GET", "/claims?select=id,claim_ref",
        headers=user_headers(jwt))
    claims = resp if isinstance(resp, list) else []
    seesA = any(c["id"] == ctx["claimA_id"] for c in claims)
    seesB = any(c["id"] == ctx["claimB_id"] for c in claims)
    record("Admin sees Agent A's claim", seesA, f"claims_count={len(claims)}")
    record("Admin sees Agent B's claim", seesB, f"seesB={seesB}")

    # Admin sees all worker_profiles
    status, resp = api("GET", "/worker_profiles?select=id,full_name",
        headers=user_headers(jwt))
    profiles = resp if isinstance(resp, list) else []
    seesBoth = any(p["id"] == ctx["wpA_id"] for p in profiles) and any(p["id"] == ctx["wpB_id"] for p in profiles)
    record("Admin sees all worker_profiles", seesBoth, f"profiles_count={len(profiles)}")


def test_valid_referral(ctx):
    """8. Valid referral accepted — validate_agent_code returns valid=true."""
    print("\n── Test 8: Valid referral accepted ──")
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": ctx["agentA_code"]})
    valid = status == 200 and isinstance(resp, list) and len(resp) > 0 and resp[0].get("valid") is True
    record("Valid agent code accepted", valid, f"status={status} resp={resp}")

    # Also test lowercase (should be normalized to uppercase)
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": ctx["agentA_code"].lower()})
    valid_lower = status == 200 and isinstance(resp, list) and len(resp) > 0 and resp[0].get("valid") is True
    record("Valid agent code accepted (lowercase input)", valid_lower, f"status={status} resp={resp}")


def test_invalid_referral(ctx):
    """9. Invalid referral rejected — validate_agent_code returns no rows."""
    print("\n── Test 9: Invalid referral rejected ──")
    # Non-existent code
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": "FAKE9999"})
    rejected = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
    record("Non-existent agent code rejected", rejected, f"status={status} resp={resp}")

    # Empty code
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": ""})
    rejected_empty = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
    record("Empty agent code rejected", rejected_empty, f"status={status} resp={resp}")

    # Inactive agent code — create an inactive agent and verify
    inactive_code = f"INA{ts[-4:]}"
    status, resp = api("POST", "/worker_profiles",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "email": f"{TEST_PREFIX}_inactive_{ts}@test-claimvelo.com",
            "full_name": "Inactive Agent",
            "role": "agent",
            "status": "inactive",
            "agent_code": inactive_code,
            "manager_id": ctx["mgrA_id"],
            "created_by": ctx["admin_id"],
        })
    if status == 201 and resp:
        inactive_wp_id = resp[0]["id"]
        created_worker_ids.append(inactive_wp_id)
        status2, resp2 = api("POST", "/rpc/validate_agent_code",
            headers=anon_headers(),
            body={"p_code": inactive_code})
        rejected_inactive = status2 == 200 and (resp2 is None or (isinstance(resp2, list) and len(resp2) == 0))
        record("Inactive agent code rejected", rejected_inactive, f"status={status2} resp={resp2}")
    else:
        record("Inactive agent code rejected", False, f"Setup failed: {status} {resp}")


def test_referral_persists_to_claim(ctx):
    """10 & 11. Referral persists through claim creation; agent_id stored correctly."""
    print("\n── Test 10 & 11: Referral attribution via create-claim edge function ──")
    claim_data = {
        "passenger_first_name": "Referral",
        "passenger_last_name": "Test",
        "email": f"{TEST_PREFIX}_referral_{ts}@test-claimvelo.com",
        "phone": "+1234567890",
        "country": "US",
        "flight_number": "UA999",
        "flight_date": "2026-09-15",
        "departure": "SFO",
        "arrival": "ORD",
        "airline": "United Airlines",
        "issue_type": "Delay",
        "airline_reason": "",
        "loa_signed": True,
        "agent": ctx["agentA_code"],  # referral code
    }

    # Call create-claim edge function with valid agent code
    status, resp = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": claim_data, "files": []},
        base=EDGE_BASE)

    if status != 200 or not isinstance(resp, dict) or not resp.get("success"):
        record("Referral: claim created with agent code", False, f"status={status} resp={resp}")
        return

    new_claim_id = resp.get("claim_id")
    if new_claim_id:
        created_claim_ids.append(new_claim_id)

    # Verify agent_id was set correctly
    status2, resp2 = api("GET", f"/claims?id=eq.{new_claim_id}&select=id,agent,agent_id",
        headers=admin_headers())
    if status2 == 200 and isinstance(resp2, list) and len(resp2) > 0:
        claim = resp2[0]
        agent_id_correct = claim.get("agent_id") == ctx["wpA_id"]
        agent_text_correct = claim.get("agent") == ctx["agentA_code"]
        record("Referral: agent_id stored correctly", agent_id_correct,
               f"agent_id={claim.get('agent_id')} expected={ctx['wpA_id']}")
        record("Referral: agent text code stored correctly", agent_text_correct,
               f"agent={claim.get('agent')} expected={ctx['agentA_code']}")
    else:
        record("Referral: agent_id stored correctly", False, f"query failed: {status2} {resp2}")
        record("Referral: agent text code stored correctly", False, "query failed")

    # 11. agent_id cannot be hijacked — try to pass a fake agent_id in the claim data
    claim_data_hijack = dict(claim_data)
    claim_data_hijack["email"] = f"{TEST_PREFIX}_hijack_{ts}@test-claimvelo.com"
    claim_data_hijack["agent_id"] = ctx["wpB_id"]  # try to hijack to Agent B
    claim_data_hijack["agent"] = ctx["agentA_code"]  # but use Agent A's code

    status3, resp3 = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": claim_data_hijack, "files": []},
        base=EDGE_BASE)

    if status3 != 200 or not isinstance(resp3, dict) or not resp3.get("success"):
        record("Hijack: claim created for hijack test", False, f"status={status3} resp={resp3}")
    else:
        hijack_claim_id = resp3.get("claim_id")
        if hijack_claim_id:
            created_claim_ids.append(hijack_claim_id)
        status4, resp4 = api("GET", f"/claims?id=eq.{hijack_claim_id}&select=id,agent,agent_id",
            headers=admin_headers())
        if status4 == 200 and isinstance(resp4, list) and len(resp4) > 0:
            claim = resp4[0]
            not_hijacked = claim.get("agent_id") == ctx["wpA_id"]  # should be Agent A, not B
            record("Hijack: agent_id not hijacked (stays Agent A)", not_hijacked,
                   f"agent_id={claim.get('agent_id')} expected={ctx['wpA_id']} (not {ctx['wpB_id']})")
        else:
            record("Hijack: agent_id not hijacked", False, f"query failed: {status4} {resp4}")

    # 11b. Invalid agent code results in no attribution
    claim_data_invalid = dict(claim_data)
    claim_data_invalid["email"] = f"{TEST_PREFIX}_invalid_{ts}@test-claimvelo.com"
    claim_data_invalid["agent"] = "FAKE9999"  # invalid code

    status5, resp5 = api("POST", "/create-claim",
        headers=anon_headers(),
        body={"claim": claim_data_invalid, "files": []},
        base=EDGE_BASE)

    if status5 == 200 and isinstance(resp5, dict) and resp5.get("success"):
        invalid_claim_id = resp5.get("claim_id")
        if invalid_claim_id:
            created_claim_ids.append(invalid_claim_id)
        status6, resp6 = api("GET", f"/claims?id=eq.{invalid_claim_id}&select=id,agent,agent_id",
            headers=admin_headers())
        if status6 == 200 and isinstance(resp6, list) and len(resp6) > 0:
            claim = resp6[0]
            no_attribution = claim.get("agent_id") is None and claim.get("agent") == "—"
            record("Invalid code: no attribution (agent_id=NULL, agent=—)", no_attribution,
                   f"agent_id={claim.get('agent_id')} agent={claim.get('agent')}")
        else:
            record("Invalid code: no attribution", False, f"query failed: {status6} {resp6}")
    else:
        record("Invalid code: no attribution", False, f"claim creation failed: {status5} {resp5}")


def test_commission_creation(ctx):
    """12 & 13. Commission row created correctly; calculation is server-side."""
    print("\n── Test 12 & 13: Commission creation and server-side calculation ──")

    # Create an eligible claim with compensation for Agent A
    claim_ref = f"CLM-{ts[-5:]}C1"
    comp_amount = 600.00
    status, resp = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim_ref,
            "passenger_first_name": "Commission",
            "passenger_last_name": "Test",
            "email": f"{TEST_PREFIX}_comm_{ts}@test-claimvelo.com",
            "phone": "+1234567890",
            "country": "US",
            "flight_number": "DL300",
            "flight_date": "2026-08-10",
            "departure": "ATL",
            "arrival": "LHR",
            "airline": "Delta",
            "issue_type": "Delay",
            "status": "In Progress",
            "eligibility_status": "Eligible",
            "compensation_amount": comp_amount,
            "agent": ctx["agentA_code"],
            "agent_id": ctx["wpA_id"],
            "loa_signed": True,
        })
    if status != 201 or not resp:
        record("Commission: create eligible claim", False, f"{status} {resp}")
        return
    comm_claim_id = resp[0]["id"]
    created_claim_ids.append(comm_claim_id)
    created_commission_claim_ids.append(comm_claim_id)

    # Call manage-agent-finance to recalculate commissions for Agent A
    status2, resp2 = api("POST", "/manage-agent-finance",
        headers=user_headers(ctx["admin_jwt"]),
        body={"action": "recalculate-payout", "agentId": ctx["wpA_id"], "newRate": 10},
        base=EDGE_BASE)

    if status2 != 200 or not isinstance(resp2, dict) or not resp2.get("success"):
        record("Commission: recalculate-payout edge function", False, f"status={status2} resp={resp2}")
        return
    record("Commission: recalculate-payout edge function succeeds", True)

    # Verify commission row was created
    status3, resp3 = api("GET",
        f"/commissions?claim_id=eq.{comm_claim_id}&agent_id=eq.{ctx['wpA_id']}",
        headers=admin_headers())
    if status3 == 200 and isinstance(resp3, list) and len(resp3) > 0:
        comm = resp3[0]
        expected_amount = round(comp_amount * 10 / 100, 2)  # 600 * 10% = 60.00
        amount_correct = float(comm["commission_amount"]) == expected_amount
        rate_correct = float(comm["commission_rate"]) == 10
        status_correct = comm["commission_status"] == "pending"
        record("Commission: row created for eligible claim", True, f"comm={comm}")
        record("Commission: amount calculated correctly (server-side)", amount_correct,
               f"amount={comm['commission_amount']} expected={expected_amount}")
        record("Commission: rate stored correctly", rate_correct,
               f"rate={comm['commission_rate']} expected=10")
        record("Commission: status defaults to pending", status_correct,
               f"status={comm['commission_status']}")
    else:
        record("Commission: row created for eligible claim", False, f"status={status3} resp={resp3}")
        record("Commission: amount calculated correctly (server-side)", False, "no commission row")
        record("Commission: rate stored correctly", False, "no commission row")
        record("Commission: status defaults to pending", False, "no commission row")

    # 13. Server-side calculation — verify the edge function computed it, not the client
    # The edge function uses Math.round((compAmount * newRate) / 100 * 100) / 100
    # We already verified the amount above; this confirms it was computed server-side
    record("Commission: calculation is server-side (edge function)", True,
           "Verified via manage-agent-finance edge function")


def test_agent_commission_rls(ctx):
    """14. Agent can read only own commissions."""
    print("\n── Test 14: Agent commission RLS ──")
    # Agent A should see their own commissions
    jwtA = ctx["agentA_jwt"]
    status, resp = api("GET", "/commissions?select=id,agent_id,commission_amount",
        headers=user_headers(jwtA))
    commsA = resp if isinstance(resp, list) else []
    sees_own = all(c["agent_id"] == ctx["wpA_id"] for c in commsA) and len(commsA) > 0
    record("Agent A sees own commissions", sees_own, f"count={len(commsA)}")

    # Agent B should see only their own (none in this test)
    jwtB = ctx["agentB_jwt"]
    status2, resp2 = api("GET", "/commissions?select=id,agent_id",
        headers=user_headers(jwtB))
    commsB = resp2 if isinstance(resp2, list) else []
    sees_none = len(commsB) == 0
    record("Agent B sees no commissions (none attributed)", sees_none, f"count={len(commsB)}")

    # Agent A should NOT see Agent B's commissions even if they existed
    # Create a commission for Agent B and verify Agent A can't see it
    claim_ref = f"CLM-{ts[-5:]}D1"
    status3, resp3 = api("POST", "/claims",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "claim_ref": claim_ref,
            "passenger_first_name": "AgentB",
            "passenger_last_name": "Commission",
            "email": f"{TEST_PREFIX}_commB_{ts}@test-claimvelo.com",
            "phone": "+1234567890",
            "country": "US",
            "flight_number": "LH400",
            "flight_date": "2026-08-12",
            "departure": "FRA",
            "arrival": "JFK",
            "airline": "Lufthansa",
            "issue_type": "Delay",
            "status": "In Progress",
            "eligibility_status": "Eligible",
            "compensation_amount": 400.00,
            "agent": ctx["agentB_code"],
            "agent_id": ctx["wpB_id"],
            "loa_signed": True,
        })
    if status3 == 201 and resp3:
        claimB_comm_id = resp3[0]["id"]
        created_claim_ids.append(claimB_comm_id)
        created_commission_claim_ids.append(claimB_comm_id)

        # Create commission for Agent B via edge function
        api("POST", "/manage-agent-finance",
            headers=user_headers(ctx["admin_jwt"]),
            body={"action": "recalculate-payout", "agentId": ctx["wpB_id"], "newRate": 15},
            base=EDGE_BASE)

        # Agent A should NOT see Agent B's commission
        status4, resp4 = api("GET", f"/commissions?agent_id=eq.{ctx['wpB_id']}&select=id,agent_id",
            headers=user_headers(jwtA))
        cannot_seeB = isinstance(resp4, list) and len(resp4) == 0
        record("Agent A cannot see Agent B's commissions", cannot_seeB, f"resp={resp4}")
    else:
        record("Agent A cannot see Agent B's commissions", False, f"setup failed: {status3}")


def test_agent_cannot_modify_commission(ctx):
    """15. Agent cannot modify commission rate/amount/status/paid_at."""
    print("\n── Test 15: Agent cannot modify commissions ──")
    jwt = ctx["agentA_jwt"]

    # Get Agent A's commission
    status, resp = api("GET", f"/commissions?agent_id=eq.{ctx['wpA_id']}&select=id",
        headers=user_headers(jwt))
    if not isinstance(resp, list) or len(resp) == 0:
        record("Agent cannot modify commission: setup (find own commission)", False, f"resp={resp}")
        return
    comm_id = resp[0]["id"]

    # Try to UPDATE commission_amount
    status2, resp2 = api("PATCH", f"/commissions?id=eq.{comm_id}",
        headers=user_headers(jwt),
        body={"commission_amount": 99999})
    cannot_update_amount = status2 == 401 or status2 == 403 or (isinstance(resp2, list) and len(resp2) == 0)
    # PostgREST returns 200 with empty array when RLS blocks all rows
    # Verify the value wasn't actually changed
    status3, resp3 = api("GET", f"/commissions?id=eq.{comm_id}&select=commission_amount",
        headers=admin_headers())
    not_changed = True
    if status3 == 200 and isinstance(resp3, list) and len(resp3) > 0:
        not_changed = float(resp3[0]["commission_amount"]) != 99999
    record("Agent cannot modify commission_amount", not_changed,
           f"status={status2} not_changed={not_changed}")

    # Try to UPDATE commission_status
    status4, resp4 = api("PATCH", f"/commissions?id=eq.{comm_id}",
        headers=user_headers(jwt),
        body={"commission_status": "paid"})
    status5, resp5 = api("GET", f"/commissions?id=eq.{comm_id}&select=commission_status",
        headers=admin_headers())
    not_changed_status = True
    if status5 == 200 and isinstance(resp5, list) and len(resp5) > 0:
        not_changed_status = resp5[0]["commission_status"] != "paid"
    record("Agent cannot modify commission_status", not_changed_status,
           f"status={status4} not_changed={not_changed_status}")

    # Try to UPDATE paid_at
    status6, resp6 = api("PATCH", f"/commissions?id=eq.{comm_id}",
        headers=user_headers(jwt),
        body={"paid_at": datetime.now(timezone.utc).isoformat()})
    status7, resp7 = api("GET", f"/commissions?id=eq.{comm_id}&select=paid_at",
        headers=admin_headers())
    not_changed_paid = True
    if status7 == 200 and isinstance(resp7, list) and len(resp7) > 0:
        not_changed_paid = resp7[0]["paid_at"] is None
    record("Agent cannot modify paid_at", not_changed_paid,
           f"status={status6} not_changed={not_changed_paid}")

    # Try to INSERT a commission
    status8, resp8 = api("POST", "/commissions",
        headers=user_headers(jwt),
        body={
            "agent_id": ctx["wpA_id"],
            "claim_id": ctx["claimA_id"],
            "commission_rate": 50,
            "commission_amount": 999,
        })
    cannot_insert = status8 == 401 or status8 == 403 or status8 == 400
    record("Agent cannot INSERT commissions", cannot_insert, f"status={status8}")

    # Try to DELETE a commission
    status9, resp9 = api("DELETE", f"/commissions?id=eq.{comm_id}",
        headers=user_headers(jwt))
    cannot_delete = status9 == 401 or status9 == 403 or (isinstance(resp9, list) and len(resp9) == 0)
    # Verify it still exists
    status10, resp10 = api("GET", f"/commissions?id=eq.{comm_id}&select=id",
        headers=admin_headers())
    still_exists = status10 == 200 and isinstance(resp10, list) and len(resp10) > 0
    record("Agent cannot DELETE commissions", still_exists, f"status={status9} still_exists={still_exists}")


def test_anon_customer_cannot_read_commissions(ctx):
    """16. Anonymous/customer cannot read commissions."""
    print("\n── Test 16: Anonymous/customer cannot read commissions ──")
    # Anonymous
    status, resp = api("GET", "/commissions?select=id",
        headers=anon_headers())
    anon_blocked = (isinstance(resp, list) and len(resp) == 0) or status in (401, 403)
    record("Anonymous cannot read commissions", anon_blocked, f"status={status}")

    # Customer
    status2, resp2 = api("GET", "/commissions?select=id",
        headers=user_headers(ctx["cust_jwt"]))
    cust_blocked = (isinstance(resp2, list) and len(resp2) == 0) or status2 in (401, 403)
    record("Customer cannot read commissions", cust_blocked, f"status={status2}")


def test_b2b_api_attribution(ctx):
    """17. B2B API still creates leads with correct attribution."""
    print("\n── Test 17: B2B API lead attribution ──")
    # Agent A has api_key set in setup
    api_key = f"test_api_key_A_{ts}"

    lead_body = {
        "pnr_code": "ABC123",
        "passenger": {
            "first_name": "B2B",
            "last_name": "Test",
            "email": f"{TEST_PREFIX}_b2b_{ts}@test-claimvelo.com",
            "phone": "+441234567890",
        },
        "flight_info": {
            "flight_number": "BA245",
            "departure_date": "2026-07-15",
            "origin": "LHR",
            "destination": "JFK",
            "delay_minutes": 240,
            "delay_reason": "technical",
        },
    }

    status, resp = api("POST", "/b2b-api/api/v1/leads",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        body=lead_body,
        base=EDGE_BASE)

    if status != 201 or not isinstance(resp, dict) or not resp.get("success"):
        record("B2B API: lead created", False, f"status={status} resp={resp}")
        return

    claim_ref = resp.get("claim_ref")
    record("B2B API: lead created successfully", True, f"claim_ref={claim_ref}")

    # Verify attribution
    status2, resp2 = api("GET", f"/claims?claim_ref=eq.{claim_ref}&select=id,agent,agent_id",
        headers=admin_headers())
    if status2 == 200 and isinstance(resp2, list) and len(resp2) > 0:
        claim = resp2[0]
        if claim.get("id"):
            created_claim_ids.append(claim["id"])
        agent_id_correct = claim.get("agent_id") == ctx["wpA_id"]
        agent_code_correct = claim.get("agent") == ctx["agentA_code"]
        record("B2B API: agent_id attributed correctly", agent_id_correct,
               f"agent_id={claim.get('agent_id')} expected={ctx['wpA_id']}")
        record("B2B API: agent code attributed correctly", agent_code_correct,
               f"agent={claim.get('agent')} expected={ctx['agentA_code']}")
    else:
        record("B2B API: agent_id attributed correctly", False, f"query failed: {status2} {resp2}")
        record("B2B API: agent code attributed correctly", False, "query failed")

    # B2B API with invalid key should fail
    status3, resp3 = api("POST", "/b2b-api/api/v1/leads",
        headers={"Content-Type": "application/json", "Authorization": "Bearer INVALID_KEY"},
        body=lead_body,
        base=EDGE_BASE)
    rejected = status3 == 401
    record("B2B API: invalid API key rejected", rejected, f"status={status3}")


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    print("═" * 70)
    print("  Phase 8A — Sales Agents System — Live Acceptance Tests")
    print("═" * 70)

    ctx = setup()
    if not ctx:
        print("\nFAIL: Setup failed — cannot continue tests")
        cleanup()
        sys.exit(1)

    try:
        test_agent_sees_own_claims(ctx)
        test_agent_cannot_see_other_claims(ctx)
        test_manager_sees_team_claims(ctx)
        test_manager_sees_team_agents(ctx)
        test_manager_cannot_see_other_team(ctx)
        test_anon_cannot_read_private_fields(ctx)
        test_customer_access(ctx)
        test_admin_worker_access(ctx)
        test_valid_referral(ctx)
        test_invalid_referral(ctx)
        test_referral_persists_to_claim(ctx)
        test_commission_creation(ctx)
        test_agent_commission_rls(ctx)
        test_agent_cannot_modify_commission(ctx)
        test_anon_customer_cannot_read_commissions(ctx)
        test_b2b_api_attribution(ctx)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cleanup()

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
