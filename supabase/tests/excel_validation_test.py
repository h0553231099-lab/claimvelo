#!/usr/bin/env python3
"""
Focused validation tests for the two confirmed Excel Leads import gaps:
1. Airport + flight-number validation (unknown IATA / malformed flight → REVIEW)
2. Booking_Status = CANCELLED → REVIEW (not flight cancellation)

Does NOT rerun 300 historical provider lookups.
Does NOT create claims, contact customers, or touch commissions.
"""

import json, os, sys, time, urllib.request, urllib.error
from collections import defaultdict

TODAY_STR = "2026-09-06"

def load_env():
    env = {}
    with open('/run/base44/app.env') as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k] = v.strip().strip('"').strip("'")
    return env

def http_req(method, url, headers=None, data=None, timeout=60):
    headers = headers or {}
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            body = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            pass
        return e.code, body

def make_row(row_num, pnr, first, last, email, phone, fn, date, origin, dest,
             booking_status="", valid=True, errors=None):
    return {
        "rowNumber": row_num,
        "pnr": pnr,
        "passengerName": f"{first} {last}",
        "firstName": first,
        "lastName": last,
        "email": email,
        "phone": phone,
        "flightNumber": fn,
        "flightDate": date,
        "origin": origin,
        "destination": dest,
        "delayMinutes": None,
        "delayReason": "",
        "bookingStatus": booking_status,
        "valid": valid,
        "errors": errors or [],
    }

def create_temp_admin(env):
    url = env['VITE_SUPABASE_URL']
    service_key = env['SUPABASE_SERVICE_ROLE_KEY']
    anon_key = env['VITE_SUPABASE_ANON_KEY']
    test_email = f"valtest+{int(time.time())}@claimvelo.test"
    test_pass = "TestPass123!val"
    H = {'apikey': anon_key, 'Content-Type': 'application/json'}
    HS = {'apikey': service_key, 'Content-Type': 'application/json',
          'Authorization': f'Bearer {service_key}'}
    st, body = http_req('POST', f"{url}/auth/v1/admin/users",
                        {**H, 'Authorization': f'Bearer {service_key}'},
                        json.dumps({"email": test_email, "password": test_pass,
                                    "email_confirm": True}).encode())
    if st != 200 or 'id' not in body:
        raise RuntimeError(f"Failed to create temp user: {st} {body}")
    uid = body['id']
    http_req('POST', f"{url}/rest/v1/profiles?on_conflict=id",
             {**HS, 'Prefer': 'resolution=merge-duplicates'},
             json.dumps({"id": uid, "role": "super_admin",
                         "full_name": "Validation Test Admin",
                         "email": test_email}).encode())
    st, body = http_req('POST', f"{url}/auth/v1/token?grant_type=password",
                       H, json.dumps({"email": test_email, "password": test_pass}).encode())
    if st != 200 or 'access_token' not in body:
        raise RuntimeError(f"Failed to sign in: {st} {body}")
    return uid, body['access_token'], test_email

def delete_temp_admin(env, uid):
    url = env['VITE_SUPABASE_URL']
    service_key = env['SUPABASE_SERVICE_ROLE_KEY']
    anon_key = env['VITE_SUPABASE_ANON_KEY']
    http_req('DELETE', f"{url}/auth/v1/admin/users/{uid}",
             {'apikey': anon_key, 'Authorization': f'Bearer {service_key}'})

