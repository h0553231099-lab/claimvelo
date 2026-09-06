#!/usr/bin/env python3
"""Phase 9B post-merge smoke test — verifies the live system end-to-end."""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ["VITE_SUPABASE_URL"].rstrip("/")
ANON = os.environ["VITE_SUPABASE_ANON_KEY"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = BASE.replace("https://", "").split(".")[0]
FN = f"{BASE}/functions/v1/manage-legal-finance"

results = []
uids = []
cids = []

def api(method, path, body=None, token=None, key=None):
    headers = {"Content-Type": "application/json", "apikey": key or ANON}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "null")
        except: return e.code, e.read().decode()[:200]

def fn(action, payload, token):
    body = json.dumps({"action": action, **payload}).encode()
    req = urllib.request.Request(FN, data=body, headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "null")
        except: return e.code, e.read().decode()[:200]

def mgmt(sql):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "smoke/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

def check(name, cond, detail=""):
    s = "PASS" if cond else "FAIL"
    results.append((s, name, detail))
    print(f"  [{s}] {name}" + (f" — {detail}" if detail else ""))

def mkuser(email, pw, role):
    req = urllib.request.Request(f"{BASE}/auth/v1/admin/users",
        data=json.dumps({"email": email, "password": pw, "email_confirm": True, "user_metadata": {"role": role}}).encode(),
        headers={"Authorization": f"Bearer {SVC}", "apikey": ANON, "Content-Type": "application/json"}, method="POST")
    try:
        uid = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())["id"]
    except urllib.error.HTTPError:
        req2 = urllib.request.Request(f"{BASE}/auth/v1/admin/users?email={email}",
            headers={"Authorization": f"Bearer {SVC}", "apikey": ANON}, method="GET")
        uid = json.loads(urllib.request.urlopen(req2, timeout=30).read().decode())["users"][0]["id"]
    uids.append(uid)
    api("POST", "/rest/v1/profiles?on_conflict=id", {"id": uid, "email": email, "full_name": f"Test {role}", "role": role}, token=SVC, key=SVC)
    _, d = api("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw}, key=ANON)
    return uid, d["access_token"]

def mkclaim(ref):
    _, d = api("POST", "/rest/v1/claims", {"claim_ref": ref, "passenger_first_name": "S", "passenger_last_name": "M",
        "email": f"smoke_{ref.lower()}@test.app", "flight_number": "BA123", "flight_date": "2026-08-15",
        "departure": "LHR", "arrival": "JFK", "airline": "BA", "issue_type": "delay", "status": "In Progress"}, token=SVC, key=SVC)
    cid = d[0]["id"] if isinstance(d, list) and d else mgmt(f"SELECT id FROM claims WHERE claim_ref='{ref}'")[0]["id"]
    cids.append(cid)
    return cid

def cleanup():
    for c in cids:
        mgmt(f"DELETE FROM finance_transactions WHERE claim_id='{c}'; DELETE FROM legal_cases WHERE claim_id='{c}'; DELETE FROM audit_log WHERE entity_id='{c}'; DELETE FROM claims WHERE id='{c}';")
    for u in uids:
        try:
            req = urllib.request.Request(f"{BASE}/auth/v1/admin/users/{u}", headers={"Authorization": f"Bearer {SVC}", "apikey": ANON}, method="DELETE")
            urllib.request.urlopen(req, timeout=30)
        except: pass
        mgmt(f"DELETE FROM profiles WHERE id='{u}';")

def main():
    ts = str(int(time.time()))
    pw = "Test1234!Pass"
    print("\n=== Phase 9B Post-Merge Smoke Test ===\n")
    admin_id, admin = mkuser(f"smoke_admin_{ts}@test.app", pw, "admin")
    cust_id, cust = mkuser(f"smoke_cust_{ts}@test.app", pw, "customer")

    # 1. Legal escalation
    c1 = mkclaim(f"SMK-STD-{ts}")
    st, r = fn("escalate-claim", {"claimId": c1, "escalationReason": "smoke test"}, admin)
    check("legal escalation", st == 200 and r.get("legalCase", {}).get("id"), f"status={st}")

    # 2. Compensation approval
    st, r = fn("approve-compensation", {"claimId": c1, "amount": 600}, admin)
    check("compensation approval", st == 200 and r.get("approvedAmount") == 600, f"status={st}")

    # 3. 30% standard fee
    st, r = fn("set-claimvelo-fee", {"claimId": c1, "tier": "standard"}, admin)
    check("30% standard fee (180 of 600)", st == 200 and r.get("feeAmount") == 180, f"fee={r.get('feeAmount')}")

    # 4. 50% legal fee
    c2 = mkclaim(f"SMK-LEG-{ts}")
    fn("escalate-claim", {"claimId": c2, "escalationReason": "legal"}, admin)
    fn("approve-compensation", {"claimId": c2, "amount": 400}, admin)
    st, r = fn("set-claimvelo-fee", {"claimId": c2, "tier": "legal"}, admin)
    check("50% legal fee (200 of 400)", st == 200 and r.get("feeAmount") == 200, f"fee={r.get('feeAmount')}")

    # 5. Airline payment
    st, r = fn("record-airline-payment", {"claimId": c1, "amount": 600, "paymentDate": "2026-09-06", "reference": "AIR-SMK"}, admin)
    check("airline payment recording", st == 200 and r.get("amount") == 600, f"status={st}")

    # 6. Customer payout
    st, r = fn("record-customer-payout", {"claimId": c1, "amount": 420, "paymentDate": "2026-09-06", "reference": "PAY-SMK"}, admin)
    check("customer payout (420 = 600-180)", st == 200 and r.get("amount") == 420, f"status={st}")

    # 7. Reconciliation
    st, r = fn("get-reconciliation", {"claimId": c1}, admin)
    check("reconciliation complete", st == 200 and r.get("overallStatus") == "complete", f"status={r.get('overallStatus')}")

    # 8. Unauthorized finance action blocked
    st, r = fn("approve-compensation", {"claimId": c1, "amount": 999}, cust)
    check("unauthorized finance action blocked", st == 403, f"status={st}")

    print(f"\n{'='*50}")
    p = sum(1 for s, _, _ in results if s == "PASS")
    f = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"{p} passed, {f} failed, {len(results)} total")
    if f:
        for s, n, d in results:
            if s == "FAIL": print(f"  - {n}: {d}")
    return 1 if f else 0

if __name__ == "__main__":
    rc = 0
    try: rc = main()
    finally: cleanup(); print("[cleanup] done")
    sys.exit(rc)
