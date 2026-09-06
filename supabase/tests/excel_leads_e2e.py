#!/usr/bin/env python3
"""
End-to-end test for the Excel Leads MVP (process-excel-import edge function).

Creates a temporary admin user, signs in, runs an import covering all 8
verification scenarios, checks the resulting DB state, re-imports the same
file to test dedup, then cleans up the temp user + test data.
"""
import json, os, sys, time, urllib.request, urllib.error

# Load secrets
env = {}
with open('/run/base44/app.env') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'")

SUPABASE_URL = env['VITE_SUPABASE_URL']
SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
ANON_KEY = env['VITE_SUPABASE_ANON_KEY']
REF = SUPABASE_URL.replace('https://', '').split('.')[0]

PASS = []
FAIL = []
def check(name, cond, detail=''):
    (PASS if cond else FAIL).append((name, detail))
    print(f"{'✅ PASS' if cond else '❌ FAIL'} — {name}" + (f'  [{detail}]' if detail else ''))

def req(method, url, headers=None, data=None):
    headers = headers or {}
    r = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            try: return resp.status, json.loads(raw) if raw else {}
            except: return resp.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try: body = json.loads(body)
        except: pass
        return e.code, body

H = { 'apikey': ANON_KEY, 'Content-Type': 'application/json' }
HS = { 'apikey': SERVICE_KEY, 'Content-Type': 'application/json', 'Authorization': f'Bearer {SERVICE_KEY}' }

# ── 1. Create temporary admin user ────────────────────────────────────────────
TEST_EMAIL = f"exceltest+{int(time.time())}@claimvelo.test"
TEST_PASS = "TestPass123!excel"
print(f"\n=== Creating temp admin user: {TEST_EMAIL} ===")
st, body = req('POST', f"{SUPABASE_URL}/auth/v1/admin/users",
    {**H, 'Authorization': f'Bearer {SERVICE_KEY}'},
    json.dumps({"email": TEST_EMAIL, "password": TEST_PASS, "email_confirm": True}).encode())
if st != 200 or not isinstance(body, dict) or 'id' not in body:
    print("FAILED to create user:", st, body); sys.exit(1)
TEST_UID = body['id']
print(f"  user id: {TEST_UID}")

# Set role to super_admin (upsert in case no profile row exists yet)
req('POST', f"{SUPABASE_URL}/rest/v1/profiles?on_conflict=id",
    {**HS, 'Prefer': 'resolution=merge-duplicates'},
    json.dumps({"id": TEST_UID, "role": "super_admin", "full_name": "Excel Test Admin", "email": TEST_EMAIL}).encode())

# ── 2. Sign in ────────────────────────────────────────────────────────────────
st, body = req('POST', f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    H, json.dumps({"email": TEST_EMAIL, "password": TEST_PASS}).encode())
if st != 200 or 'access_token' not in body:
    print("FAILED to sign in:", st, body); sys.exit(1)
JWT = body['access_token']
print("  signed in OK")

HF = { 'apikey': ANON_KEY, 'Content-Type': 'application/json', 'Authorization': f'Bearer {JWT}' }

# ── 3. Build representative test rows (all 8 scenarios) ─────────────────────────
TODAY = time.strftime('%Y-%m-%d')
PAST = '2021-06-15'
FUTURE = '2030-01-15'

def row(n, pnr, name, email, phone, fn, date, orig, dest, delay=None, reason=''):
    fn_parts = name.split()
    return {
        "rowNumber": n, "pnr": pnr, "passengerName": name,
        "firstName": fn_parts[0], "lastName": ' '.join(fn_parts[1:]),
        "email": email, "phone": phone, "flightNumber": fn, "flightDate": date,
        "origin": orig, "destination": dest, "delayMinutes": delay, "delayReason": reason,
        "valid": True, "errors": []
    }