def main():
    print("=== Excel Leads Validation Focused Tests ===")
    env = load_env()
    url = env['VITE_SUPABASE_URL']
    service_key = env['SUPABASE_SERVICE_ROLE_KEY']
    anon_key = env['VITE_SUPABASE_ANON_KEY']
    HS = {'apikey': service_key, 'Content-Type': 'application/json',
          'Authorization': f'Bearer {service_key}'}

    # ── Build test rows ──────────────────────────────────────────────────────
    # All dates are in the past so they don't get FUTURE status
    PAST_DATE = "2025-06-15"
    E = "test@claimvelo.test"
    P = "+1234567890"

    rows = [
        # 1. Valid IATA + valid flight → READY
        make_row(2, "VAL001", "Valid", "Passenger", E, P, "AA1234", PAST_DATE, "LHR", "CDG"),
        # 2. Unknown airport XXX → REVIEW
        make_row(3, "VAL002", "Bad", "Airport1", E, P, "AA1234", PAST_DATE, "XXX", "CDG"),
        # 3. Unknown airport ZZZ → REVIEW
        make_row(4, "VAL003", "Bad", "Airport2", E, P, "AA1234", PAST_DATE, "LHR", "ZZZ"),
        # 4. Malformed flight (no digits) → REVIEW
        make_row(5, "VAL004", "Bad", "Flight1", E, P, "ABCDEF", PAST_DATE, "LHR", "CDG"),
        # 5. Malformed flight (special chars) → REVIEW
        make_row(6, "VAL005", "Bad", "Flight2", E, P, "XX 12?", PAST_DATE, "LHR", "CDG"),
        # 6. Malformed flight (no letters) → REVIEW
        make_row(7, "VAL006", "Bad", "Flight3", E, P, "1234", PAST_DATE, "LHR", "CDG"),
        # 7. Valid codeshare (operating flight number, valid format) → READY
        make_row(8, "VAL007", "Code", "Share", E, P, "LY79", PAST_DATE, "CDG", "JFK"),
        # 8. Booking_Status CANCELLED → REVIEW
        make_row(9, "VAL008", "Cancelled", "Booking", E, P, "AA1234", PAST_DATE,
                 "LHR", "CDG", booking_status="CANCELLED"),
        # 9. Booking_Status CONFIRMED → not REVIEW (READY)
        make_row(10, "VAL009", "Confirmed", "Booking", E, P, "AA1234", PAST_DATE,
                 "LHR", "CDG", booking_status="CONFIRMED"),
        # 10. Missing email → WARNING (not REVIEW)
        make_row(11, "VAL010", "No", "Email", "", P, "AA1234", PAST_DATE, "LHR", "CDG"),
        # 11. Unknown airport + missing email → REVIEW (airport takes priority)
        make_row(12, "VAL011", "Both", "Issues", "", P, "AA1234", PAST_DATE, "XXX", "CDG"),
        # 12. Malformed flight + valid airport → REVIEW (flight number)
        make_row(13, "VAL012", "Flight", "Issue", E, P, "UA-ABC", PAST_DATE, "AMS", "FRA"),
    ]

    print(f"Test rows: {len(rows)}")

    uid = None
    batch_id = None
    passed = 0
    failed = 0
    results = []

    try:
        # ── Create temp admin ───────────────────────────────────────────────
        uid, jwt, test_email = create_temp_admin(env)
        print(f"Temp admin: {uid}")

        # ── Import via edge function ────────────────────────────────────────
        HF = {'apikey': anon_key, 'Content-Type': 'application/json',
              'Authorization': f'Bearer {jwt}'}
        st, body = http_req('POST', f"{url}/functions/v1/process-excel-import",
                            HF, json.dumps({"fileName": "validation_test.xlsx",
                                            "agentCode": "", "rows": rows}).encode(),
                            timeout=120)
        if st != 200 or not body.get('success'):
            print(f"IMPORT FAILED: {st} {body}")
            return
        batch_id = body['batch_id']
        summary = body['summary']
        print(f"Import: batch={batch_id}, summary={json.dumps(summary)}")

        # ── Read back leads ──────────────────────────────────────────────────
        st, leads = http_req('GET',
                             f"{url}/rest/v1/leads?batch_id=eq.{batch_id}"
                             "&select=id,booking_reference,passenger_first_name,passenger_last_name,"
                             "status,review_reason,segment_count,route,lead_key&order=created_at.asc", HS)
        if not isinstance(leads, list):
            leads = []
        lead_by_pnr = {l['booking_reference']: l for l in leads}
        print(f"Leads created: {len(leads)}")

        # ── Read back raw rows ───────────────────────────────────────────────
        st, raw_rows = http_req('GET',
                                f"{url}/rest/v1/import_raw_rows?batch_id=eq.{batch_id}"
                                "&select=row_number,validation_status,dedup_status,lead_id&order=row_number.asc", HS)
        if not isinstance(raw_rows, list):
            raw_rows = []
        print(f"Raw rows stored: {len(raw_rows)}")

        # ── Check no claims created ─────────────────────────────────────────
        st, claims_check = http_req('GET',
                                    f"{url}/rest/v1/claims?batch_id=eq.{batch_id}&select=id&limit=1", HS)
        claims_count = len(claims_check) if isinstance(claims_check, list) else 0

        # ── Run assertions ───────────────────────────────────────────────────
        def check(name, condition, detail=""):
            nonlocal passed, failed
            status = "PASS" if condition else "FAIL"
            if condition:
                passed += 1
            else:
                failed += 1
            results.append((name, condition, detail))
            print(f"  {status}  {name}" + (f" — {detail}" if detail and not condition else ""))

        print("\n--- TEST RESULTS ---")

        # 1. Valid IATA airport → accepted normally (READY)
        l = lead_by_pnr.get("VAL001")
        check("Valid IATA airport → accepted (READY)",
              l is not None and l['status'] == 'READY',
              f"status={l['status'] if l else 'MISSING'}")

        # 2. Unknown/fake airport XXX → REVIEW
        l = lead_by_pnr.get("VAL002")
        check("Unknown airport XXX → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")
        if l and l['status'] == 'REVIEW':
            check("  REVIEW reason mentions unknown airport",
                  'Unknown airport' in (l.get('review_reason') or ''),
                  f"reason={l.get('review_reason','')}")

        # 3. Unknown/fake airport ZZZ → REVIEW
        l = lead_by_pnr.get("VAL003")
        check("Unknown airport ZZZ → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}")

        # 4. Valid flight number → accepted
        l = lead_by_pnr.get("VAL001")
        check("Valid flight number AA1234 → accepted",
              l is not None and l['status'] != 'REVIEW' or
              (l is not None and 'Malformed' not in (l.get('review_reason') or '')),
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")

        # 5. Malformed flight number (no digits) → REVIEW
        l = lead_by_pnr.get("VAL004")
        check("Malformed flight ABCDEF (no digits) → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")
        if l and l['status'] == 'REVIEW':
            check("  REVIEW reason mentions malformed flight",
                  'Malformed' in (l.get('review_reason') or ''),
                  f"reason={l.get('review_reason','')}")

        # 6. Malformed flight number (special chars) → REVIEW
        l = lead_by_pnr.get("VAL005")
        check("Malformed flight 'XX 12?' (special chars) → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}")

        # 7. Malformed flight number (no letters) → REVIEW
        l = lead_by_pnr.get("VAL006")
        check("Malformed flight '1234' (no letters) → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}")

        # 8. Valid codeshare → not incorrectly rejected
        l = lead_by_pnr.get("VAL007")
        check("Valid codeshare LY79 (CDG→JFK) → not rejected",
              l is not None and l['status'] == 'READY',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")

        # 9. Booking_Status CANCELLED → REVIEW
        l = lead_by_pnr.get("VAL008")
        check("Booking_Status CANCELLED → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")
        if l and l['status'] == 'REVIEW':
            check("  REVIEW reason contains SOURCE_BOOKING_CANCELLED",
                  'SOURCE_BOOKING_CANCELLED' in (l.get('review_reason') or ''),
                  f"reason={l.get('review_reason','')}")

        # 10. Booking_Status CANCELLED does NOT set flight cancellation
        if l and l.get('review_reason'):
            check("  CANCELLED booking NOT interpreted as flight cancellation",
                  'not interpreted as flight cancellation' in l['review_reason'],
                  f"reason={l['review_reason']}")

        # 11. Booking_Status CONFIRMED → not REVIEW (READY)
        l = lead_by_pnr.get("VAL009")
        check("Booking_Status CONFIRMED → READY (not REVIEW)",
              l is not None and l['status'] == 'READY',
              f"status={l['status'] if l else 'MISSING'}")

        # 12. Missing email → WARNING (not REVIEW)
        l = lead_by_pnr.get("VAL010")
        check("Missing email → WARNING (not REVIEW)",
              l is not None and l['status'] == 'WARNING',
              f"status={l['status'] if l else 'MISSING'}")

        # 13. Unknown airport + missing email → REVIEW (airport priority)
        l = lead_by_pnr.get("VAL011")
        check("Unknown airport + missing email → REVIEW (airport takes priority)",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")
        if l and l['status'] == 'REVIEW':
            check("  REVIEW reason is about airport (not missing email)",
                  'Unknown airport' in (l.get('review_reason') or ''),
                  f"reason={l.get('review_reason','')}")

        # 14. Malformed flight + valid airport → REVIEW (flight number)
        l = lead_by_pnr.get("VAL012")
        check("Malformed flight UA-ABC + valid airport → REVIEW",
              l is not None and l['status'] == 'REVIEW',
              f"status={l['status'] if l else 'MISSING'}, reason={l.get('review_reason','') if l else ''}")
        if l and l['status'] == 'REVIEW':
            check("  REVIEW reason mentions malformed flight",
                  'Malformed' in (l.get('review_reason') or ''),
                  f"reason={l.get('review_reason','')}")

        # 15. Raw source rows preserved in every case
        check("All raw source rows preserved",
              len(raw_rows) == len(rows),
              f"expected {len(rows)}, got {len(raw_rows)}")

        # 16. No claims created
        check("No claims created",
              claims_count == 0,
              f"found {claims_count} claims")

        # 17. Lead count matches (12 unique rows → 12 leads)
        check("Lead count correct (12 leads from 12 unique rows)",
              len(leads) == 12,
              f"expected 12, got {len(leads)}")

        # ── Summary ─────────────────────────────────────────────────────────
        print(f"\n--- PASS/FAIL SUMMARY ---")
        print(f"  {passed} PASS / {failed} FAIL")
        if failed == 0:
            print("  VERDICT: PASS — all validation tests passed.")
        else:
            print("  VERDICT: FAIL — see failures above.")
            print("\n  Failed tests:")
            for name, ok, detail in results:
                if not ok:
                    print(f"    ✗ {name}: {detail}")

    finally:
        # ── Cleanup ─────────────────────────────────────────────────────────
        print("\n=== Cleanup ===")
        if batch_id:
            st, _ = http_req('DELETE', f"{url}/rest/v1/import_batches?id=eq.{batch_id}", HS)
            print(f"  Deleted batch {batch_id}: {st == 204}")
        if uid:
            delete_temp_admin(env, uid)
            print(f"  Deleted temp admin {uid}")
        print("Test complete. Test data cleaned up.")


if __name__ == '__main__':
    main()
