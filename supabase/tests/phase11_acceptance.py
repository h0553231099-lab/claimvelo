#!/usr/bin/env python3
"""Phase 11 acceptance tests — verifies all confirmed bug fixes against live Supabase."""
import json, requests, sys, time, uuid

BASE = "https://ysqyqywsgobdinzgwrpg.supabase.co"
_env = {}
for _l in open("/run/base44/app.env").read().strip().split("\n"):
    if "=" in _l:
        _k, _v = _l.split("=", 1)
        _env[_k] = _v.strip().strip('"').strip("'")
SR_KEY = _env["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY = _env["VITE_SUPABASE_ANON_KEY"]
ACCESS_TOKEN = _env["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/ysqyqywsgobdinzgwrpg/database/query"

PASS = 0
FAIL = 0
TEST_USER_IDS = []
TEST_CLAIM_IDS = []
TEST_FILE_PATHS = []

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ PASS: {name}")
    else:
        FAIL += 1
        print(f"  ❌ FAIL: {name} — {detail}")

def sql(query):
    r = requests.post(MGMT_API, headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"},
                      json={"query": query})
    return r.json() if r.ok else []

def create_user(email, password, role):
    r = requests.post(f"{BASE}/auth/v1/admin/users",
                      headers={"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json"},
                      json={"email": email, "password": password, "email_confirm": True})
    if not r.ok:
        print(f"  ERROR creating user {email}: {r.status_code} {r.text[:200]}")
        return None
    uid = r.json().get("id")
    if uid:
        TEST_USER_IDS.append(uid)
        sql(f"INSERT INTO profiles (id, role, full_name, email) VALUES ('{uid}', '{role}', 'Test {role}', '{email}') ON CONFLICT (id) DO UPDATE SET role = '{role}', email = '{email}'")
    return uid

def sign_in(email, password):
    r = requests.post(f"{BASE}/auth/v1/token?grant_type=password",
                      headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
                      json={"email": email, "password": password})
    if not r.ok:
        print(f"  ERROR signing in {email}: {r.status_code} {r.text[:200]}")
        return None
    return r.json().get("access_token")

def rest(method, path, token, body=None):
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = getattr(requests, method)(f"{BASE}/rest/v1/{path}", headers=headers, json=body)
    return r

def admin_rest(method, path, body=None):
    headers = {"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json",
               "Prefer": "return=representation"}
    r = getattr(requests, method)(f"{BASE}/rest/v1/{path}", headers=headers, json=body)
    return r

print("=" * 70)
print("PHASE 11 ACCEPTANCE TESTS")
print("=" * 70)

# ── Setup: create test users ─────────────────────────────────────────────────
print("\n── Setup ──")
cust_email = f"p11test-cust-{uuid.uuid4().hex[:6]}@test.com"
admin_email = f"p11test-admin-{uuid.uuid4().hex[:6]}@test.com"
super_email = f"p11test-super-{uuid.uuid4().hex[:6]}@test.com"
cust2_email = f"p11test-cust2-{uuid.uuid4().hex[:6]}@test.com"
password = "Test1234!Secure"

cust_id = create_user(cust_email, password, "customer")
admin_id = create_user(admin_email, password, "admin")
super_id = create_user(super_email, password, "super_admin")
cust2_id = create_user(cust2_email, password, "customer")
print(f"  Created: customer={cust_id[:8]}, admin={admin_id[:8]}, super_admin={super_id[:8]}, customer2={cust2_id[:8]}")

cust_token = sign_in(cust_email, password)
admin_token = sign_in(admin_email, password)
super_token = sign_in(super_email, password)
cust2_token = sign_in(cust2_email, password)

# Create test claims for customer and customer2
claim1 = admin_rest("post", "claims", {
    "claim_ref": f"P11T-{uuid.uuid4().hex[:6]}",
    "email": cust_email, "passenger_first_name": "Test", "passenger_last_name": "Customer",
    "airline": "TestAir", "flight_number": "TA100", "status": "Untouched",
    "customer_user_id": cust_id, "last_customer_update_at": "2025-01-01T00:00:00Z"
}).json()
claim1_id = claim1[0].get("id") if isinstance(claim1, list) else claim1.get("id")
TEST_CLAIM_IDS.append(claim1_id)

claim2 = admin_rest("post", "claims", {
    "claim_ref": f"P11T-{uuid.uuid4().hex[:6]}",
    "email": cust2_email, "passenger_first_name": "Test2", "passenger_last_name": "Customer2",
    "airline": "TestAir", "flight_number": "TA200", "status": "Untouched",
    "customer_user_id": cust2_id, "last_customer_update_at": "2025-01-01T00:00:00Z"
}).json()
claim2_id = claim2[0].get("id") if isinstance(claim2, list) else claim2.get("id")
TEST_CLAIM_IDS.append(claim2_id)

# Create info request for claim1
ir1 = admin_rest("post", "claim_info_requests", {
    "claim_id": claim1_id, "request_type": "document", "title": "Test Document Request",
    "description": "Please upload your passport", "status": "requested",
    "requested_by": admin_id
}).json()
ir1_id = ir1[0].get("id") if isinstance(ir1, list) else ir1.get("id")

# Insert a notification for testing
admin_rest("post", "notifications", {
    "type": "new_claim", "claim_ref": "P11TEST", "message": "Test notification"
})

print(f"  Created claims: {claim1_id[:8]}, {claim2_id[:8]}")

# ── Test 1: Customer cannot change role to admin ────────────────────────────
print("\n── Test 1: Profiles role escalation ──")
cust_role_after = sql(f"SELECT role FROM profiles WHERE id = '{cust_id}'")
cust_role_val = cust_role_after[0]["role"] if cust_role_after else "none"
r = rest("patch", f"profiles?id=eq.{cust_id}", cust_token, {"role": "admin"})
cust_role_after2 = sql(f"SELECT role FROM profiles WHERE id = '{cust_id}'")
cust_role_val2 = cust_role_after2[0]["role"] if cust_role_after2 else "none"
check("Customer UPDATE own role to admin blocked",
      r.status_code >= 400 or (r.status_code == 204 and cust_role_val2 == "customer"),
      f"status={r.status_code}, role={cust_role_val2}")

r = rest("patch", f"profiles?id=eq.{cust_id}", cust_token, {"role": "super_admin"})
cust_role_after3 = sql(f"SELECT role FROM profiles WHERE id = '{cust_id}'")
cust_role_val3 = cust_role_after3[0]["role"] if cust_role_after3 else "none"
check("Customer UPDATE own role to super_admin blocked",
      r.status_code >= 400 or (r.status_code == 204 and cust_role_val3 == "customer"),
      f"status={r.status_code}, role={cust_role_val3}")

# ── Test 2: Admin can change roles ───────────────────────────────────────────
print("\n── Test 2: Admin role management ──")
r = rest("patch", f"profiles?id=eq.{cust2_id}", admin_token, {"role": "worker"})
actual_role = sql(f"SELECT role FROM profiles WHERE id = '{cust2_id}'")[0]["role"] if sql(f"SELECT role FROM profiles WHERE id = '{cust2_id}'") else "none"
check("Admin can UPDATE another user's role", actual_role == "worker", f"role={actual_role}")
# Restore
rest("patch", f"profiles?id=eq.{cust2_id}", admin_token, {"role": "customer"})

# ── Test 3: Notifications SELECT — customer/agent/lawyer blocked ─────────────
print("\n── Test 3: Notifications SELECT ──")
r = rest("get", "notifications?select=id", cust_token)
check("Customer cannot read notifications", r.status_code == 200 and len(r.json()) == 0,
      f"status={r.status_code}, count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", "notifications?select=id", admin_token)
check("Admin can read notifications", r.status_code == 200 and len(r.json()) > 0,
      f"status={r.status_code}, count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", "notifications?select=id", super_token)
check("Super_admin can read notifications", r.status_code == 200 and len(r.json()) > 0,
      f"status={r.status_code}, count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 4: Notifications INSERT — customer blocked ───────────────────────────
print("\n── Test 4: Notifications INSERT ──")
r = rest("post", "notifications", cust_token, {"type": "new_claim", "claim_ref": "FAKE", "message": "Fake"})
check("Customer cannot INSERT notifications", r.status_code >= 400,
      f"status={r.status_code}")

r = rest("post", "notifications", admin_token, {"type": "status_changed", "claim_ref": "P11TEST", "message": "Admin test"})
check("Admin can INSERT notifications", r.status_code == 201,
      f"status={r.status_code}")

# ── Test 5: profiles SELECT — super_admin can read all ───────────────────────
print("\n── Test 5: Profiles SELECT ──")
r = rest("get", "profiles?select=id", cust_token)
check("Customer sees only own profile", r.status_code == 200 and len(r.json()) == 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", "profiles?select=id", super_token)
check("Super_admin can read all profiles", r.status_code == 200 and len(r.json()) > 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", "profiles?select=id", admin_token)
check("Admin can read all profiles", r.status_code == 200 and len(r.json()) > 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 6: 30-day cron — due claim receives exactly one update ──────────────
print("\n── Test 6: 30-day cron ──")
# claim1 has last_customer_update_at = 2025-01-01, status = Untouched → overdue
before_count = sql(f"SELECT count(*) as c FROM claim_communications WHERE claim_id = '{claim1_id}'")[0]["c"]

# Call edge function directly
r = requests.post(f"{BASE}/functions/v1/send-30-day-updates",
                  headers={"Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json"},
                  json={})
result = r.json()
print(f"  Edge function response: {result}")

after_count = sql(f"SELECT count(*) as c FROM claim_communications WHERE claim_id = '{claim1_id}'")[0]["c"]
check("Due claim received one 30-day update", after_count == before_count + 1,
      f"before={before_count}, after={after_count}")

# Run again — should not duplicate
r2 = requests.post(f"{BASE}/functions/v1/send-30-day-updates",
                   headers={"Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json"},
                   json={})
after2_count = sql(f"SELECT count(*) as c FROM claim_communications WHERE claim_id = '{claim1_id}'")[0]["c"]
check("Second run does not duplicate", after2_count == after_count,
      f"after1={after_count}, after2={after2_count}")

# ── Test 7: Customer upload via edge function ────────────────────────────────
print("\n── Test 7: Customer file upload ──")
# Upload for own claim
file_content = b"Test passport document content"
files = {"file": ("test_passport.pdf", file_content, "application/pdf")}
data = {"claim_id": claim1_id, "info_request_id": ir1_id, "note": "Response to info request"}
r = requests.post(f"{BASE}/functions/v1/upload-claim-file",
                  headers={"Authorization": f"Bearer {cust_token}"},
                  files=files, data=data)
result = r.json()
check("Customer can upload file for own claim", r.status_code == 200 and result.get("success"),
      f"status={r.status_code}, result={result}")
if result.get("storage_path"):
    TEST_FILE_PATHS.append(result["storage_path"])

# Try to upload for another customer's claim
files2 = {"file": ("test_evil.pdf", b"evil", "application/pdf")}
data2 = {"claim_id": claim2_id, "note": "Trying to upload to someone else's claim"}
r2 = requests.post(f"{BASE}/functions/v1/upload-claim-file",
                   headers={"Authorization": f"Bearer {cust_token}"},
                   files=files2, data=data2)
check("Customer cannot upload to another customer's claim", r2.status_code == 403,
      f"status={r2.status_code}")

# ── Test 8: Customer cannot read another customer's claim files ─────────────
print("\n── Test 8: Customer claim_files isolation ──")
r = rest("get", f"claim_files?claim_id=eq.{claim1_id}&select=id", cust_token)
check("Customer can read own claim files", r.status_code == 200 and len(r.json()) >= 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", f"claim_files?claim_id=eq.{claim2_id}&select=id", cust_token)
check("Customer cannot read another customer's claim files", r.status_code == 200 and len(r.json()) == 0,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 9: claim_communications customer isolation ──────────────────────────
print("\n── Test 9: claim_communications isolation ──")
r = rest("get", f"claim_communications?claim_id=eq.{claim1_id}&select=id", cust_token)
check("Customer can read own communications", r.status_code == 200 and len(r.json()) >= 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", f"claim_communications?claim_id=eq.{claim2_id}&select=id", cust_token)
check("Customer cannot read another customer's communications", r.status_code == 200 and len(r.json()) == 0,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 10: claim_info_requests customer isolation ──────────────────────────
print("\n── Test 10: claim_info_requests isolation ──")
r = rest("get", f"claim_info_requests?claim_id=eq.{claim1_id}&select=id", cust_token)
check("Customer can read own info requests", r.status_code == 200 and len(r.json()) >= 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", f"claim_info_requests?claim_id=eq.{claim2_id}&select=id", cust_token)
check("Customer cannot read another customer's info requests", r.status_code == 200 and len(r.json()) == 0,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 11: Claims RLS still correct ────────────────────────────────────────
print("\n── Test 11: Claims RLS ──")
r = rest("get", f"claims?id=eq.{claim1_id}&select=id", cust_token)
check("Customer sees own claim", r.status_code == 200 and len(r.json()) == 1,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", f"claims?id=eq.{claim2_id}&select=id", cust_token)
check("Customer cannot see another customer's claim", r.status_code == 200 and len(r.json()) == 0,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

r = rest("get", "claims?select=id&limit=5", admin_token)
check("Admin sees claims", r.status_code == 200 and len(r.json()) > 0,
      f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ── Test 12: dispatch_30_day_updates reads from Vault ────────────────────────
print("\n── Test 12: dispatch_30_day_updates Vault ──")
func_def = sql("SELECT pg_get_functiondef(oid) as d FROM pg_proc WHERE proname = 'dispatch_30_day_updates'")[0]["d"]
check("dispatch_30_day_updates reads from vault.decrypted_secrets",
      "vault.decrypted_secrets" in func_def and "gmail_sync_service_role_key" in func_def,
      "Vault pattern not found in function")
check("dispatch_30_day_updates does NOT use current_setting app.service_role_key",
      "current_setting('app.service_role_key'" not in func_def,
      "Still using GUC")

# ── Cleanup ──────────────────────────────────────────────────────────────────
print("\n── Cleanup ──")
# Delete test files from storage
for path in TEST_FILE_PATHS:
    requests.post(f"{BASE}/rest/v1/rpc/admin_delete_file",
                  headers={"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json"},
                  json={"p_path": path})
# Delete test claims (cascades to communications, info_requests, files)
for cid in TEST_CLAIM_IDS:
    sql(f"DELETE FROM claims WHERE id = '{cid}'")
# Delete test notifications
sql(f"DELETE FROM notifications WHERE claim_ref = 'P11TEST' OR message LIKE '%P11%' OR message LIKE '%Test notification%'")
# Delete test profiles
for uid in TEST_USER_IDS:
    sql(f"DELETE FROM profiles WHERE id = '{uid}'")
# Delete test auth users
for uid in TEST_USER_IDS:
    requests.delete(f"{BASE}/auth/v1/admin/users/{uid}",
                    headers={"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}"})
print("  Cleaned up test users, claims, communications, files, notifications")

# ── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"RESULTS: {PASS} PASSED, {FAIL} FAILED")
print("=" * 70)
sys.exit(1 if FAIL > 0 else 0)