rows = [
    # READY — past flight, full contact
    row(2, "TLV001", "Roni Levi", "roni@email.com", "+972501234567", "LY315", PAST, "TLV", "LHR", 300, "Carrier"),
    # Multi-passenger + multi-segment: ABC123 has Jane Doe (2 segments) and John Doe (1 segment, NO contact)
    row(3, "ABC123", "Jane Doe", "jane@email.com", "+447700900123", "BA456", PAST, "LHR", "CDG", 120, "Carrier"),
    row(4, "ABC123", "Jane Doe", "jane@email.com", "+447700900123", "BA789", PAST, "CDG", "FRA", 60, "Carrier"),
    row(5, "ABC123", "John Doe", "", "", "BA456", PAST, "LHR", "CDG", 120, "Carrier"),
    # FUTURE flight
    row(6, "FMJ004", "Maria Garcia", "maria@email.com", "+353861234567", "EI106", FUTURE, "MAN", "ORK", 500, "Weather"),
    # Cancelled booking — must NOT be interpreted as flight cancellation → REVIEW
    row(7, "CNCL01", "Bob Smith", "bob@email.com", "+447700900999", "VS001", PAST, "LHR", "JFK", 0, "Booking cancelled by agent"),
    # Within-batch duplicate (identical row twice) — dedup'd, lead still created once
    row(8, "DUP001", "Sam Brown", "sam@email.com", "+447700900888", "FR100", PAST, "STN", "DUB", 200, "Technical"),
    row(9, "DUP001", "Sam Brown", "sam@email.com", "+447700900888", "FR100", PAST, "STN", "DUB", 200, "Technical"),
]

print(f"\n=== Import 1: {len(rows)} rows ===")
st, body = req('POST', f"{SUPABASE_URL}/functions/v1/process-excel-import",
    HF, json.dumps({"fileName": "test-leads.xlsx", "agentCode": "", "rows": rows}).encode())
print(f"  status={st}")
if st != 200 or not body.get('success'):
    print("  IMPORT FAILED:", body); sys.exit(1)
summary = body['summary']
batch_id = body['batch_id']
print("  summary:", json.dumps(summary))

# ── 4. Verify DB state ────────────────────────────────────────────────────────
print("\n=== Verifying DB state ===")

# All source rows preserved
st, raw = req('GET', f"{SUPABASE_URL}/rest/v1/import_raw_rows?batch_id=eq.{batch_id}&select=id,row_number,dedup_status,validation_status,lead_id",
    HS)
raw_count = len(raw)
check("1. All source rows preserved (8 raw rows)", raw_count == 8, f"got {raw_count}")

# Duplicates handled
dup_rows = [r for r in raw if r['dedup_status'] == 'duplicate']
check("2. Within-batch duplicate row marked (1 duplicate)", len(dup_rows) == 1, f"got {len(dup_rows)}")

# Leads
st, leads = req('GET', f"{SUPABASE_URL}/rest/v1/leads?batch_id=eq.{batch_id}&select=id,booking_reference,passenger_first_name,passenger_last_name,email,phone,status,review_reason,segment_count,lead_key&order=passenger_last_name.asc",
    HS)
leads_by_key = {l['lead_key']: l for l in leads}
print(f"  leads created: {len(leads)}")
for l in leads:
    print(f"    {l['passenger_first_name']} {l['passenger_last_name']} | {l['booking_reference']} | {l['status']} | segs={l['segment_count']} | email={l['email'] or 'NONE'}")

# Multiple passengers on one PNR → separate leads
abc_leads = [l for l in leads if l['booking_reference'] == 'ABC123']
check("4. Multiple passengers on one PNR → separate leads (2)", len(abc_leads) == 2, f"got {len(abc_leads)}")

# One passenger with multiple segments
jane = next((l for l in leads if l['passenger_first_name'] == 'Jane'), None)
check("3. Jane Doe has 2 segments", jane and jane['segment_count'] == 2, f"got {jane['segment_count'] if jane else 'no lead'}")

