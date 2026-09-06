#!/usr/bin/env python3
"""
Phase 9A post-merge smoke test — focused on 4 areas:
  1. finance RLS (non-admin blocked, admin allowed)
  2. lawyer assigned-claim isolation
  3. legal_cases access
  4. audit trigger creation
"""
import json, os, time, urllib.request, urllib.error

BASE = os.environ["VITE_SUPABASE_URL"].rstrip("/")
ANON = os.environ["VITE_SUPABASE_ANON_KEY"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = BASE.replace("https://", "").split(".")[0]
PW = "SmokeTest1234!"
created = []
passed = failed = 0

def api(method, path, body=None, token=None, key=None):
    headers = {"Content-Type": "application/json", "apikey": key or ANON}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30); return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:200]

def q(sql):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "claimvelo-smoke/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

def check(name, cond, detail=""):
    global passed, failed
    if cond: passed += 1; print(f"  [PASS] {name}" + (f" — {detail}" if detail else ""))
    else: failed += 1; print(f"  [FAIL] {name} — {detail}")

def mkuser(email, role, name):
    req = urllib.request.Request(f"{BASE}/auth/v1/admin/users",
        data=json.dumps({"email": email, "password": PW, "email_confirm": True,
                         "user_metadata": {"full_name": name, "role": role}}).encode(),
        headers={"Authorization": f"Bearer {SVC}", "apikey": ANON, "Content-Type": "application/json"}, method="POST")
    try:
        uid = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())["id"]
    except urllib.error.HTTPError:
        req2 = urllib.request.Request(f"{BASE}/auth/v1/admin/users", data=json.dumps({"email": email}).encode(),
            headers={"Authorization": f"Bearer {SVC}", "apikey": ANON, "Content-Type": "application/json"}, method="GET")
        uid = json.loads(urllib.request.urlopen(req2, timeout=30).read().decode())["users"][0]["id"]
    created.append(uid)
    api("POST", "/rest/v1/profiles?on_conflict=id", {"id": uid, "email": email, "full_name": name, "role": role}, token=SVC, key=SVC)
    s, d = api("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": PW}, key=ANON)
    if s != 200:
        req = urllib.request.Request(f"{BASE}/auth/v1/admin/users/{uid}", data=json.dumps({"password": PW}).encode(),
            headers={"Authorization": f"Bearer {SVC}", "apikey": ANON, "Content-Type": "application/json"}, method="PUT")
        urllib.request.urlopen(req, timeout=30)
        s, d = api("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": PW}, key=ANON)
    return uid, d["access_token"]

def cleanup():
    for uid in created:
        try:
            req = urllib.request.Request(f"{BASE}/auth/v1/admin/users/{uid}",
                headers={"Authorization": f"Bearer {SVC}", "apikey": ANON}, method="DELETE")
            urllib.request.urlopen(req, timeout=30)
        except: pass
        q(f"DELETE FROM profiles WHERE id = '{uid}';")

try:
    ts = str(int(time.time()))
    print("=== 1. finance RLS ===")
    lawyer_uid, lawyer_jwt = mkuser(f"smoke_lawyer_{ts}@test.app", "lawyer", "Smoke Lawyer")
    admin_uid, admin_jwt = mkuser(f"smoke_admin_{ts}@test.app", "admin", "Smoke Admin")
    s, d = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=lawyer_jwt, key=ANON)
    check("lawyer blocked from finance", not (isinstance(d, list) and d), f"status={s}")
    s, d = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=admin_jwt, key=ANON)
    check("admin allowed on finance", isinstance(d, list) and len(d) > 0, f"status={s} rows={len(d) if isinstance(d,list) else 0}")

    print("=== 2. lawyer assigned-claim isolation ===")
    lawyer2_uid, lawyer2_jwt = mkuser(f"smoke_lawyer2_{ts}@test.app", "lawyer", "Smoke Lawyer 2")
    s, d = api("POST", "/rest/v1/claims", {"claim_ref": f"SMK-{ts}", "passenger_first_name": "S",
        "passenger_last_name": "M", "email": f"smoke_{ts}@test.app", "flight_number": "BA1",
        "departure": "LHR", "arrival": "JFK", "airline": "BA", "issue_type": "delay",
        "lawyer_id": lawyer_uid, "status": "In Progress"}, token=SVC, key=SVC)
    cid = d[0]["id"] if isinstance(d, list) and d else q(f"SELECT id FROM claims WHERE claim_ref='SMK-{ts}'")[0]["id"]
    s, d = api("GET", f"/rest/v1/claims?id=eq.{cid}&select=id", token=lawyer_jwt, key=ANON)
    check("assigned lawyer reads claim", isinstance(d, list) and len(d) == 1, f"status={s}")
    s, d = api("GET", f"/rest/v1/claims?id=eq.{cid}&select=id", token=lawyer2_jwt, key=ANON)
    check("other lawyer blocked from claim", isinstance(d, list) and len(d) == 0, f"status={s}")

    print("=== 3. legal_cases access ===")
    s, d = api("POST", "/rest/v1/legal_cases", {"claim_id": cid, "lawyer_id": lawyer_uid,
        "legal_status": "intake", "escalation_reason": "smoke"}, token=SVC, key=SVC)
    lcid = d[0]["id"] if isinstance(d, list) and d else q(f"SELECT id FROM legal_cases WHERE claim_id='{cid}'")[0]["id"]
    s, d = api("GET", f"/rest/v1/legal_cases?id=eq.{lcid}&select=id", token=lawyer_jwt, key=ANON)
    check("assigned lawyer reads legal_case", isinstance(d, list) and len(d) == 1, f"status={s}")
    s, d = api("GET", f"/rest/v1/legal_cases?id=eq.{lcid}&select=id", token=lawyer2_jwt, key=ANON)
    check("other lawyer blocked from legal_case", isinstance(d, list) and len(d) == 0, f"status={s}")
    s, d = api("GET", f"/rest/v1/legal_cases?id=eq.{lcid}&select=id", token=admin_jwt, key=ANON)
    check("admin reads legal_case", isinstance(d, list) and len(d) == 1, f"status={s}")

    print("=== 4. audit trigger creation ===")
    rows = q("SELECT count(*) AS n FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name IN ('audit_commissions_insert','audit_commissions_update','audit_legal_cases_insert','audit_legal_cases_update','audit_legal_cases_delete','audit_claims_update');")
    check("all 6 audit triggers exist", int(rows[0]["n"]) == 6, f"count={rows[0]['n']}")
    before = q("SELECT count(*) AS n FROM audit_log WHERE action='legal_case.created';")
    q(f"UPDATE legal_cases SET notes='smoke update' WHERE id='{lcid}';")
    after_upd = q("SELECT count(*) AS n FROM audit_log WHERE action='legal_case.updated';")
    check("legal_case.update audited", int(after_upd[0]["n"]) > 0, f"updated={after_upd[0]['n']}")

    print(f"\n{passed} passed, {failed} failed")
finally:
    cleanup()
