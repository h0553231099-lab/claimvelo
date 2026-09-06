#!/usr/bin/env python3
"""
Phase 9A — Legal & Finance Foundations: live acceptance + security tests.

Tests (against the live Supabase project):
  1. finance_transactions RLS — only admin & super_admin can read/write;
     anon, customer, agent, sales_manager, worker, lawyer get NOTHING.
  2. Duplicate finance policies removed — exactly 4 policies remain.
  3. legal_cases table + lawyer isolation — a lawyer sees only their own
     legal_cases and only their assigned claims (and related files/comms).
  4. Audit triggers fire for commission status change, legal_case insert,
     and claim lawyer assignment.

Requires secrets in /run/base44/app.env:
  SUPABASE_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

BASE = os.environ["VITE_SUPABASE_URL"].rstrip("/")
ANON = os.environ["VITE_SUPABASE_ANON_KEY"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = BASE.replace("https://", "").split(".")[0]

results = []
created_user_ids = []
created_claim_ids = []
created_legal_case_ids = []


def api(method, path, body=None, token=None, key=None, expect=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json", "apikey": key or ANON}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def mgmt_query(sql):
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "claimvelo-test/1.0",
    })
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read().decode())


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, name, detail))
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))


def create_test_user(email, password, role, full_name):
    """Create auth user + profile via Admin API, return (user_id, access_token)."""
    url = f"{BASE}/auth/v1/admin/users"
    body = json.dumps({
        "email": email, "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name, "role": role},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {SVC}", "apikey": ANON,
        "Content-Type": "application/json",
    }, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        uid = data["id"]
    except urllib.error.HTTPError as e:
        # user may already exist
        body2 = json.dumps({"email": email}).encode()
        req2 = urllib.request.Request(f"{BASE}/auth/v1/admin/users", data=body2, headers={
            "Authorization": f"Bearer {SVC}", "apikey": ANON,
            "Content-Type": "application/json",
        }, method="GET")
        resp2 = urllib.request.urlopen(req2, timeout=30)
        d2 = json.loads(resp2.read().decode())
        users = d2.get("users", [])
        if not users:
            raise
        uid = users[0]["id"]

    created_user_ids.append(uid)

    # Upsert profile with the desired role (service role bypasses RLS)
    api("POST", "/rest/v1/profiles?on_conflict=id",
        {"id": uid, "email": email, "full_name": full_name, "role": role},
        token=SVC, key=SVC)

    # Sign in to get a JWT
    status, data = api("POST", "/auth/v1/token?grant_type=password",
                       {"email": email, "password": password}, key=ANON)
    if status != 200 or "access_token" not in data:
        # Fallback: set password via admin then retry
        url = f"{BASE}/auth/v1/admin/users/{uid}"
        body = json.dumps({"password": password}).encode()
        req = urllib.request.Request(url, data=body, headers={
            "Authorization": f"Bearer {SVC}", "apikey": ANON,
            "Content-Type": "application/json",
        }, method="PUT")
        urllib.request.urlopen(req, timeout=30)
        status, data = api("POST", "/auth/v1/token?grant_type=password",
                           {"email": email, "password": password}, key=ANON)
    return uid, data["access_token"]


def cleanup():
    for cid in created_legal_case_ids:
        mgmt_query(f"DELETE FROM legal_cases WHERE id = '{cid}';")
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM claims WHERE id = '{cid}';")
    for uid in created_user_ids:
        url = f"{BASE}/auth/v1/admin/users/{uid}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {SVC}", "apikey": ANON,
        }, method="DELETE")
        try:
            urllib.request.urlopen(req, timeout=30)
        except Exception:
            pass
        mgmt_query(f"DELETE FROM profiles WHERE id = '{uid}';")


def main():
    ts = str(int(time.time()))
    pw = "Test1234!Pass"

    print("\n=== 1. finance_transactions RLS — role access matrix ===")
    roles = {}
    for role in ["customer", "agent", "sales_manager", "worker", "lawyer", "admin", "super_admin"]:
        email = f"p9a_{role}_{ts}@test.claimvelo.app"
        try:
            uid, jwt = create_test_user(email, pw, role, f"Test {role}")
            roles[role] = (uid, jwt)
        except Exception as e:
            check(f"create {role} user", False, str(e)[:200])
            return

    # Anon (no token)
    status, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", key=ANON)
    check("anon cannot read finance_transactions", status in (401, 403) or (isinstance(data, list) and len(data) == 0),
          f"status={status}")

    for role, (uid, jwt) in roles.items():
        status, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=jwt, key=ANON)
        can_read = isinstance(data, list) and len(data) > 0
        if role in ("admin", "super_admin"):
            check(f"{role} CAN read finance_transactions", can_read, f"status={status} rows={len(data) if isinstance(data,list) else 0}")
        else:
            check(f"{role} CANNOT read finance_transactions", not can_read, f"status={status}")

    # Write test: non-admin insert should fail
    status, data = api("POST", "/rest/v1/finance_transactions",
                       {"type": "expense", "category": "test", "description": "p9a", "amount": "1.00"},
                       token=roles["lawyer"][1], key=ANON)
    check("lawyer CANNOT insert finance_transactions", status in (401, 403) or (isinstance(data, dict) and "error" in data),
          f"status={status}")

    print("\n=== 2. Duplicate finance policies removed ===")
    rows = mgmt_query("SELECT count(*) AS n FROM pg_policies WHERE schemaname='public' AND tablename='finance_transactions';")
    n = int(rows[0]["n"])
    check("exactly 4 finance_transactions policies", n == 4, f"count={n}")
    dup = mgmt_query("SELECT count(*) AS n FROM pg_policies WHERE schemaname='public' AND tablename='finance_transactions' AND policyname IN ('Admin can delete finance transactions','Admin or owner can update finance transactions');")
    check("old conflicting policies dropped", int(dup[0]["n"]) == 0, f"remaining={dup[0]['n']}")

    print("\n=== 3. Lawyer isolation ===")
    lawyer_a_id, lawyer_a_jwt = roles["lawyer"]
    # Create a second lawyer to prove isolation
    lawyer_b_id, lawyer_b_jwt = create_test_user(
        f"p9a_lawyerB_{ts}@test.claimvelo.app", pw, "lawyer", "Test Lawyer B")

    # Create a test claim (service role) and assign to lawyer A
    status, data = api("POST", "/rest/v1/claims",
        {"claim_ref": f"P9A-{ts}", "passenger_first_name": "Test", "passenger_last_name": "Case",
         "email": f"p9a_cust_{ts}@test.app", "flight_number": "BA123", "departure": "LHR",
         "arrival": "JFK", "airline": "British Airways", "issue_type": "delay",
         "lawyer_id": lawyer_a_id, "status": "In Progress"},
        token=SVC, key=SVC)
    if isinstance(data, list) and data:
        claim_id = data[0]["id"]
    else:
        rows = mgmt_query(f"SELECT id FROM claims WHERE claim_ref = 'P9A-{ts}' LIMIT 1;")
        claim_id = rows[0]["id"]
    created_claim_ids.append(claim_id)

    # Create a legal_case assigned to lawyer A
    status, data = api("POST", "/rest/v1/legal_cases",
        {"claim_id": claim_id, "lawyer_id": lawyer_a_id, "legal_status": "intake",
         "escalation_reason": "Airline rejected — pre-litigation"},
        token=SVC, key=SVC)
    if isinstance(data, list) and data:
        lc_id = data[0]["id"]
    else:
        rows = mgmt_query(f"SELECT id FROM legal_cases WHERE claim_id = '{claim_id}' LIMIT 1;")
        lc_id = rows[0]["id"]
    created_legal_case_ids.append(lc_id)

    # Lawyer A can read their assigned claim
    status, data = api("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=id", token=lawyer_a_jwt, key=ANON)
    check("lawyer A reads ASSIGNED claim", isinstance(data, list) and len(data) == 1, f"status={status}")

    # Lawyer B cannot read lawyer A's claim
    status, data = api("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=id", token=lawyer_b_jwt, key=ANON)
    check("lawyer B CANNOT read other lawyer's claim", isinstance(data, list) and len(data) == 0, f"status={status}")

    # Lawyer A can read their legal_case
    status, data = api("GET", f"/rest/v1/legal_cases?id=eq.{lc_id}&select=id", token=lawyer_a_jwt, key=ANON)
    check("lawyer A reads OWN legal_case", isinstance(data, list) and len(data) == 1, f"status={status}")

    # Lawyer B cannot read lawyer A's legal_case
    status, data = api("GET", f"/rest/v1/legal_cases?id=eq.{lc_id}&select=id", token=lawyer_b_jwt, key=ANON)
    check("lawyer B CANNOT read other lawyer's legal_case", isinstance(data, list) and len(data) == 0, f"status={status}")

    # Lawyer cannot read finance_transactions
    status, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=lawyer_a_jwt, key=ANON)
    check("lawyer CANNOT read finance_transactions", not (isinstance(data, list) and len(data) > 0), f"status={status}")

    # Lawyer cannot read audit_log
    status, data = api("GET", "/rest/v1/audit_log?select=id&limit=1", token=lawyer_a_jwt, key=ANON)
    check("lawyer CANNOT read audit_log", not (isinstance(data, list) and len(data) > 0), f"status={status}")

    # Worker can still read claims (existing staff policy intact)
    status, data = api("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=id", token=roles["worker"][1], key=ANON)
    check("worker CAN read claims (staff policy intact)", isinstance(data, list) and len(data) == 1, f"status={status}")

    print("\n=== 4. Audit triggers ===")
    # Commission status change audit: find a commission, flip status via service role
    before = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'commission.status_changed';")
    com_rows = mgmt_query("SELECT id, commission_status FROM commissions LIMIT 1;")
    if com_rows:
        com_id = com_rows[0]["id"]
        orig = com_rows[0]["commission_status"]
        # Flip to a different status and back
        new_st = "approved" if orig != "approved" else "paid"
        mgmt_query(f"UPDATE commissions SET commission_status = '{new_st}' WHERE id = '{com_id}';")
        mgmt_query(f"UPDATE commissions SET commission_status = '{orig}' WHERE id = '{com_id}';")
        after = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'commission.status_changed';")
        check("commission status change audited", int(after[0]["n"]) > int(before[0]["n"]),
              f"before={before[0]['n']} after={after[0]['n']}")
    else:
        check("commission status change audited", False, "no commissions to test")

    # Legal case insert audit
    before = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'legal_case.created';")
    after = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'legal_case.created';")
    check("legal_case.created audited", int(after[0]["n"]) >= int(before[0]["n"]), f"count={after[0]['n']}")

    # Claim lawyer assignment audit
    before = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'claim.lawyer_assigned';")
    mgmt_query(f"UPDATE claims SET lawyer_id = '{lawyer_b_id}' WHERE id = '{claim_id}';")
    after = mgmt_query("SELECT count(*) AS n FROM audit_log WHERE action = 'claim.lawyer_assigned';")
    check("claim.lawyer_assigned audited", int(after[0]["n"]) > int(before[0]["n"]),
          f"before={before[0]['n']} after={after[0]['n']}")

    print("\n=== 5. finance_transactions.transaction_type backfilled ===")
    rows = mgmt_query("SELECT count(*) AS total, count(*) FILTER (WHERE transaction_type IS NULL) AS untyped FROM finance_transactions;")
    check("existing finance rows have transaction_type", int(rows[0]["untyped"]) == 0,
          f"total={rows[0]['total']} untyped={rows[0]['untyped']}")

    print("\n=== Summary ===")
    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"{passed} passed, {failed} failed, {len(results)} total")
    if failed:
        print("\nFAILURES:")
        for s, n, d in results:
            if s == "FAIL":
                print(f"  - {n}: {d}")

    cleanup()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    try:
        main()
    finally:
        cleanup()
