#!/usr/bin/env python3
"""
Phase 8B — Focused Security Check: Add Agent + Agent API Keys

Verifies ONLY the Sales Manager "Add Agent" and "Agent API Keys" flows:
  Add Agent
    - sales_manager can create agents only through the authorized server-side flow
    - cannot assign the new agent to another manager
    - cannot create admin/worker/super_admin users (role hardcoded server-side)
    - an ordinary agent/customer/anonymous user cannot call the same flow
  Agent API Keys
    - generation/revocation is server-side and authorized
    - Sales Manager can manage keys only for agents on their own team
    - Agent A / Manager A cannot read or manage another team's API keys
    - raw API keys are not returned through normal client queries (list-agents)

Run AFTER deploying the edge function:
  npx supabase functions deploy manage-agent-finance --project-ref <ref>
  python3 supabase/tests/phase8b_security_check.py
"""

import json
import os
import re
import sys
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
                env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = env.get("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = env.get("VITE_SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SERVICE_ROLE_KEY or not ANON_KEY:
    print("FAIL: Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_ANON_KEY")
    sys.exit(1)

BASE = f"{SUPABASE_URL}/rest/v1"
AUTH_BASE = f"{SUPABASE_URL}/auth/v1"
EDGE_BASE = f"{SUPABASE_URL}/functions/v1"

ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
TEST_PREFIX = "p8bsec"
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
    data = json.dumps(body).encode() if body is not None else None
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
    api("POST", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation,resolution=merge-duplicates"}),
        body={"id": user_id, "role": role, "full_name": full_name, "email": email})
    api("PATCH", f"/profiles?id=eq.{user_id}",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"role": role, "full_name": full_name, "email": email})
    return user_id, jwt


def edge(action, jwt, payload=None):
    body = {"action": action}
    if payload:
        body.update(payload)
    return api("POST", "/manage-agent-finance",
        headers=user_headers(jwt), body=body, base=EDGE_BASE)


def cleanup():
    print("\n── Cleaning up test data ──")
    for wid in created_worker_ids:
        api("DELETE", f"/worker_profiles?id=eq.{wid}", headers=admin_headers())
    for uid in created_user_ids:
        api("DELETE", f"/worker_profiles?user_id=eq.{uid}", headers=admin_headers())
        api("DELETE", f"/admin/users/{uid}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
            base=AUTH_BASE)
    api("DELETE", f"/worker_profiles?email=like.{TEST_PREFIX}%25", headers=admin_headers())
    api("DELETE", f"/profiles?email=like.{TEST_PREFIX}%25", headers=admin_headers())
    print("  Cleanup complete.")


