#!/usr/bin/env python3
"""
AviationStack 6-Flight Historical Data Test.

Tests how far back AviationStack can provide historical flight data
using the existing ClaimVelo API key (quotes stripped — platform convention).
No production code changes.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

# ── Load API key (strip platform-added quotes) ────────────────────────────────
keys = {}
with open("/run/base44/app.env") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            keys[k.strip()] = v.strip().strip('"').strip("'")

AVIA_KEY = keys.get("AVIATIONSTACK_API_KEY", "")

def fetch_aviationstack(fn, date_str):
    """Calls AviationStack exactly like evaluate.ts fetchAviationStack."""
    params = urllib.parse.urlencode({
        "access_key": AVIA_KEY,
        "flight_iata": fn,
        "flight_date": date_str,
    })
    url = f"http://api.aviationstack.com/v1/flights?{params}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = json.loads(resp.read().decode())
            if raw.get("error"):
                return {"http": resp.status, "error": raw["error"], "data": None}
            data = raw.get("data", [])
            return {"http": resp.status, "error": None, "data": data, "pagination": raw.get("pagination", {})}
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        return {"http": e.code, "error": body, "data": None}
    except Exception as e:
        return {"http": 0, "error": str(e)[:200], "data": None}

# ── 6 test flights at different ages ──────────────────────────────────────────
# Current date: 2026-09-06. Using well-known daily flights on major routes.
TESTS = [
    {"label": "Recent (~0 days)",     "fn": "BA103",  "date": "2026-09-05", "route": "LHR→JFK", "carrier": "BA (British Airways)"},
    {"label": "~6 months old",         "fn": "LH401",  "date": "2026-03-06", "route": "FRA→JFK", "carrier": "LH (Lufthansa)"},
    {"label": "~1 year old",           "fn": "AF111",  "date": "2025-09-05", "route": "CDG→JFK", "carrier": "AF (Air France)"},
    {"label": "~2 years old",          "fn": "KL643",  "date": "2024-09-06", "route": "AMS→JFK", "carrier": "KL (KLM)"},
    {"label": "~4 years old",          "fn": "IB744",  "date": "2022-09-05", "route": "MAD→LHR", "carrier": "IB (Iberia)"},
    {"label": "~6 years old",          "fn": "BA103",  "date": "2020-09-05", "route": "LHR→JFK", "carrier": "BA (British Airways)"},
]

def main():
    # ── Step 1: Confirm 401 is gone ────────────────────────────────────────────
    print("=" * 120)
    print("STEP 1: Confirm AviationStack 401 is resolved")
    print("=" * 120)
    confirm = fetch_aviationstack("BA103", "2026-09-05")
    if confirm["http"] == 200:
        print(f"✅ HTTP 200 — 401 is GONE. Key works (quotes stripped per platform convention).\n")
    elif confirm["http"] == 401:
        print(f"❌ HTTP 401 — key still invalid.\n")
        return
    else:
        print(f"⚠️  HTTP {confirm['http']} — unexpected response.\n")

    # ── Step 2: Run 6 historical flight tests ──────────────────────────────────
    print("=" * 120)
    print("STEP 2: 6 Historical Flight Tests")
    print("=" * 120)

    for i, test in enumerate(TESTS, 1):
        age_days = (datetime(2026, 9, 6) - datetime.fromisoformat(test["date"])).days
        print(f"\n{'─' * 120}")
        print(f"FLIGHT {i}/6: {test['label']}")
        print(f"  Requested: {test['fn']} on {test['date']} ({test['route']}, {test['carrier']})")
        print(f"  Age: ~{age_days} days ({age_days/365.25:.1f} years)")
        print(f"{'─' * 120}")

        result = fetch_aviationstack(test["fn"], test["date"])

        if result["http"] != 200:
            print(f"  HTTP Status: {result['http']}")
            print(f"  Error: {result['error']}")
            print(f"  AviationStack returned: HISTORICAL_DATA_UNAVAILABLE")
            print(f"  Sufficient for ClaimVelo screening: NO")
            continue

        data = result["data"]
        print(f"  HTTP Status: 200")
        print(f"  Records returned: {len(data)}")

        if not data:
            print(f"  AviationStack returned: HISTORICAL_DATA_UNAVAILABLE (empty result set)")
            print(f"  Sufficient for ClaimVelo screening: NO")
            continue

        # Analyze each returned flight
        for j, f in enumerate(data):
            flight_info = f.get("flight", {}) or {}
            airline = f.get("airline", {}) or {}
            dep = f.get("departure", {}) or {}
            arr = f.get("arrival", {}) or {}

            ret_fn = flight_info.get("iata") or ""
            ret_date = f.get("flight_date") or ""
            ret_origin = dep.get("iata") or ""
            ret_dest = arr.get("iata") or ""
            ret_carrier = airline.get("iata") or ""
            ret_carrier_name = airline.get("name") or ""
            status = f.get("flight_status") or ""
            sched_arr = arr.get("scheduled") or ""
            actual_arr = arr.get("actual") or ""
            estimated_arr = arr.get("estimated") or ""
            sched_dep = dep.get("scheduled") or ""
            actual_dep = dep.get("actual") or ""
            dep_delay = dep.get("delay")

            # Compute arrival delay
            arrival_delay = None
            if sched_arr and actual_arr:
                try:
                    s = datetime.fromisoformat(sched_arr.replace("Z", "+00:00"))
                    a = datetime.fromisoformat(actual_arr.replace("Z", "+00:00"))
                    arrival_delay = max(0, round((a - s).total_seconds() / 60))
                except:
                    pass
            elif sched_arr and estimated_arr:
                try:
                    s = datetime.fromisoformat(sched_arr.replace("Z", "+00:00"))
                    a = datetime.fromisoformat(estimated_arr.replace("Z", "+00:00"))
                    arrival_delay = max(0, round((a - s).total_seconds() / 60))
                except:
                    pass

            # Check if this matches the requested flight
            fn_match = ret_fn.upper() == test["fn"].upper()
            date_match = ret_date == test["date"]
            route_match = ret_origin.upper() in test["route"].split("→")[0].strip() and ret_dest.upper() in test["route"].split("→")[1].strip()

            # Codeshare check
            codeshared = flight_info.get("codeshared") or {}
            marketing_fn = codeshared.get("flight_iata") if codeshared else None

            print(f"\n  Record {j+1}:")
            print(f"    Returned flight:   {ret_fn} on {ret_date}")
            print(f"    Route:             {ret_origin} → {ret_dest}")
            print(f"    Operating carrier:  {ret_carrier} ({ret_carrier_name})")
            if marketing_fn:
                print(f"    Marketing carrier:  {codeshared.get('airline_iata')} (codeshare: {marketing_fn})")
            print(f"    Flight status:     {status}")
            print(f"    Cancellation:       {'YES — CANCELLED' if status in ('cancelled','canceled') else 'No'}")
            print(f"    Scheduled dep:      {sched_dep or 'N/A'}")
            print(f"    Actual dep:         {actual_dep or 'N/A'}")
            print(f"    Scheduled arrival:  {sched_arr or 'N/A'}")
            print(f"    Actual arrival:     {actual_arr or 'N/A'}")
            if estimated_arr and not actual_arr:
                print(f"    Estimated arrival:  {estimated_arr}")
            print(f"    Arrival delay:      {arrival_delay} min" if arrival_delay is not None else "    Arrival delay:      N/A")
            if dep_delay is not None:
                print(f"    Departure delay:    {dep_delay} min")
            print(f"    Match — flight:     {'YES' if fn_match else 'NO'}")
            print(f"    Match — date:       {'YES' if date_match else 'NO'}")
            print(f"    Match — route:      {'YES' if route_match else 'NO'}")

            # Sufficiency for ClaimVelo
            has_sched_arr = bool(sched_arr)
            has_actual_arr = bool(actual_arr or estimated_arr)
            has_carrier = bool(ret_carrier)
            is_cancelled = status in ("cancelled", "canceled")

            if is_cancelled:
                sufficient = has_carrier and fn_match
                reason = "Cancelled flight — carrier + identity verified; Rules Engine needs cancellation notice date for full evaluation"
            elif has_sched_arr and has_actual_arr and has_carrier and fn_match:
                sufficient = True
                reason = "Scheduled + actual arrival + operating carrier + identity all present — sufficient for Rules Engine"
            elif has_sched_arr and has_carrier and fn_match:
                sufficient = False
                reason = "Missing actual arrival time — Rules Engine needs actual arrival to compute delay"
            else:
                sufficient = False
                reason = "Missing key fields — insufficient for Rules Engine"

            print(f"    Sufficient for ClaimVelo screening: {'YES' if sufficient else 'NO'}")
            print(f"    Reason: {reason}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'=' * 120}")
    print("SUMMARY")
    print(f"{'=' * 120}")

    # Re-run to build summary
    results = []
    for test in TESTS:
        r = fetch_aviationstack(test["fn"], test["date"])
        age_days = (datetime(2026, 9, 6) - datetime.fromisoformat(test["date"])).days
        entry = {"label": test["label"], "fn": test["fn"], "date": test["date"], "age_days": age_days}
        if r["http"] != 200 or not r["data"]:
            entry["found"] = False
            entry["sufficient"] = False
        else:
            f = r["data"][0]
            arr = f.get("arrival", {}) or {}
            airline = f.get("airline", {}) or {}
            flight_info = f.get("flight", {}) or {}
            entry["found"] = True
            entry["fn_match"] = (flight_info.get("iata") or "").upper() == test["fn"].upper()
            entry["has_sched_arr"] = bool(arr.get("scheduled"))
            entry["has_actual_arr"] = bool(arr.get("actual") or arr.get("estimated"))
            entry["has_carrier"] = bool(airline.get("iata"))
            entry["status"] = f.get("flight_status")
            entry["sufficient"] = entry["has_sched_arr"] and entry["has_actual_arr"] and entry["has_carrier"] and entry["fn_match"]
        results.append(entry)

    print(f"\n{'Age':<20} {'Flight':<10} {'Date':<12} {'Found':>5} {'FN Match':>8} {'Sched Arr':>9} {'Actual Arr':>10} {'Carrier':>7} {'Sufficient':>10}")
    print("─" * 100)
    for r in results:
        print(f"{r['label']:<20} {r['fn']:<10} {r['date']:<12} "
              f"{'YES' if r.get('found') else 'NO':>5} "
              f"{'YES' if r.get('fn_match') else '—':>8} "
              f"{'YES' if r.get('has_sched_arr') else 'NO':>9} "
              f"{'YES' if r.get('has_actual_arr') else 'NO':>10} "
              f"{'YES' if r.get('has_carrier') else 'NO':>7} "
              f"{'YES' if r.get('sufficient') else 'NO':>10}")

    found = sum(1 for r in results if r.get("found"))
    sufficient = sum(1 for r in results if r.get("sufficient"))
    print(f"\nFlights found by AviationStack: {found}/6")
    print(f"Flights with sufficient data for ClaimVelo: {sufficient}/6")

    # Determine how far back
    print(f"\n{'=' * 120}")
    print("HOW FAR BACK CAN AVIATIONSTACK RELIABLY PROVIDE HISTORICAL FLIGHT DATA?")
    print(f"{'=' * 120}")
    for r in sorted(results, key=lambda x: x["age_days"]):
        status = "✅ DATA + SUFFICIENT" if r.get("sufficient") else ("⚠️  DATA but INSUFFICIENT" if r.get("found") else "❌ NO DATA")
        print(f"  {r['label']:<20} ({r['age_days']:>4} days / {r['age_days']/365.25:.1f}y)  {status}")

if __name__ == "__main__":
    main()
