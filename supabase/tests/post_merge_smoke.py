#!/usr/bin/env python3
"""
Phase 11B — Post-Merge Smoke Test
Verifies main + live Supabase + deployed edge functions are synchronized.
"""
import json, sys, subprocess, uuid, time

env = {}
with open("/run/base44/app.env") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["VITE_SUPABASE_URL"]
SR_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY = env["VITE_SUPABASE_ANON_KEY"]
ACCESS_TOKEN = env["SUPABASE_ACCESS_TOKEN"]
PROJECT_REF = BASE.replace("https://", "").replace(".supabase.co", "")

PASS = 0; FAIL = 0
test_user_ids = []; test_claim_refs = []

def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  ✅ PASS: {name}")
    else: FAIL += 1; print(f"  ❌ FAIL: {name} — {detail}")

def sh_curl(cmd):
    r = subprocess.run(f"curl -s {cmd}", shell=True, capture_output=True, text=True, timeout=30)
    try: return json.loads(r.stdout)
    except: return {"_raw": r.stdout[:300]}

def edge(path, token, body):
    body_json = json.dumps(body).replace("'", "'\\''")
    return sh_curl(f'''-X POST "{BASE}/functions/v1/{path}" -H "Content-Type: application/json" -H "Authorization: Bearer {token}" -d '{body_json}' ''')

def rest_post(path, body):
    return sh_curl(f'''-X POST "{BASE}/rest/v1/{path}" -H "apikey: {SR_KEY}" -H "Authorization: Bearer {SR_KEY}" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{json.dumps(body).replace("'", "'\\''")}' ''')

def sql(query):
    body = json.dumps({"query": query}).replace("'", "'\\''")
    return sh_curl(f'''-X POST "https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query" -H "Authorization: Bearer {ACCESS_TOKEN}" -H "Content-Type: application/json" -d '{body}' ''')

def create_user(email, password, role):
    body = json.dumps({"email": email, "password": password, "email_confirm": True}).replace("'", "'\\''")
    r = sh_curl(f'''-X POST "{BASE}/auth/v1/admin/users" -H "apikey: {SR_KEY}" -H "Authorization: Bearer {SR_KEY}" -H "Content-Type: application/json" -d '{body}' ''')
    uid = r.get("id") if isinstance(r, dict) else None
    if uid:
        test_user_ids.append(uid)
        sql(f"INSERT INTO profiles (id, role, full_name, email) VALUES ('{uid}', '{role}', 'Smoke Test', '{email}') ON CONFLICT (id) DO UPDATE SET role='{role}', email='{email}'")
    return uid

def sign_in(email, password):
    body = json.dumps({"email": email, "password": password}).replace("'", "'\\''")
    r = sh_curl(f'''-X POST "{BASE}/auth/v1/token?grant_type=password" -H "apikey: {ANON_KEY}" -H "Content-Type: application/json" -d '{body}' ''')
    return r.get("access_token") if isinstance(r, dict) else None

print("=" * 70)
print("POST-MERGE SMOKE TEST — main ↔ live Supabase ↔ edge functions")
print("=" * 70)

# Clean up any leftover data
sql("DELETE FROM claims WHERE claim_ref LIKE 'SMOKE%'")
sql("DELETE FROM unmatched_customer_emails WHERE from_address = 'smoke-test@test.com'")

pwd = "Test1234!Secure"
test_email = f"smoke-{uuid.uuid4().hex[:6]}@test-claimvelo.com"
admin_email = f"smoke-admin-{uuid.uuid4().hex[:6]}@test-claimvelo.com"

# Setup
print("\n── Setup ──")
cust_id = create_user(test_email, pwd, "customer")
admin_id = create_user(admin_email, pwd, "admin")
admin_token = sign_in(admin_email, pwd)
print(f"  Customer: {cust_id[:8] if cust_id else 'FAIL'}, Admin: {admin_id[:8] if admin_id else 'FAIL'}")

# Create claim for 30-day test (old timer)
claim_ref = f"SMOKE-{uuid.uuid4().hex[:6]}"
rest_post("claims", {
    "claim_ref": claim_ref, "email": test_email,
    "passenger_first_name": "Smoke", "passenger_last_name": "Test",
    "airline": "TestAir", "flight_number": "TA100", "flight_date": "2025-06-01",
    "departure": "LHR", "arrival": "CDG", "status": "Untouched",
    "eligibility_status": "Pending Check", "amount": "€600",
    "customer_user_id": cust_id, "last_customer_update_at": "2025-01-01T00:00:00Z"
})
test_claim_refs.append(claim_ref)
claim_row = sql(f"SELECT id FROM claims WHERE claim_ref = '{claim_ref}'")
claim_id = claim_row[0]["id"] if isinstance(claim_row, list) and claim_row else None
print(f"  Claim: {claim_id[:8] if claim_id else 'FAIL'} (ref: {claim_ref})")

