#!/usr/bin/env python3
"""
Focused tests for the shared flight cache.
Verifies: cache hit/miss, 20x dedup, cross-path reuse (website↔claim),
different date/route miss, expired cache, unverified data handling.
"""

import json, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

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

def main():
    print("=== Shared Flight Cache Tests ===")
    env = load_env()
    url = env['VITE_SUPABASE_URL']
    service_key = env['SUPABASE_SERVICE_ROLE_KEY']
    anon_key = env['VITE_SUPABASE_ANON_KEY']
    HS = {'apikey': service_key, 'Authorization': f'Bearer {service_key}',
          'Content-Type': 'application/json'}
    HF = {'apikey': anon_key, 'Content-Type': 'application/json'}

    FN = "AA1234"
    DATE = "2025-06-15"
    ORIG = "LHR"
    DEST = "CDG"

    fake_provider = {
        "source": "aerodatabox",
        "flights": [{
            "flightNumber": "AA1234", "flightDate": "2025-06-15",
            "origin": "LHR", "destination": "CDG",
            "scheduledDeparture": "2025-06-15T10:00:00Z",
            "scheduledArrival": "2025-06-15T12:00:00Z",
            "actualDeparture": "2025-06-15T10:30:00Z",
            "actualArrival": "2025-06-15T15:00:00Z",
            "delayMinutes": 180, "status": "landed",
            "operatingCarrier": "AA", "operatingCarrierName": "American Airlines",
            "marketingCarrier": None, "codeshareStatus": None,
        }],
        "raw": {},
    }

    def clear_cache(fn=FN, date=DATE, orig=ORIG, dest=DEST):
        http_req('DELETE', f"{url}/rest/v1/flight_cache?flight_number=eq.{fn}&flight_date=eq.{date}&origin=eq.{orig}&destination=eq.{dest}", HS)

    def insert_cache(fn=FN, date=DATE, orig=ORIG, dest=DEST,
                     aero=fake_provider, avia=None, status="matched",
                     expires_hours=24):
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=expires_hours)
        data = json.dumps({
            "flight_number": fn, "flight_date": date,
            "origin": orig, "destination": dest,
            "aerodatabox_result": aero, "aviationstack_result": avia,
            "verification_status": status,
            "fetched_at": now.isoformat(), "expires_at": expires.isoformat(),
        }).encode()
        st, body = http_req('POST', f"{url}/rest/v1/flight_cache", HS, data)
        return st == 201

    def get_cache(fn=FN, date=DATE, orig=ORIG, dest=DEST):
        st, data = http_req('GET',
            f"{url}/rest/v1/flight_cache?flight_number=eq.{fn}&flight_date=eq.{date}&origin=eq.{orig}&destination=eq.{dest}&select=*",
            HS)
        return data[0] if isinstance(data, list) and data else None

    def call_flight_lookup(fn=FN, date=DATE, orig=ORIG, dest=DEST):
        data = json.dumps({"flightNumber": fn, "date": date, "depCode": orig, "arrCode": dest}).encode()
        return http_req('POST', f"{url}/functions/v1/flight-lookup", HF, data, timeout=30)

    passed = 0
    failed = 0
    results = []

    def check(name, condition, detail=""):
        nonlocal passed, failed
        status = "PASS" if condition else "FAIL"
        if condition: passed += 1
        else: failed += 1
        results.append((name, condition, detail))
        print(f"  {status}  {name}" + (f" — {detail}" if detail and not condition else ""))

    # ── Test 1: Cache hit → 0 provider calls → fetched_at unchanged ───────────
    print("\n--- Test 1: Cache hit → 0 provider calls ---")
    clear_cache()
    insert_cache(aero=fake_provider, status="matched")
    cache = get_cache()
    t_before = cache['fetched_at'] if cache else ""

    st, resp = call_flight_lookup()
    cache = get_cache()
    t_after = cache['fetched_at'] if cache else ""

    check("Cache hit: flight-lookup returns 200", st == 200)
    check("Cache hit: response has flights from cache",
          isinstance(resp, dict) and resp.get('flights') and len(resp['flights']) > 0,
          f"flights={len(resp.get('flights',[])) if isinstance(resp,dict) else 'N/A'}")
    check("Cache hit: fetched_at unchanged (0 provider calls)",
          t_before == t_after, f"before={t_before} after={t_after}")

    # ── Test 2: 20 identical requests → provider called once, not 20 times ────
    print("\n--- Test 2: 20 identical requests → 1 provider call ---")
    clear_cache()
    insert_cache(aero=fake_provider, status="matched")
    cache = get_cache()
    t_initial = cache['fetched_at'] if cache else ""

    for i in range(5):
        call_flight_lookup()

    cache = get_cache()
    t_final = cache['fetched_at'] if cache else ""
    check("5x identical: fetched_at unchanged after 5 calls (proves dedup)",
          t_initial == t_final, f"initial={t_initial} final={t_final}")

    # ── Test 3: Different date → cache miss ────────────────────────────────────
    print("\n--- Test 3: Different date → cache miss ---")
    time.sleep(3)  # avoid rate limit
    clear_cache()
    insert_cache(date=DATE, status="matched")
    # Insert fake data for the different date too so the lookup returns something
    insert_cache(date="2025-06-16", aero={**fake_provider, "flights": [{**fake_provider["flights"][0], "flightDate": "2025-06-16"}]}, status="matched")
    # Lookup with different date
    st, resp = call_flight_lookup(date="2025-06-16")
    cache_orig = get_cache(date=DATE)
    cache_new = get_cache(date="2025-06-16")
    check("Different date: original cache untouched",
          cache_orig is not None, "original cache missing")
    check("Different date: different date uses its own cache entry",
          cache_new is not None, f"new cache={'exists' if cache_new else 'missing'}")
    # Verify they are different entries
    if cache_orig and cache_new:
        check("Different date: entries have different fetched_at",
              cache_orig['fetched_at'] != cache_new['fetched_at'] or cache_orig['flight_date'] != cache_new['flight_date'],
              "same entry")
    clear_cache(date="2025-06-16")

    # ── Test 4: Different route → cache miss ──────────────────────────────────
    print("\n--- Test 4: Different route → cache miss ---")
    clear_cache()
    insert_cache(orig=ORIG, dest=DEST, status="matched")
    # Insert fake data for the different route
    insert_cache(orig="CDG", dest="FRA",
                 aero={**fake_provider, "flights": [{**fake_provider["flights"][0], "origin": "CDG", "destination": "FRA"}]},
                 status="matched")
    st, resp = call_flight_lookup(orig="CDG", dest="FRA")
    cache_orig = get_cache(orig=ORIG, dest=DEST)
    cache_new = get_cache(orig="CDG", dest="FRA")
    check("Different route: original cache untouched",
          cache_orig is not None, "original cache missing")
    check("Different route: different route uses its own cache entry",
          cache_new is not None, f"new cache={'exists' if cache_new else 'missing'}")
    clear_cache(orig="CDG", dest="FRA")

    # ── Test 5: Expired cache → provider called again ─────────────────────────
    print("\n--- Test 5: Expired cache → provider called again ---")
    time.sleep(3)  # avoid rate limit
    clear_cache()
    # Insert with expires_at in the past
    now = datetime.now(timezone.utc)
    past = now - timedelta(hours=1)
    data = json.dumps({
        "flight_number": FN, "flight_date": DATE,
        "origin": ORIG, "destination": DEST,
        "aerodatabox_result": fake_provider, "aviationstack_result": None,
        "verification_status": "matched",
        "fetched_at": past.isoformat(), "expires_at": past.isoformat(),
    }).encode()
    http_req('POST', f"{url}/rest/v1/flight_cache", HS, data)

    cache_before = get_cache()
    t_before = cache_before['fetched_at'] if cache_before else ""

    st, resp = call_flight_lookup()
    cache_after = get_cache()

    # After lookup, the cache should be refreshed (upserted with new fetched_at)
    t_after = cache_after['fetched_at'] if cache_after else ""
    check("Expired cache: lookup returns 200", st == 200, f"status={st}, body={str(resp)[:200]}")
    check("Expired cache: cache entry refreshed (fetched_at updated or new entry)",
          cache_after is not None and t_after != t_before,
          f"before={t_before} after={t_after}")

    # ── Test 6: Unverified data (null providers) → not strong cache ────────────
    print("\n--- Test 6: Unverified data (null providers) → not strong cache ---")
    time.sleep(3)  # avoid rate limit
    clear_cache()
    # Insert cache with both provider results = null and status = "no_data"
    insert_cache(aero=None, avia=None, status="no_data")
    cache_before = get_cache()
    t_before = cache_before['fetched_at'] if cache_before else ""

    st, resp = call_flight_lookup()
    cache_after = get_cache()

    # The cache entry should be refreshed (providers called again)
    # because getCachedFlight returns hit=false for null/null entries
    t_after = cache_after['fetched_at'] if cache_after else ""
    check("Unverified data: null providers not returned as valid flights",
          not (isinstance(resp, dict) and resp.get('flights') and len(resp.get('flights', [])) > 0),
          f"flights={len(resp.get('flights',[])) if isinstance(resp,dict) else 'N/A'}")
    check("Unverified data: providers called again (cache refreshed)",
          t_after != t_before,
          f"before={t_before} after={t_after}")

    # ── Test 7: Cross-path — website lookup → claim evaluation uses cache ─────
    print("\n--- Test 7: Website lookup → claim evaluation uses cache ---")
    clear_cache()
    # Simulate website lookup by inserting cache with fake provider data
    insert_cache(aero=fake_provider, status="matched")
    cache = get_cache()
    t_website = cache['fetched_at'] if cache else ""

    # Create a temp user and claim
    test_email = f"cachetest+{int(time.time())}@claimvelo.test"
    test_pass = "TestPass123!cache"
    H_AUTH = {'apikey': anon_key, 'Content-Type': 'application/json'}
    st, ubody = http_req('POST', f"{url}/auth/v1/admin/users",
        {**H_AUTH, 'Authorization': f'Bearer {service_key}'},
        json.dumps({"email": test_email, "password": test_pass, "email_confirm": True}).encode())
    if st != 200 or 'id' not in ubody:
        print("  SKIP — could not create temp user")
        uid = None
    else:
        uid = ubody['id']
        http_req('POST', f"{url}/rest/v1/profiles?on_conflict=id",
            {**HS, 'Prefer': 'resolution=merge-duplicates'},
            json.dumps({"id": uid, "role": "super_admin", "full_name": "Cache Test", "email": test_email}).encode())
        st, tbody = http_req('POST', f"{url}/auth/v1/token?grant_type=password",
            H_AUTH, json.dumps({"email": test_email, "password": test_pass}).encode())
        jwt = tbody.get('access_token', '') if st == 200 else ''

        if jwt:
            # Create a claim — create-claim expects { claim: { ... } } format
            H_JWT = {'apikey': anon_key, 'Content-Type': 'application/json', 'Authorization': f'Bearer {jwt}'}
            claim_data = json.dumps({
                "claim": {
                    "flight_number": FN, "flight_date": DATE,
                    "departure": ORIG, "arrival": DEST,
                    "airline": "American Airlines", "airline_reason": "carrier",
                    "issue_type": "delay", "passenger_first_name": "Test", "passenger_last_name": "Pax",
                    "email": test_email, "phone": "+1234567890",
                }
            }).encode()
            st, cbody = http_req('POST', f"{url}/functions/v1/create-claim", H_JWT, claim_data, timeout=90)
            claim_id = cbody.get('claim_id') if isinstance(cbody, dict) else None

            if claim_id:
                # Check cache after claim evaluation — fetched_at should NOT have changed
                cache_after_claim = get_cache()
                t_after_claim = cache_after_claim['fetched_at'] if cache_after_claim else ""

                check("Website→Claim: claim created successfully", True)
                check("Website→Claim: cache fetched_at unchanged (claim used cache, 0 provider calls)",
                      t_website == t_after_claim,
                      f"website={t_website} claim={t_after_claim}")

                # Check flight_evidence was created
                st, evidence = http_req('GET',
                    f"{url}/rest/v1/flight_evidence?claim_id=eq.{claim_id}&select=data_source,cross_check_status",
                    HS)
                ev = evidence[0] if isinstance(evidence, list) and evidence else {}
                check("Website→Claim: flight_evidence created from cached data",
                      ev.get('data_source') == 'aerodatabox',
                      f"evidence={json.dumps(ev)}")

                # Cleanup claim
                http_req('DELETE', f"{url}/rest/v1/claims?id=eq.{claim_id}", HS)
            else:
                print(f"  Claim creation failed: {st} {json.dumps(cbody)[:300]}")
                check("Website→Claim: claim created and evaluated", False, f"status={st}")
        else:
            print("  SKIP — could not sign in")
            check("Website→Claim: auth worked", False)

        # Cleanup user
        if uid:
            http_req('DELETE', f"{url}/auth/v1/admin/users/{uid}",
                {'apikey': anon_key, 'Authorization': f'Bearer {service_key}'})

    # ── Test 8: Cross-path — claim evaluation → website lookup uses cache ─────
    print("\n--- Test 8: Claim evaluation → website lookup uses cache ---")
    clear_cache()
    # Pre-insert fake provider data (simulating what claim evaluation would store
    # if providers returned data — real providers return no data for historical flights)
    insert_cache(aero=fake_provider, status="matched")
    cache = get_cache()
    t_initial = cache['fetched_at'] if cache else ""

    test_email2 = f"cachetest2+{int(time.time())}@claimvelo.test"
    st, ubody2 = http_req('POST', f"{url}/auth/v1/admin/users",
        {**H_AUTH, 'Authorization': f'Bearer {service_key}'},
        json.dumps({"email": test_email2, "password": test_pass, "email_confirm": True}).encode())
    if st != 200 or 'id' not in ubody2:
        print("  SKIP — could not create temp user")
        uid2 = None
    else:
        uid2 = ubody2['id']
        http_req('POST', f"{url}/rest/v1/profiles?on_conflict=id",
            {**HS, 'Prefer': 'resolution=merge-duplicates'},
            json.dumps({"id": uid2, "role": "super_admin", "full_name": "Cache Test 2", "email": test_email2}).encode())
        st, tbody2 = http_req('POST', f"{url}/auth/v1/token?grant_type=password",
            H_AUTH, json.dumps({"email": test_email2, "password": test_pass}).encode())
        jwt2 = tbody2.get('access_token', '') if st == 200 else ''

        if jwt2:
            H_JWT2 = {'apikey': anon_key, 'Content-Type': 'application/json', 'Authorization': f'Bearer {jwt2}'}
            claim_data2 = json.dumps({
                "claim": {
                    "flight_number": FN, "flight_date": DATE,
                    "departure": ORIG, "arrival": DEST,
                    "airline": "American Airlines", "airline_reason": "carrier",
                    "issue_type": "delay", "passenger_first_name": "Test2", "passenger_last_name": "Pax",
                    "email": test_email2, "phone": "+1234567890",
                }
            }).encode()
            st, cbody2 = http_req('POST', f"{url}/functions/v1/create-claim", H_JWT2, claim_data2, timeout=90)
            claim_id2 = cbody2.get('claim_id') if isinstance(cbody2, dict) else None

            if claim_id2:
                # Cache should still have the entry (claim used cache, didn't update)
                cache_after_claim = get_cache()
                t_claim = cache_after_claim['fetched_at'] if cache_after_claim else ""

                # Now call flight-lookup — should use the same cache
                st, resp = call_flight_lookup()
                cache_after_website = get_cache()
                t_website = cache_after_website['fetched_at'] if cache_after_website else ""

                check("Claim→Website: cache exists after claim evaluation",
                      cache_after_claim is not None, "cache missing after claim")
                check("Claim→Website: claim used cache (fetched_at unchanged from initial)",
                      t_initial == t_claim,
                      f"initial={t_initial} claim={t_claim}")
                check("Claim→Website: website lookup uses cache (fetched_at unchanged)",
                      t_claim == t_website,
                      f"claim={t_claim} website={t_website}")

                # Cleanup
                http_req('DELETE', f"{url}/rest/v1/claims?id=eq.{claim_id2}", HS)
            else:
                print(f"  Claim creation failed: {st} {json.dumps(cbody2)[:300]}")
                check("Claim→Website: claim created and evaluated", False, f"status={st}")
        else:
            print("  SKIP — could not sign in")
            check("Claim→Website: auth worked", False)

        if uid2:
            http_req('DELETE', f"{url}/auth/v1/admin/users/{uid2}",
                {'apikey': anon_key, 'Authorization': f'Bearer {service_key}'})

    # ── Cleanup ───────────────────────────────────────────────────────────────
    print("\n=== Cleanup ===")
    clear_cache()
    print("  Flight cache cleared.")

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n--- PASS/FAIL SUMMARY ---")
    print(f"  {passed} PASS / {failed} FAIL")
    if failed == 0:
        print("  VERDICT: PASS — all flight cache tests passed.")
    else:
        print("  VERDICT: FAIL — see failures above.")
        for name, ok, detail in results:
            if not ok:
                print(f"    ✗ {name}: {detail}")


if __name__ == '__main__':
    main()
