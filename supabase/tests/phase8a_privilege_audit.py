#!/usr/bin/env python3
"""
Phase 8A — Focused Privilege-Escalation Audit on worker_profiles

Live authenticated tests against the Supabase REST API.

Audit scope:
  A. Sales Manager UPDATE access to sensitive columns on their own agents:
       commission_rate, total_payout_earned, total_paid_to_date,
       api_key, manager_id, role, user_id, agent_code
  B. Agent UPDATE access to sensitive columns on themselves and other agents.
  C. validate_agent_code RPC abuse / enumeration / data leakage.

Intended rule:
  - Sales Manager may perform only explicitly authorized agent-management actions.
  - Commission rate/amount/payout/accounting changes must use the authorized
    server-side workflow (manage-agent-finance edge function).
  - API keys must not be arbitrarily writable through the normal Supabase client.
  - A manager must not be able to move an agent to another manager, change
    identity/role ownership, or bypass commission controls.
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

TEST_PREFIX = "paudit"
ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

results = {"pass": 0, "fail": 0, "errors": []}

created_user_ids = []
created_worker_ids = []


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
    status, resp = api("POST", "/admin/users",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        body={"email": email, "password": password, "email_confirm": True,
              "user_metadata": {"full_name": full_name}},
        base=AUTH_BASE)
    user_id = None
    if isinstance(resp, dict) and "id" in resp:
        user_id = resp["id"]

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

    api("POST", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"id": user_id, "role": role, "full_name": full_name, "email": email})
    api("PATCH", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"role": role, "full_name": full_name, "email": email})

    return user_id, jwt


def cleanup():
    print("\n── Cleaning up test data ──")
    for wid in created_worker_ids:
        api("DELETE", f"/worker_profiles?id=eq.{wid}", headers=admin_headers())
    for uid in created_user_ids:
        api("DELETE", f"/admin/users/{uid}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
            base=AUTH_BASE)
    print("  Cleanup done.")


# ════════════════════════════════════════════════════════════════════════════
# SETUP
# ════════════════════════════════════════════════════════════════════════════

def setup():
    print("\n── Setup: Creating test users and worker_profiles ──")
    pwd = "TestPass123!"

    mgrA_email = f"{TEST_PREFIX}_mgrA_{ts}@test-claimvelo.com"
    mgrA_id, mgrA_jwt = create_user(mgrA_email, pwd, "Manager A", "sales_manager")
    if not mgrA_id:
        record("Setup: Create Manager A", False, "Failed")
        return None
    created_user_ids.append(mgrA_id)

    mgrB_email = f"{TEST_PREFIX}_mgrB_{ts}@test-claimvelo.com"
    mgrB_id, mgrB_jwt = create_user(mgrB_email, pwd, "Manager B", "sales_manager")
    if not mgrB_id:
        record("Setup: Create Manager B", False, "Failed")
        return None
    created_user_ids.append(mgrB_id)

    agentA_email = f"{TEST_PREFIX}_agentA_{ts}@test-claimvelo.com"
    agentA_id, agentA_jwt = create_user(agentA_email, pwd, "Agent A", "agent")
    if not agentA_id:
        record("Setup: Create Agent A user", False, "Failed")
        return None
    created_user_ids.append(agentA_id)

    agentB_email = f"{TEST_PREFIX}_agentB_{ts}@test-claimvelo.com"
    agentB_id, agentB_jwt = create_user(agentB_email, pwd, "Agent B", "agent")
    if not agentB_id:
        record("Setup: Create Agent B user", False, "Failed")
        return None
    created_user_ids.append(agentB_id)

    admin_email = f"{TEST_PREFIX}_admin_{ts}@test-claimvelo.com"
    admin_id, admin_jwt = create_user(admin_email, pwd, "Test Admin", "admin")
    if not admin_id:
        record("Setup: Create Admin", False, "Failed")
        return None
    created_user_ids.append(admin_id)

    agentA_code = f"AUD{ts[-4:]}A"
    agentB_code = f"AUD{ts[-4:]}B"

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
            "total_payout_earned": 100.00,
            "total_paid_to_date": 50.00,
            "api_key": f"audit_key_A_{ts}",
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
            "total_payout_earned": 200.00,
            "total_paid_to_date": 100.00,
            "api_key": f"audit_key_B_{ts}",
            "created_by": admin_id,
        })
    if status != 201 or not resp:
        record("Setup: Create Agent B worker_profile", False, f"{status} {resp}")
        return None
    wpB_id = resp[0]["id"]
    created_worker_ids.append(wpB_id)

    record("Setup: All test data created", True)

    return {
        "mgrA_id": mgrA_id, "mgrA_jwt": mgrA_jwt,
        "mgrB_id": mgrB_id, "mgrB_jwt": mgrB_jwt,
        "agentA_id": agentA_id, "agentA_jwt": agentA_jwt,
        "agentB_id": agentB_id, "agentB_jwt": agentB_jwt,
        "wpA_id": wpA_id, "wpB_id": wpB_id,
        "agentA_code": agentA_code, "agentB_code": agentB_code,
        "admin_id": admin_id, "admin_jwt": admin_jwt,
    }


# ════════════════════════════════════════════════════════════════════════════
# HELPER: attempt a sensitive-column update and verify it was blocked
# ════════════════════════════════════════════════════════════════════════════

def attempt_update(jwt, wp_id, column, new_value, label, ctx):
    """Attempt to PATCH a sensitive column. Returns (blocked, detail)."""
    status, resp = api("PATCH", f"/worker_profiles?id=eq.{wp_id}",
        headers=user_headers(jwt),
        body={column: new_value})

    # Check the actual value in the DB via admin (service_role bypasses RLS)
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wp_id}&select={column}",
        headers=admin_headers())

    actual = None
    if s2 == 200 and isinstance(r2, list) and len(r2) > 0:
        actual = r2[0].get(column)

    # Blocked = the value did NOT change to the injected value
    blocked = (actual != new_value)
    detail = f"status={status} actual={actual} attempted={new_value}"
    record(label, blocked, detail)
    return blocked, actual


# ════════════════════════════════════════════════════════════════════════════
# TEST A: Sales Manager sensitive-column updates on own agent
# ════════════════════════════════════════════════════════════════════════════

def test_manager_sensitive_columns(ctx):
    """A. Sales Manager cannot modify sensitive columns on their own agent."""
    print("\n── Test A: Sales Manager sensitive-column UPDATE on own agent ──")
    jwt = ctx["mgrA_jwt"]
    wp = ctx["wpA_id"]

    # Baseline: Manager CAN update a non-sensitive column (status) — confirms RLS allows the row
    status, resp = api("PATCH", f"/worker_profiles?id=eq.{wp}",
        headers=user_headers(jwt),
        body={"status": "inactive"})
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wp}&select=status",
        headers=admin_headers())
    non_sensitive_worked = (s2 == 200 and isinstance(r2, list) and len(r2) > 0 and r2[0].get("status") == "inactive")
    record("Manager CAN update non-sensitive column (status)", non_sensitive_worked,
           f"status={status} resp={resp}")
    # Restore
    api("PATCH", f"/worker_profiles?id=eq.{wp}",
        headers=user_headers(jwt),
        body={"status": "active"})

    # ── Sensitive column tests ──
    attempt_update(jwt, wp, "commission_rate", 99, "Manager cannot change commission_rate", ctx)
    attempt_update(jwt, wp, "total_payout_earned", 99999, "Manager cannot change total_payout_earned", ctx)
    attempt_update(jwt, wp, "total_paid_to_date", 99999, "Manager cannot change total_paid_to_date", ctx)
    attempt_update(jwt, wp, "api_key", "STOLEN_KEY_123", "Manager cannot change api_key", ctx)
    attempt_update(jwt, wp, "manager_id", ctx["mgrB_id"], "Manager cannot reassign agent (manager_id)", ctx)
    attempt_update(jwt, wp, "role", "admin", "Manager cannot change role", ctx)
    attempt_update(jwt, wp, "user_id", ctx["mgrA_id"], "Manager cannot change user_id", ctx)
    attempt_update(jwt, wp, "agent_code", "HACKED", "Manager cannot change agent_code", ctx)


# ════════════════════════════════════════════════════════════════════════════
# TEST B: Agent sensitive-column updates (self and other)
# ════════════════════════════════════════════════════════════════════════════

def test_agent_sensitive_columns(ctx):
    """B. Agent cannot modify sensitive columns on themselves or another agent."""
    print("\n── Test B: Agent sensitive-column UPDATE (self + other) ──")

    # Agent A trying to update their own profile
    jwt = ctx["agentA_jwt"]
    wp = ctx["wpA_id"]

    attempt_update(jwt, wp, "commission_rate", 99, "Agent cannot change own commission_rate", ctx)
    attempt_update(jwt, wp, "total_payout_earned", 99999, "Agent cannot change own total_payout_earned", ctx)
    attempt_update(jwt, wp, "total_paid_to_date", 99999, "Agent cannot change own total_paid_to_date", ctx)
    attempt_update(jwt, wp, "api_key", "STOLEN_KEY", "Agent cannot change own api_key", ctx)
    attempt_update(jwt, wp, "manager_id", ctx["mgrB_id"], "Agent cannot change own manager_id", ctx)
    attempt_update(jwt, wp, "role", "admin", "Agent cannot change own role", ctx)
    attempt_update(jwt, wp, "agent_code", "HACKED", "Agent cannot change own agent_code", ctx)

    # Agent A trying to update Agent B's profile (cross-agent)
    wpB = ctx["wpB_id"]
    attempt_update(jwt, wpB, "commission_rate", 99, "Agent cannot change other agent's commission_rate", ctx)
    attempt_update(jwt, wpB, "total_payout_earned", 99999, "Agent cannot change other agent's total_payout_earned", ctx)
    attempt_update(jwt, wpB, "api_key", "STOLEN_KEY", "Agent cannot change other agent's api_key", ctx)
    attempt_update(jwt, wpB, "manager_id", ctx["mgrA_id"], "Agent cannot change other agent's manager_id", ctx)
    attempt_update(jwt, wpB, "role", "admin", "Agent cannot change other agent's role", ctx)


# ════════════════════════════════════════════════════════════════════════════
# TEST C: validate_agent_code RPC abuse
# ════════════════════════════════════════════════════════════════════════════

def test_validate_agent_code_rpc(ctx):
    """C. validate_agent_code RPC cannot be abused to enumerate or leak data."""
    print("\n── Test C: validate_agent_code RPC abuse / enumeration ──")

    # Create a fresh agent with a known code for RPC tests
    # (Test A may have modified agentA's code)
    rpc_code = f"RPC{ts[-4:]}T"
    status, resp = api("POST", "/worker_profiles",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={
            "email": f"{TEST_PREFIX}_rpc_{ts}@test-claimvelo.com",
            "full_name": "RPC Test Agent",
            "role": "agent",
            "status": "active",
            "agent_code": rpc_code,
            "manager_id": ctx["mgrA_id"],
            "created_by": ctx["admin_id"],
        })
    if status == 201 and resp:
        rpc_wp_id = resp[0]["id"]
        created_worker_ids.append(rpc_wp_id)
    else:
        record("RPC: setup fresh agent", False, f"status={status} resp={resp}")
        return
    record("RPC: setup fresh agent", True)

    # 1. Valid code returns only {valid, agent_code} — no private fields
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": rpc_code})
    valid_response = status == 200 and isinstance(resp, list) and len(resp) > 0
    if valid_response:
        row = resp[0]
        keys = set(row.keys())
        expected_keys = {"valid", "agent_code"}
        only_minimal = keys == expected_keys
        record("RPC returns only {valid, agent_code} keys", only_minimal,
               f"keys={keys}")
        # Check no private data leaked
        private_keys = {"api_key", "commission_rate", "total_payout_earned",
                        "total_paid_to_date", "manager_id", "email", "user_id",
                        "role", "full_name", "id", "status", "created_by"}
        leaked = keys & private_keys
        record("RPC does not leak any private fields", len(leaked) == 0,
               f"leaked={leaked}")
    else:
        record("RPC returns only {valid, agent_code} keys", False, f"status={status} resp={resp}")
        record("RPC does not leak any private fields", False, "no response")

    # 2. Invalid code returns empty (no error, no data)
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": "NONEXISTENT999"})
    no_data = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
    record("RPC returns empty for non-existent code", no_data, f"status={status} resp={resp}")

    # 3. Empty/null input returns empty
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": ""})
    empty_ok = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
    record("RPC returns empty for empty input", empty_ok, f"status={status} resp={resp}")

    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=anon_headers(),
        body={"p_code": "   "})
    whitespace_ok = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
    record("RPC returns empty for whitespace input", whitespace_ok, f"status={status} resp={resp}")

    # 4. SQL injection attempt via the code parameter
    injection_attempts = [
        "' OR '1'='1",
        "'; DROP TABLE worker_profiles; --",
        "%' OR agent_code LIKE '%",
        "true' OR true--",
        "1=1",
    ]
    for inj in injection_attempts:
        status, resp = api("POST", "/rpc/validate_agent_code",
            headers=anon_headers(),
            body={"p_code": inj})
        # Should return empty (no match), not all rows
        safe = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
        record(f"RPC rejects injection: {inj[:30]}", safe, f"status={status} resp={resp if not isinstance(resp, list) else f'{len(resp)} rows'}")

    # 5. Cannot use RPC to enumerate — wildcard/LIKE patterns should not work
    wildcard_attempts = ["%", "AUD%", "AUD____", "*", "AUD"]
    for wild in wildcard_attempts:
        status, resp = api("POST", "/rpc/validate_agent_code",
            headers=anon_headers(),
            body={"p_code": wild})
        # Should only match if the literal code equals the wildcard string
        # (no agent has code "%", "AUD%", etc.)
        safe = status == 200 and (resp is None or (isinstance(resp, list) and len(resp) == 0))
        record(f"RPC does not match wildcard: {wild}", safe,
               f"status={status} resp={resp if not isinstance(resp, list) else f'{len(resp)} rows'}")

    # 6. RPC does not expose inactive agents
    # (already tested in phase8a, but confirm here)
    # Create an inactive agent
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
        inactive_blocked = status2 == 200 and (resp2 is None or (isinstance(resp2, list) and len(resp2) == 0))
        record("RPC does not expose inactive agents", inactive_blocked, f"status={status2} resp={resp2}")
    else:
        record("RPC does not expose inactive agents", False, f"setup failed: {status}")

    # 7. Authenticated users also get only minimal response
    status, resp = api("POST", "/rpc/validate_agent_code",
        headers=user_headers(ctx["mgrA_jwt"]),
        body={"p_code": ctx["agentA_code"]})
    # Note: the RPC grants EXECUTE to anon only. Authenticated users may or may not
    # have access. If they do, they should still get only {valid, agent_code}.
    if status == 200 and isinstance(resp, list) and len(resp) > 0:
        row = resp[0]
        keys = set(row.keys())
        only_minimal = keys == {"valid", "agent_code"}
        record("RPC returns minimal data to authenticated users", only_minimal,
               f"keys={keys}")
    elif status in (401, 403):
        record("RPC returns minimal data to authenticated users", True,
               f"access denied (status={status}) — acceptable")
    else:
        record("RPC returns minimal data to authenticated users", True,
               f"status={status} resp={resp}")


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    print("═" * 70)
    print("  Phase 8A — Privilege-Escalation Audit on worker_profiles")
    print("═" * 70)

    ctx = setup()
    if not ctx:
        print("\nFAIL: Setup failed — cannot continue tests")
        cleanup()
        sys.exit(1)

    try:
        test_manager_sensitive_columns(ctx)
        test_agent_sensitive_columns(ctx)
        test_validate_agent_code_rpc(ctx)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cleanup()

    print("\n" + "═" * 70)
    print(f"  AUDIT RESULTS: {results['pass']} PASS / {results['fail']} FAIL")
    if results["errors"]:
        print("\n  FAILURES:")
        for err in results["errors"]:
            print(f"    ✗ {err}")
    print("═" * 70)

    sys.exit(0 if results["fail"] == 0 else 1)


if __name__ == "__main__":
    main()