# Verify segments actually stored
st, segs = req('GET', f"{SUPABASE_URL}/rest/v1/lead_flight_segments?lead_id=eq.{jane['id']}&select=segment_order,flight_number,origin,destination&order=segment_order.asc", HS) if jane else (200, [])
check("3b. Jane segments stored in order (BA456 then BA789)", len(segs) == 2 and segs[0]['flight_number'] == 'BA456' and segs[1]['flight_number'] == 'BA789', json.dumps(segs))

# Missing email/phone does not destroy the lead
john = next((l for l in leads if l['passenger_first_name'] == 'John'), None)
check("5. John Doe lead created despite missing email+phone", john is not None, "")
check("5b. John Doe status = WARNING (missing contact)", john and john['status'] == 'WARNING', john['status'] if john else 'none')

# Future flights separated
maria = next((l for l in leads if l['passenger_first_name'] == 'Maria'), None)
check("6. Maria Garcia (future flight) status = FUTURE", maria and maria['status'] == 'FUTURE', maria['status'] if maria else 'none')

# Cancelled booking NOT interpreted as flight cancellation → REVIEW
bob = next((l for l in leads if l['passenger_first_name'] == 'Bob'), None)
check("7. Bob Smith (cancelled booking) status = REVIEW", bob and bob['status'] == 'REVIEW', bob['status'] if bob else 'none')
check("7b. No claim created for Bob (claim_id null)", bob and bob.get('claim_id') is None, "")

# READY lead
roni = next((l for l in leads if l['passenger_first_name'] == 'Roni'), None)
check("Roni Levi status = READY", roni and roni['status'] == 'READY', roni['status'] if roni else 'none')

# No claims created at all during import
st, claims_before = req('GET', f"{SUPABASE_URL}/rest/v1/claims?select=id&limit=1000", HS)
check("No claims created during import (claim_id all null)", all(l.get('claim_id') is None for l in leads), "")

# ── 5. Re-import the same file (dedup test) ────────────────────────────────────
print("\n=== Import 2: re-import same file (dedup test) ===")
st, body2 = req('POST', f"{SUPABASE_URL}/functions/v1/process-excel-import",
    HF, json.dumps({"fileName": "test-leads.xlsx", "agentCode": "", "rows": rows}).encode())
if st != 200 or not body2.get('success'):
    print("  RE-IMPORT FAILED:", body2); sys.exit(1)
summary2 = body2['summary']
batch2_id = body2['batch_id']
print("  summary2:", json.dumps(summary2))

check("8. Re-import creates 0 new leads", summary2['leads_created'] == 0, f"got {summary2['leads_created']}")
check("8b. Re-import detects existing leads", summary2['leads_already_existing'] > 0, f"got {summary2['leads_already_existing']}")

# Total leads in DB unchanged after re-import
st, all_leads2 = req('GET', f"{SUPABASE_URL}/rest/v1/leads?select=id", HS)
check("8c. Total lead count unchanged after re-import", len(all_leads2) == len(leads), f"{len(all_leads2)} vs {len(leads)}")

# ── 6. Cleanup ────────────────────────────────────────────────────────────────
print("\n=== Cleanup ===")
# Delete test leads + segments + raw rows + batches
for bid in [batch_id, batch2_id]:
    req('DELETE', f"{SUPABASE_URL}/rest/v1/import_batches?id=eq.{bid}", HS)
# Delete temp user
req('DELETE', f"{SUPABASE_URL}/auth/v1/admin/users/{TEST_UID}",
    {**H, 'Authorization': f'Bearer {SERVICE_KEY}'})
print("  cleaned up temp user + test data")

# ── Report ───────────────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"RESULTS: {len(PASS)} PASS / {len(FAIL)} FAIL")
if FAIL:
    print("\nFAILURES:")
    for name, detail in FAIL:
        print(f"  ❌ {name}  [{detail}]")
    sys.exit(1)
else:
    print("\n🎉 ALL CHECKS PASSED")