def main():
    print("=" * 70)
    print("Phase 8B — Focused Security Check: Add Agent + Agent API Keys")
    print("=" * 70)

    # ── Setup ─────────────────────────────────────────────────────────────────
    print("\n── Setup: creating test users ──")
    mgrA_id, mgrA_jwt = create_user(f"{TEST_PREFIX}_mgrA_{ts}@test.com", "TestPass123!", f"SecMgrA {ts}", "sales_manager")
    mgrB_id, mgrB_jwt = create_user(f"{TEST_PREFIX}_mgrB_{ts}@test.com", "TestPass123!", f"SecMgrB {ts}", "sales_manager")
    agentX_id, agentX_jwt = create_user(f"{TEST_PREFIX}_agentX_{ts}@test.com", "TestPass123!", f"SecAgentX {ts}", "agent")
    cust_id, cust_jwt = create_user(f"{TEST_PREFIX}_cust_{ts}@test.com", "TestPass123!", f"SecCust {ts}", "customer")

    if not all([mgrA_id, mgrB_id, agentX_id, cust_id]):
        print("FAIL: could not create all test users")
        cleanup()
        sys.exit(1)

    codeX = f"AX{ts[-4:]}"
    codeY = f"BY{ts[-4:]}"

    # Agent X under Manager A; Agent Y under Manager B (created via service role)
    for uid, name, code, mgr in [
        (agentX_id, f"SecAgentX {ts}", codeX, mgrA_id),
    ]:
        st, resp = api("POST", "/worker_profiles",
            headers=admin_headers({"Prefer": "return=representation"}),
            body={"user_id": uid, "email": f"{TEST_PREFIX}_agent_{code}@test.com",
                  "full_name": name, "role": "agent", "status": "active",
                  "agent_code": code, "manager_id": mgr, "commission_rate": 10})
        if isinstance(resp, list) and resp:
            created_worker_ids.append(resp[0]["id"])

    # Agent Y under Manager B (no auth user needed for cross-team tests, but create one for realism)
    agentY_id, _ = create_user(f"{TEST_PREFIX}_agentY_{ts}@test.com", "TestPass123!", f"SecAgentY {ts}", "agent")
    st, resp = api("POST", "/worker_profiles",
        headers=admin_headers({"Prefer": "return=representation"}),
        body={"user_id": agentY_id, "email": f"{TEST_PREFIX}_agent_{codeY}@test.com",
              "full_name": f"SecAgentY {ts}", "role": "agent", "status": "active",
              "agent_code": codeY, "manager_id": mgrB_id, "commission_rate": 10})
    if isinstance(resp, list) and resp:
        created_worker_ids.append(resp[0]["id"])

    st, wpA = api("GET", f"/worker_profiles?user_id=eq.{agentX_id}&select=id",
        headers=admin_headers())
    wpX_id = wpA[0]["id"] if isinstance(wpA, list) and wpA else None
    st, wpB = api("GET", f"/worker_profiles?user_id=eq.{agentY_id}&select=id",
        headers=admin_headers())
    wpY_id = wpB[0]["id"] if isinstance(wpB, list) and wpB else None

    if not wpX_id or not wpY_id:
        print("FAIL: could not create worker profiles")
        cleanup()
        sys.exit(1)

    # ════════════════════════════════════════════════════════════════════════
    # ADD AGENT
    # ════════════════════════════════════════════════════════════════════════
    print("\n── Add Agent: server-side authorized flow ──")

    # 1. Sales manager can create an agent through the server-side flow
    new_email = f"{TEST_PREFIX}_newagent_{ts}@test.com"
    st, resp = edge("create-agent", mgrA_jwt, {
        "email": new_email, "full_name": f"SecNew {ts}",
        "agent_code": f"NW{ts[-4:]}", "password": "NewPass123!"})
    created_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    new_uid = resp.get("userId") if isinstance(resp, dict) else None
    if new_uid:
        created_user_ids.append(new_uid)
    record("Manager can create agent via server-side flow", created_ok, f"status={st} resp={str(resp)[:200]}")

    # 2. New agent's profile role is 'agent' (not admin/super_admin)
    if new_uid:
        st, resp = api("GET", f"/profiles?id=eq.{new_uid}&select=role",
            headers=admin_headers())
        role = resp[0].get("role") if isinstance(resp, list) and resp else None
        record("New agent profile role is 'agent'", role == "agent", f"got {role}")

        # 3. New agent's worker_profile.manager_id is the caller (Manager A)
        st, resp = api("GET", f"/worker_profiles?user_id=eq.{new_uid}&select=manager_id,id",
            headers=admin_headers())
        if isinstance(resp, list) and resp:
            created_worker_ids.append(resp[0]["id"])
            mgr_of_new = resp[0].get("manager_id")
            record("New agent assigned to creating manager", mgr_of_new == mgrA_id,
                   f"got {mgr_of_new}, expected {mgrA_id}")
        else:
            record("New agent assigned to creating manager", False, "no worker_profile row")

    # 4. Cannot create admin/super_admin — role in body is ignored (hardcoded 'agent')
    admin_email = f"{TEST_PREFIX}_adminearly_{ts}@test.com"
    st, resp = edge("create-agent", mgrA_jwt, {
        "email": admin_email, "full_name": "Escalator", "agent_code": f"ES{ts[-4:]}",
        "password": "EscPass123!", "role": "super_admin"})
    esc_uid = resp.get("userId") if isinstance(resp, dict) else None
    if esc_uid:
        created_user_ids.append(esc_uid)
    if esc_uid:
        st, resp = api("GET", f"/profiles?id=eq.{esc_uid}&select=role", headers=admin_headers())
        esc_role = resp[0].get("role") if isinstance(resp, list) and resp else None
        st2, resp2 = api("GET", f"/worker_profiles?user_id=eq.{esc_uid}&select=id", headers=admin_headers())
        if isinstance(resp2, list) and resp2:
            created_worker_ids.append(resp2[0]["id"])
        record("Cannot create super_admin (role ignored)", esc_role == "agent", f"got {esc_role}")
    else:
        record("Cannot create super_admin (role ignored)", False, f"create failed: {str(resp)[:200]}")

    # 5. Cannot assign to another manager — manager_id in body is ignored
    other_email = f"{TEST_PREFIX}_othermgr_{ts}@test.com"
    st, resp = edge("create-agent", mgrA_jwt, {
        "email": other_email, "full_name": "OtherMgr", "agent_code": f"OM{ts[-4:]}",
        "password": "OtherPass123!", "manager_id": mgrB_id})
    om_uid = resp.get("userId") if isinstance(resp, dict) else None
    if om_uid:
        created_user_ids.append(om_uid)
        st, resp = api("GET", f"/worker_profiles?user_id=eq.{om_uid}&select=manager_id,id",
            headers=admin_headers())
        if isinstance(resp, list) and resp:
            created_worker_ids.append(resp[0]["id"])
            om_mgr = resp[0].get("manager_id")
            record("Cannot assign agent to another manager", om_mgr == mgrA_id,
                   f"got {om_mgr}, expected {mgrA_id} (caller), body had {mgrB_id}")
        else:
            record("Cannot assign agent to another manager", False, "no row")
    else:
        record("Cannot assign agent to another manager", False, f"create failed: {str(resp)[:200]}")

    # 6. Ordinary agent cannot call create-agent
    st, resp = edge("create-agent", agentX_jwt, {
        "email": f"{TEST_PREFIX}_agenttry_{ts}@test.com", "full_name": "AgentTry",
        "agent_code": f"AT{ts[-4:]}", "password": "TryPass123!"})
    record("Agent cannot create agents", st >= 400, f"got status {st}")

    # 7. Customer cannot call create-agent
    st, resp = edge("create-agent", cust_jwt, {
        "email": f"{TEST_PREFIX}_custtry_{ts}@test.com", "full_name": "CustTry",
        "agent_code": f"CT{ts[-4:]}", "password": "TryPass123!"})
    record("Customer cannot create agents", st >= 400, f"got status {st}")

    # 8. Anonymous (no JWT) cannot call create-agent
    st, resp = api("POST", "/manage-agent-finance",
        headers=anon_headers(),
        body={"action": "create-agent", "email": f"{TEST_PREFIX}_anon_{ts}@test.com",
              "full_name": "Anon", "agent_code": f"AN{ts[-4:]}", "password": "AnonPass123!"},
        base=EDGE_BASE)
    record("Anonymous cannot create agents", st >= 400, f"got status {st}")

    # ════════════════════════════════════════════════════════════════════════
    # AGENT API KEYS
    # ════════════════════════════════════════════════════════════════════════
    print("\n── Agent API Keys: server-side generation/revocation ──")

    # 9. list-agents returns Manager A's team, no raw api_key field, has_key=false
    st, resp = edge("list-agents", mgrA_jwt)
    list_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    agents_list = resp.get("agents", []) if isinstance(resp, dict) else []
    codes = [a.get("agent_code") for a in agents_list]
    has_no_raw_key = all("api_key" not in a for a in agents_list)
    record("list-agents returns own team only", codeX in codes and codeY not in codes, str(codes))
    record("list-agents omits raw api_key field", has_no_raw_key, str(agents_list)[:200])
    x_before = next((a for a in agents_list if a.get("agent_code") == codeX), None)
    record("Agent X has_key=false before generation",
           x_before is not None and x_before.get("has_key") is False, str(x_before))

    # 10. Manager A generates a key for own agent X → crypto-secure key returned once
    st, resp = edge("generate-api-key", mgrA_jwt, {"agentId": wpX_id})
    gen_ok = st == 200 and isinstance(resp, dict) and resp.get("success") is True
    raw_key = resp.get("apiKey") if isinstance(resp, dict) else None
    record("Manager generates key for own agent", gen_ok, f"status={st} resp={str(resp)[:200]}")
    secure = bool(raw_key and re.match(r"^cv_live_[a-f0-9]{48}$", raw_key))
    record("Generated key is crypto-secure format", secure, f"key={raw_key}")

    # 11. list-agents now shows has_key=true but STILL no raw api_key
    st, resp = edge("list-agents", mgrA_jwt)
    agents_list = resp.get("agents", []) if isinstance(resp, dict) else []
    x_after = next((a for a in agents_list if a.get("agent_code") == codeX), None)
    record("has_key=true after generation, raw key still hidden",
           x_after is not None and x_after.get("has_key") is True and "api_key" not in x_after,
           str(x_after))

    # 12. Manager B cannot generate a key for Manager A's agent (cross-team)
    st, resp = edge("generate-api-key", mgrB_jwt, {"agentId": wpX_id})
    record("Manager B cannot generate key for A's agent", st >= 400, f"got status {st}")

    # 13. Manager B cannot revoke Manager A's agent key (cross-team)
    st, resp = edge("revoke-api-key", mgrB_jwt, {"agentId": wpX_id})
    record("Manager B cannot revoke A's agent key", st >= 400, f"got status {st}")

    # 14. Ordinary agent cannot generate keys
    st, resp = edge("generate-api-key", agentX_jwt, {"agentId": wpX_id})
    record("Agent cannot generate API keys", st >= 400, f"got status {st}")

    # 15. Customer cannot generate keys
    st, resp = edge("generate-api-key", cust_jwt, {"agentId": wpX_id})
    record("Customer cannot generate API keys", st >= 400, f"got status {st}")

    # 16. Manager A revokes own agent's key → has_key=false
    st, resp = edge("revoke-api-key", mgrA_jwt, {"agentId": wpX_id})
    record("Manager revokes own agent key", st == 200 and isinstance(resp, dict) and resp.get("success") is True,
           f"status={st} resp={str(resp)[:200]}")
    st, resp = edge("list-agents", mgrA_jwt)
    agents_list = resp.get("agents", []) if isinstance(resp, dict) else []
    x_rev = next((a for a in agents_list if a.get("agent_code") == codeX), None)
    record("has_key=false after revoke", x_rev is not None and x_rev.get("has_key") is False, str(x_rev))

    # 17. Manager B's list-agents does not include Manager A's agent
    st, resp = edge("list-agents", mgrB_jwt)
    b_agents = resp.get("agents", []) if isinstance(resp, dict) else []
    b_codes = [a.get("agent_code") for a in b_agents]
    record("Manager B list excludes A's agent", codeX not in b_codes, str(b_codes))

    # 18. Agent A cannot read Agent B's worker_profile (cross-team isolation via RLS)
    st, resp = api("GET", f"/worker_profiles?id=eq.{wpY_id}&select=id,api_key",
        headers=user_headers(agentX_jwt))
    cross = resp if isinstance(resp, list) else []
    record("Agent cannot read another agent's profile/key", len(cross) == 0, f"got {cross}")

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
