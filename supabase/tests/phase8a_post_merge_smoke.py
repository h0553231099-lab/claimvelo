#!/usr/bin/env python3
"""
Phase 8A — Post-Merge Smoke Test
Covers: Agent RLS, Manager RLS, Referral Attribution, Commission Creation, Sensitive-Column Blocking
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

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
BASE = f"{SUPABASE_URL}/rest/v1"
AUTH_BASE = f"{SUPABASE_URL}/auth/v1"
EDGE_BASE = f"{SUPABASE_URL}/functions/v1"
ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
P = "smoke"
results = {"pass": 0, "fail": 0, "errors": []}
created_uids = []
created_wids = []
created_claim_ids = []

def record(name, passed, detail=""):
    s = "PASS" if passed else "FAIL"
    results["pass" if passed else "fail"] += 1
    if not passed: results["errors"].append(f"{name}: {detail}")
    print(f"  [{s}] {name}" + (f" — {detail}" if detail and not passed else ""))

def api(method, path, headers=None, body=None, base=BASE):
    url = f"{base}{path}" if path.startswith("/") else f"{base}/{path}"
    hdrs = {"Content-Type": "application/json"}
    if headers: hdrs.update(headers)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, raw
    except Exception as e:
        return 0, str(e)

def admin_h(extra=None):
    h = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    if extra: h.update(extra)
    return h

def anon_h(extra=None):
    h = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    if extra: h.update(extra)
    return h

def user_h(jwt, extra=None):
    h = {"apikey": ANON_KEY, "Authorization": f"Bearer {jwt}"}
    if extra: h.update(extra)
    return h

def create_user(email, password, full_name, role):
    s, r = api("POST", "/admin/users",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        body={"email": email, "password": password, "email_confirm": True,
              "user_metadata": {"full_name": full_name}},
        base=AUTH_BASE)
    uid = r.get("id") if isinstance(r, dict) else None
    s2, r2 = api("POST", "/token?grant_type=password",
        headers={"apikey": ANON_KEY}, body={"email": email, "password": password}, base=AUTH_BASE)
    jwt = r2.get("access_token") if s2 == 200 and isinstance(r2, dict) else None
    if not uid and isinstance(r2, dict) and isinstance(r2.get("user"), dict):
        uid = r2["user"].get("id")
    if uid:
        api("POST", f"/profiles?id=eq.{uid}", headers=admin_h({"Prefer": "return=representation"}),
            body={"id": uid, "role": role, "full_name": full_name, "email": email})
        api("PATCH", f"/profiles?id=eq.{uid}", headers=admin_h({"Prefer": "return=representation"}),
            body={"role": role, "full_name": full_name, "email": email})
    return uid, jwt

def make_claim_data(claim_ref, email, agent_code, flight_num, comp_amount=None, elig=None):
    d = {
        "claim_ref": claim_ref,
        "passenger_first_name": "Smoke",
        "passenger_last_name": "Test",
        "email": email,
        "phone": "+1234567890",
        "country": "US",
        "flight_number": flight_num,
        "flight_date": "2026-08-01",
        "departure": "JFK",
        "arrival": "LHR",
        "airline": "Test Air",
        "issue_type": "Delay",
        "status": "In Progress",
        "eligibility_status": elig or "Pending Check",
        "agent": agent_code,
        "loa_signed": True,
    }
    if comp_amount is not None:
        d["compensation_amount"] = comp_amount
    return d

def cleanup():
    print("\n── Cleanup ──")
    for cid in created_claim_ids:
        api("DELETE", f"/commissions?claim_id=eq.{cid}", headers=admin_h())
        api("DELETE", f"/claims?id=eq.{cid}", headers=admin_h())
    for wid in created_wids:
        api("DELETE", f"/worker_profiles?id=eq.{wid}", headers=admin_h())
    for uid in created_uids:
        api("DELETE", f"/admin/users/{uid}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}, base=AUTH_BASE)
    print("  Done.")

def main():
    print("═" * 60)
    print("  Phase 8A — Post-Merge Smoke Test")
    print("═" * 60)
    pwd = "SmokeTest123!"

    # ── Setup ──
    mgr_id, mgr_jwt = create_user(f"{P}_mgr_{ts}@test.com", pwd, "Smoke Mgr", "sales_manager")
    agentA_id, agentA_jwt = create_user(f"{P}_agentA_{ts}@test.com", pwd, "Smoke Agent A", "agent")
    agentB_id, agentB_jwt = create_user(f"{P}_agentB_{ts}@test.com", pwd, "Smoke Agent B", "agent")
    cust_id, _ = create_user(f"{P}_cust_{ts}@test.com", pwd, "Smoke Customer", "customer")
    admin_id, admin_jwt = create_user(f"{P}_admin_{ts}@test.com", pwd, "Smoke Admin", "admin")
    if not all([mgr_id, agentA_id, agentB_id, cust_id, admin_id]):
        print("FAIL: Setup failed"); cleanup(); sys.exit(1)
    for u in [mgr_id, agentA_id, agentB_id, cust_id, admin_id]:
        created_uids.append(u)

    agentA_code = f"SMK{ts[-4:]}A"
    agentB_code = f"SMK{ts[-4:]}B"

    # Worker profiles (agent_id in claims = worker_profiles.id, NOT user id)
    s, r = api("POST", "/worker_profiles", headers=admin_h({"Prefer": "return=representation"}),
        body={"user_id": agentA_id, "email": f"{P}_agentA_{ts}@test.com", "full_name": "Smoke Agent A",
              "role": "agent", "status": "active", "agent_code": agentA_code,
              "manager_id": mgr_id, "commission_rate": 10, "total_payout_earned": 100,
              "total_paid_to_date": 50, "api_key": f"smoke_key_A_{ts}", "created_by": admin_id})
    wpA_id = r[0]["id"] if s == 201 and r else None
    created_wids.append(wpA_id)

    s, r = api("POST", "/worker_profiles", headers=admin_h({"Prefer": "return=representation"}),
        body={"user_id": agentB_id, "email": f"{P}_agentB_{ts}@test.com", "full_name": "Smoke Agent B",
              "role": "agent", "status": "active", "agent_code": agentB_code,
              "manager_id": mgr_id, "commission_rate": 15, "total_payout_earned": 200,
              "total_paid_to_date": 100, "api_key": f"smoke_key_B_{ts}", "created_by": admin_id})
    wpB_id = r[0]["id"] if s == 201 and r else None
    created_wids.append(wpB_id)

    if not wpA_id or not wpB_id:
        print("FAIL: Worker profile setup failed"); cleanup(); sys.exit(1)

    # ── 1. Agent RLS ──
    print("\n── 1. Agent RLS ──")
    # Create claims via service role (agent_id = worker_profiles.id)
    cdataA = make_claim_data(f"CLM-{ts[-5:]}A1", f"{P}_cust_{ts}@test.com", agentA_code, "SMK001")
    cdataA["agent_id"] = wpA_id
    s, r = api("POST", "/claims", headers=admin_h({"Prefer": "return=representation"}), body=cdataA)
    claimA_id = r[0]["id"] if s == 201 and r else None
    if claimA_id: created_claim_ids.append(claimA_id)

    cdataB = make_claim_data(f"CLM-{ts[-5:]}B1", f"{P}_custB_{ts}@test.com", agentB_code, "SMK002")
    cdataB["agent_id"] = wpB_id
    s, r = api("POST", "/claims", headers=admin_h({"Prefer": "return=representation"}), body=cdataB)
    claimB_id = r[0]["id"] if s == 201 and r else None
    if claimB_id: created_claim_ids.append(claimB_id)

    if not claimA_id or not claimB_id:
        print("FAIL: Claim setup failed"); cleanup(); sys.exit(1)

    # Agent A sees own claim
    s, r = api("GET", "/claims?select=id,claim_ref,agent_id", headers=user_h(agentA_jwt))
    claims = r if isinstance(r, list) else []
    own = any(c["id"] == claimA_id for c in claims)
    record("Agent A sees own claim", own, f"count={len(claims)}")

    # Agent A cannot see Agent B's claim
    seesB = any(c["id"] == claimB_id for c in claims)
    record("Agent A cannot see Agent B's claim", not seesB, f"seesB={seesB}")

    # ── 2. Manager RLS ──
    print("\n── 2. Manager RLS ──")
    s, r = api("GET", "/worker_profiles?select=id,full_name", headers=user_h(mgr_jwt))
    mgr_agents = [w.get("full_name") for w in r] if s == 200 and isinstance(r, list) else []
    record("Manager sees own team agents",
           "Smoke Agent A" in mgr_agents and "Smoke Agent B" in mgr_agents,
           f"visible={mgr_agents}")

    s, r = api("GET", "/claims?select=id,claim_ref,agent_id", headers=user_h(mgr_jwt))
    mgr_claims = r if isinstance(r, list) else []
    seesA = any(c["id"] == claimA_id for c in mgr_claims)
    record("Manager sees team claim (Agent A's)", seesA, f"count={len(mgr_claims)}")

    # ── 3. Referral Attribution ──
    print("\n── 3. Referral Attribution ──")
    ref_claim_data = make_claim_data(f"CLM-{ts[-5:]}R1", f"{P}_ref_{ts}@test.com", agentA_code, "SMK003")
    s, r = api("POST", "/create-claim",
        headers=anon_h(),
        body={"claim": ref_claim_data, "files": []},
        base=EDGE_BASE)
    ref_claim_id = r.get("claim_id") if isinstance(r, dict) else None
    if ref_claim_id: created_claim_ids.append(ref_claim_id)

    if ref_claim_id:
        s2, r2 = api("GET", f"/claims?id=eq.{ref_claim_id}&select=id,agent,agent_id", headers=admin_h())
        if s2 == 200 and isinstance(r2, list) and len(r2) > 0:
            c = r2[0]
            record("Referral: agent_id stored correctly", c.get("agent_id") == wpA_id,
                   f"agent_id={c.get('agent_id')} expected={wpA_id}")
            record("Referral: agent text code stored", c.get("agent") == agentA_code,
                   f"agent={c.get('agent')} expected={agentA_code}")
        else:
            record("Referral: agent_id stored correctly", False, f"query failed: {s2}")
            record("Referral: agent text code stored", False, "query failed")
    else:
        record("Referral: agent_id stored correctly", False, f"create-claim failed: status={s} resp={r}")
        record("Referral: agent text code stored", False, "create-claim failed")

    # Invalid referral code → no attribution
    noref_data = make_claim_data(f"CLM-{ts[-5:]}N1", f"{P}_noref_{ts}@test.com", "FAKE9999", "SMK004")
    s, r = api("POST", "/create-claim",
        headers=anon_h(),
        body={"claim": noref_data, "files": []},
        base=EDGE_BASE)
    noref_id = r.get("claim_id") if isinstance(r, dict) else None
    if noref_id: created_claim_ids.append(noref_id)

    if noref_id:
        s2, r2 = api("GET", f"/claims?id=eq.{noref_id}&select=id,agent,agent_id", headers=admin_h())
        if s2 == 200 and isinstance(r2, list) and len(r2) > 0:
            c = r2[0]
            record("Invalid referral code → no attribution",
                   c.get("agent_id") is None and c.get("agent") == "—",
                   f"agent_id={c.get('agent_id')} agent={c.get('agent')}")
        else:
            record("Invalid referral code → no attribution", False, f"query failed: {s2}")
    else:
        record("Invalid referral code → no attribution", False, f"create-claim failed: status={s} resp={r}")

    # ── 4. Commission Creation ──
    print("\n── 4. Commission Creation ──")
    # Create an eligible claim with compensation for Agent A
    comm_data = make_claim_data(f"CLM-{ts[-5:]}C1", f"{P}_comm_{ts}@test.com", agentA_code, "SMK005",
                                comp_amount=600.00, elig="Eligible")
    comm_data["agent_id"] = wpA_id
    s, r = api("POST", "/claims", headers=admin_h({"Prefer": "return=representation"}), body=comm_data)
    comm_claim_id = r[0]["id"] if s == 201 and r else None
    if comm_claim_id: created_claim_ids.append(comm_claim_id)

    if not comm_claim_id:
        record("Commission: create eligible claim", False, f"status={s} resp={r}")
    else:
        # Call manage-agent-finance with admin JWT (not service role key)
        s2, r2 = api("POST", "/manage-agent-finance",
            headers=user_h(admin_jwt),
            body={"action": "recalculate-payout", "agentId": wpA_id, "newRate": 10},
            base=EDGE_BASE)
        record("recalculate-payout edge function succeeds",
               s2 == 200 and isinstance(r2, dict) and r2.get("success"),
               f"status={s2} resp={r2}")

        # Verify commission row
        s3, r3 = api("GET",
            f"/commissions?claim_id=eq.{comm_claim_id}&agent_id=eq.{wpA_id}",
            headers=admin_h())
        if s3 == 200 and isinstance(r3, list) and len(r3) > 0:
            c = r3[0]
            expected = round(600 * 10 / 100, 2)
            record("Commission row created with correct amount",
                   float(c["commission_amount"]) == expected,
                   f"amount={c['commission_amount']} expected={expected}")
            record("Commission rate stored correctly",
                   float(c["commission_rate"]) == 10,
                   f"rate={c['commission_rate']}")
            record("Commission status defaults to pending",
                   c["commission_status"] == "pending",
                   f"status={c['commission_status']}")

            # Agent cannot modify commission
            s4, r4 = api("PATCH", f"/commissions?claim_id=eq.{comm_claim_id}",
                headers=user_h(agentA_jwt), body={"commission_amount": 99999})
            s5, r5 = api("GET", f"/commissions?claim_id=eq.{comm_claim_id}&select=commission_amount",
                headers=admin_h())
            not_mod = s5 == 200 and isinstance(r5, list) and len(r5) > 0 and float(r5[0]["commission_amount"]) < 99999
            record("Agent cannot modify commission amount", not_mod, f"patch_status={s4}")
        else:
            record("Commission row created", False, f"status={s3} resp={r3}")
            record("Commission rate stored correctly", False, "no row")
            record("Commission status defaults to pending", False, "no row")
            record("Agent cannot modify commission amount", False, "no row")

    # ── 5. Sensitive-Column Blocking ──
    print("\n── 5. Sensitive-Column Blocking ──")

    # Manager tries to change commission_rate on own agent
    s, r = api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_h(mgr_jwt), body={"commission_rate": 99})
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=commission_rate", headers=admin_h())
    blocked = s2 == 200 and isinstance(r2, list) and len(r2) > 0 and r2[0]["commission_rate"] != 99
    record("Manager cannot change commission_rate", blocked, f"patch_status={s} actual={r2}")

    # Agent tries to change own role
    s, r = api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_h(agentA_jwt), body={"role": "admin"})
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=role", headers=admin_h())
    blocked = s2 == 200 and isinstance(r2, list) and len(r2) > 0 and r2[0]["role"] != "admin"
    record("Agent cannot change own role", blocked, f"patch_status={s} actual={r2}")

    # Agent tries to change own agent_code
    s, r = api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_h(agentA_jwt), body={"agent_code": "HACKED"})
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=agent_code", headers=admin_h())
    blocked = s2 == 200 and isinstance(r2, list) and len(r2) > 0 and r2[0]["agent_code"] != "HACKED"
    record("Agent cannot change own agent_code", blocked, f"patch_status={s} actual={r2}")

    # Admin CAN change commission_rate (should succeed)
    s, r = api("PATCH", f"/worker_profiles?id=eq.{wpA_id}",
        headers=user_h(admin_jwt, {"Prefer": "return=representation"}), body={"commission_rate": 12})
    s2, r2 = api("GET", f"/worker_profiles?id=eq.{wpA_id}&select=commission_rate", headers=admin_h())
    admin_ok = s2 == 200 and isinstance(r2, list) and len(r2) > 0 and r2[0]["commission_rate"] == 12
    record("Admin CAN change commission_rate", admin_ok, f"patch_status={s} actual={r2}")

    # ── Results ──
    cleanup()
    print("\n" + "═" * 60)
    print(f"  SMOKE TEST RESULTS: {results['pass']} PASS / {results['fail']} FAIL")
    if results["errors"]:
        print("  FAILURES:")
        for e in results["errors"]:
            print(f"    ✗ {e}")
    print("═" * 60)
    sys.exit(0 if results["fail"] == 0 else 1)

if __name__ == "__main__":
    main()