# Create a SECOND claim for the 30-day test (no emails sent to it before the test)
claim_ref_30 = f"SMOKE-30-{uuid.uuid4().hex[:6]}"
rest_post("claims", {
    "claim_ref": claim_ref_30, "email": f"smoke-30-{uuid.uuid4().hex[:6]}@test-claimvelo.com",
    "passenger_first_name": "30Day", "passenger_last_name": "Test",
    "airline": "TestAir", "flight_number": "TA200", "flight_date": "2025-06-01",
    "departure": "LGW", "arrival": "CDG", "status": "Untouched",
    "eligibility_status": "Pending Check", "amount": "€600",
    "last_customer_update_at": "2025-01-01T00:00:00Z"
})
test_claim_refs.append(claim_ref_30)

# ── 1. 30-day update (run FIRST before any emails reset the timer) ──────────
print("\n── 1. 30-day update ──")
r = edge("send-30-day-updates", SR_KEY, {})
print(f"  Response: {r}")
check("30-day update sent ≥1 email", isinstance(r, dict) and r.get("sent", 0) >= 1,
      f"sent={r.get('sent') if isinstance(r, dict) else 'err'}")

claim30_row = sql(f"SELECT id, last_customer_update_at FROM claims WHERE claim_ref = '{claim_ref_30}'")
claim30_id = claim30_row[0]["id"] if isinstance(claim30_row, list) and claim30_row else None
timer_val = claim30_row[0]["last_customer_update_at"] if isinstance(claim30_row, list) and claim30_row else None
check("30-day timer reset", timer_val and "2025-01-01" not in str(timer_val), f"timer={timer_val}")

# ── 2. Real customer email ──────────────────────────────────────────────────
print("\n── 2. Real customer email (staff → customer) ──")
r = edge("send-customer-email", admin_token, {
    "claim_id": claim_id, "subject": "Smoke test email", "body": "Post-merge smoke test."
})
check("Customer email sent via Resend", isinstance(r, dict) and r.get("ok") == True, f"resp={r}")

time.sleep(1)
comm = sql(f"SELECT count(*) as c FROM claim_communications WHERE claim_id = '{claim_id}' AND direction = 'outbound'")
check("Communication logged", isinstance(comm, list) and comm and comm[0]["c"] >= 1, f"count={comm}")

# ── 3. Unmatched reply queue ─────────────────────────────────────────────────
print("\n── 3. Unmatched reply queue ──")
test_msg_id = f"smoke-{uuid.uuid4().hex[:8]}"
sql(f"""INSERT INTO unmatched_customer_emails (gmail_message_id, from_address, from_name, to_address, subject, body, match_status, candidate_claim_refs, candidate_claim_ids, attachment_count, attachment_filenames, attachment_storage_paths)
VALUES ('{test_msg_id}', 'smoke-test@test.com', 'Smoke Customer', 'support@claimvelo.com', 'Re: My claim', 'Smoke test body', 'unmatched', '{{}}', '{{}}', 0, '[]', '{{}}')""")
unmatched = sql(f"SELECT from_address, subject, match_status FROM unmatched_customer_emails WHERE gmail_message_id = '{test_msg_id}'")
check("Unmatched email stored in queue", isinstance(unmatched, list) and len(unmatched) >= 1, f"result={unmatched}")

# ── 4. No dev-mode success path ───────────────────────────────────────────────
print("\n── 4. No dev-mode success path ──")
r = edge("send-staff-email", admin_token, {
    "to": test_email, "subject": "Dev-mode check", "body": "Testing.",
    "fromName": "Admin", "fromAddress": "support@claimvelo.com"
})
check("send-staff-email returns real Resend ID (not 'dev-mode')",
      isinstance(r, dict) and r.get("id") != "dev-mode", f"resp={r}")

# ── 5. Test data clean ───────────────────────────────────────────────────────
print("\n── 5. Cleanup ──")
sql(f"DELETE FROM unmatched_customer_emails WHERE gmail_message_id = '{test_msg_id}'")
for ref in test_claim_refs:
    sql(f"DELETE FROM claims WHERE claim_ref = '{ref}'")
for uid in test_user_ids:
    sql(f"DELETE FROM profiles WHERE id = '{uid}'")
    sh_curl(f'''-X DELETE "{BASE}/auth/v1/admin/users/{uid}" -H "apikey: {SR_KEY}" -H "Authorization: Bearer {SR_KEY}" ''')
sql("DELETE FROM claims WHERE claim_ref LIKE 'SMOKE%'")

remaining = sql("SELECT count(*) as c FROM claims WHERE claim_ref LIKE 'SMOKE%'")
check("All test data cleaned (0 remaining)", isinstance(remaining, list) and remaining and remaining[0]["c"] == 0,
      f"remaining={remaining}")

print("\n" + "=" * 70)
print(f"SMOKE TEST: {PASS} PASSED, {FAIL} FAILED")
print("=" * 70)
sys.exit(1 if FAIL > 0 else 0)
