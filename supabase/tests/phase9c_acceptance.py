#!/usr/bin/env python3
"""
Phase 9C — Legal & Finance UI: live acceptance + security tests.

Tests the Phase 9C UI layer's security and data-integrity guarantees by
exercising the same paths the UI uses (direct Supabase RLS queries for reads,
manage-legal-finance edge function for mutations):

  1.  Lawyer A sees only assigned cases (RLS on legal_cases + claims)
  2.  Lawyer B cannot see Lawyer A cases (RLS isolation)
  3.  Lawyer cannot access global Finance Dashboard (finance_transactions RLS)
  4.  Admin can assign/reassign lawyers (update-legal-case syncs claim.lawyer_id)
  5.  Legal status/deadline/notes updates persist (update-legal-case → DB verify)
  6.  Claim Finance Panel values match the backend (get-reconciliation vs DB)
  7.  Reconciliation mismatch is displayed correctly (partial airline payment)
  8.  Finance filters return correct data (typed transaction_type filtering)
  9.  All finance/legal mutations go through manage-legal-finance (RLS blocks
      direct client writes to claims finance fields + legal_cases)
  10. Worker/customer/agent/sales_manager cannot perform admin-only finance actions
  11. Existing customer/admin/agent flows are not regressed (RLS intact)

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
FN_URL = f"{BASE}/functions/v1/manage-legal-finance"

results = []
created_user_ids = []
created_claim_ids = []
created_legal_case_ids = []


def api(method, path, body=None, token=None, key=None):
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
        try:
            return e.code, json.loads(e.read().decode() or "null")
        except Exception:
            return e.code, e.read().decode()[:300]


def call_fn(action, payload, token):
    body = json.dumps({"action": action, **payload}).encode()
    req = urllib.request.Request(FN_URL, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "null")
        except Exception:
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
    except urllib.error.HTTPError:
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

    api("POST", "/rest/v1/profiles?on_conflict=id",
        {"id": uid, "email": email, "full_name": full_name, "role": role},
        token=SVC, key=SVC)

    status, data = api("POST", "/auth/v1/token?grant_type=password",
                       {"email": email, "password": password}, key=ANON)
    if status != 200 or "access_token" not in data:
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


def create_test_claim(claim_ref, **extra):
    payload = {
        "claim_ref": claim_ref,
        "passenger_first_name": "Test",
        "passenger_last_name": "Phase9C",
        "email": f"p9c_{claim_ref.lower()}@test.app",
        "flight_number": "BA123",
        "flight_date": "2026-08-15",
        "departure": "LHR",
        "arrival": "JFK",
        "airline": "British Airways",
        "issue_type": "Flight delayed 3+ hours",
        "status": "In Progress",
        "amount": "€600",
        "agent": "—",
    }
    payload.update(extra)
    status, data = api("POST", "/rest/v1/claims", payload, token=SVC, key=SVC)
    if isinstance(data, list) and data:
        cid = data[0]["id"]
    else:
        rows = mgmt_query(f"SELECT id FROM claims WHERE claim_ref = '{claim_ref}' LIMIT 1;")
        cid = rows[0]["id"]
    created_claim_ids.append(cid)
    return cid


def cleanup():
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM finance_transactions WHERE claim_id = '{cid}';")
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM legal_cases WHERE claim_id = '{cid}';")
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM audit_log WHERE entity_id = '{cid}';")
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

    print("\n=== Setup: create test users ===")
    admin_id, admin_jwt = create_test_user(f"p9c_admin_{ts}@test.app", pw, "admin", "Test Admin")
    lawyer_a_id, lawyer_a_jwt = create_test_user(f"p9c_lawyerA_{ts}@test.app", pw, "lawyer", "Lawyer A")
    lawyer_b_id, lawyer_b_jwt = create_test_user(f"p9c_lawyerB_{ts}@test.app", pw, "lawyer", "Lawyer B")
    customer_id, customer_jwt = create_test_user(f"p9c_customer_{ts}@test.app", pw, "customer", "Test Customer")
    agent_id, agent_jwt = create_test_user(f"p9c_agent_{ts}@test.app", pw, "agent", "Test Agent")
    worker_id, worker_jwt = create_test_user(f"p9c_worker_{ts}@test.app", pw, "worker", "Test Worker")
    sales_mgr_id, sales_mgr_jwt = create_test_user(f"p9c_salesmgr_{ts}@test.app", pw, "sales_manager", "Sales Mgr")
    check("all test users created", True, f"admin={admin_id[:8]} lawyerA={lawyer_a_id[:8]} lawyerB={lawyer_b_id[:8]}")

    # Create claims and escalate
    claim_a = create_test_claim(f"P9C-A-{ts}", airline="British Airways", country="United Kingdom")
    claim_b = create_test_claim(f"P9C-B-{ts}", airline="Aer Lingus", country="Ireland")

    # Escalate claim_a and assign to Lawyer A
    st, resp = call_fn("escalate-claim", {
        "claimId": claim_a, "lawyerId": lawyer_a_id, "escalationReason": "Assigned to Lawyer A",
    }, admin_jwt)
    lc_a_id = resp.get("legalCase", {}).get("id")
    if lc_a_id:
        created_legal_case_ids.append(lc_a_id)
    check("claim_a escalated + assigned to Lawyer A", st == 200 and lc_a_id is not None, f"status={st}")

    # Escalate claim_b and assign to Lawyer B
    st, resp = call_fn("escalate-claim", {
        "claimId": claim_b, "lawyerId": lawyer_b_id, "escalationReason": "Assigned to Lawyer B",
    }, admin_jwt)
    lc_b_id = resp.get("legalCase", {}).get("id")
    if lc_b_id:
        created_legal_case_ids.append(lc_b_id)
    check("claim_b escalated + assigned to Lawyer B", st == 200 and lc_b_id is not None, f"status={st}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 1. Lawyer A sees only assigned cases ===")
    # LawyerDashboardPage queries legal_cases via RLS — lawyer sees only own
    st, data = api("GET", "/rest/v1/legal_cases?select=id,claim_id,lawyer_id&claim_id=eq."
                   f"{claim_a}", token=lawyer_a_jwt, key=ANON)
    check("Lawyer A CAN see own legal_case (claim_a)", st == 200 and isinstance(data, list) and len(data) == 1,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")
    check("legal_case lawyer_id matches Lawyer A", isinstance(data, list) and len(data) > 0 and data[0]["lawyer_id"] == lawyer_a_id,
          f"lawyer_id={data[0].get('lawyer_id') if data else 'N/A'}")

    # Lawyer A can also read the claim itself (claims RLS: lawyer_id = auth.uid())
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id,claim_ref", token=lawyer_a_jwt, key=ANON)
    check("Lawyer A CAN read assigned claim", st == 200 and isinstance(data, list) and len(data) == 1,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 2. Lawyer B cannot see Lawyer A cases ===")
    # Lawyer B queries legal_cases for claim_a — should be empty (RLS)
    st, data = api("GET", "/rest/v1/legal_cases?select=id,claim_id&claim_id=eq."
                   f"{claim_a}", token=lawyer_b_jwt, key=ANON)
    check("Lawyer B CANNOT see Lawyer A's legal_case", st == 200 and isinstance(data, list) and len(data) == 0,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")

    # Lawyer B cannot read claim_a (claims RLS)
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id,claim_ref", token=lawyer_b_jwt, key=ANON)
    check("Lawyer B CANNOT read Lawyer A's claim", st == 200 and isinstance(data, list) and len(data) == 0,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")

    # Lawyer B CAN see their own case (claim_b)
    st, data = api("GET", "/rest/v1/legal_cases?select=id,claim_id&claim_id=eq."
                   f"{claim_b}", token=lawyer_b_jwt, key=ANON)
    check("Lawyer B CAN see own legal_case (claim_b)", st == 200 and isinstance(data, list) and len(data) == 1,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 3. Lawyer cannot access global Finance Dashboard ===")
    # FinanceDashboard reads finance_transactions — lawyer RLS blocks this
    st, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=lawyer_a_jwt, key=ANON)
    check("Lawyer CANNOT read finance_transactions", st == 200 and isinstance(data, list) and len(data) == 0,
          f"status={st} rows={len(data) if isinstance(data, list) else 0}")

    # Lawyer cannot read ALL claims (only assigned ones)
    st, data = api("GET", "/rest/v1/claims?select=id&limit=100", token=lawyer_a_jwt, key=ANON)
    all_rows = data if isinstance(data, list) else []
    check("Lawyer sees only assigned claims (not all)", len(all_rows) <= 1,
          f"rows={len(all_rows)}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 4. Admin can assign/reassign lawyers ===")
    # Reassign claim_a from Lawyer A to Lawyer B
    st, resp = call_fn("update-legal-case", {
        "legalCaseId": lc_a_id, "lawyerId": lawyer_b_id,
    }, admin_jwt)
    check("reassign to Lawyer B returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("legal_case lawyer_id = Lawyer B", resp.get("legalCase", {}).get("lawyer_id") == lawyer_b_id,
          f"lawyer_id={resp.get('legalCase', {}).get('lawyer_id')}")

    # Verify claim.lawyer_id synced
    rows = mgmt_query(f"SELECT lawyer_id FROM claims WHERE id = '{claim_a}';")
    check("claim.lawyer_id synced to Lawyer B", rows[0]["lawyer_id"] == lawyer_b_id,
          f"lawyer_id={rows[0]['lawyer_id']}")

    # Now Lawyer B can see claim_a, Lawyer A cannot
    st, data = api("GET", f"/rest/v1/legal_cases?select=id&claim_id=eq.{claim_a}", token=lawyer_b_jwt, key=ANON)
    check("After reassign, Lawyer B CAN see claim_a", isinstance(data, list) and len(data) == 1,
          f"rows={len(data) if isinstance(data, list) else 0}")
    st, data = api("GET", f"/rest/v1/legal_cases?select=id&claim_id=eq.{claim_a}", token=lawyer_a_jwt, key=ANON)
    check("After reassign, Lawyer A CANNOT see claim_a", isinstance(data, list) and len(data) == 0,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Reassign back to Lawyer A for subsequent tests
    call_fn("update-legal-case", {"legalCaseId": lc_a_id, "lawyerId": lawyer_a_id}, admin_jwt)

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 5. Legal status/deadline/notes updates persist ===")
    st, resp = call_fn("update-legal-case", {
        "legalCaseId": lc_a_id,
        "legalStatus": "court_filed",
        "nextDeadlineDate": "2026-10-15",
        "deadlines": [
            {"label": "Response deadline", "date": "2026-10-15"},
            {"label": "Discovery cutoff", "date": "2026-11-01"},
        ],
        "notes": "Test notes for Phase 9C — court filing submitted",
    }, admin_jwt)
    check("update-legal-case with all fields returns 200", st == 200 and resp.get("success"), f"status={st}")

    # Verify in DB
    rows = mgmt_query(f"""
        SELECT legal_status, next_deadline_date, deadlines, notes
        FROM legal_cases WHERE id = '{lc_a_id}';
    """)
    r = rows[0] if rows else {}
    check("legal_status persisted = court_filed", r.get("legal_status") == "court_filed",
          f"status={r.get('legal_status')}")
    check("next_deadline_date persisted = 2026-10-15",
          r.get("next_deadline_date", "").startswith("2026-10-15"),
          f"deadline={r.get('next_deadline_date')}")
    check("notes persisted", "Phase 9C" in (r.get("notes") or ""),
          f"notes={r.get('notes', '')[:50]}")
    # Verify deadlines jsonb
    dl = r.get("deadlines")
    if isinstance(dl, str):
        dl = json.loads(dl)
    check("deadlines persisted (2 entries)", isinstance(dl, list) and len(dl) == 2,
          f"deadlines={dl}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 6. Claim Finance Panel values match the backend ===")
    # Set up full finance lifecycle for claim_a
    call_fn("approve-compensation", {"claimId": claim_a, "amount": 600}, admin_jwt)
    call_fn("set-claimvelo-fee", {"claimId": claim_a, "tier": "legal"}, admin_jwt)
    call_fn("record-airline-payment", {
        "claimId": claim_a, "amount": 600, "paymentDate": "2026-09-06", "reference": "AIR-FULL",
    }, admin_jwt)
    call_fn("record-customer-payout", {
        "claimId": claim_a, "amount": 300, "paymentDate": "2026-09-07", "reference": "PAY-FULL",
    }, admin_jwt)

    # Get reconciliation (what ClaimFinancePanel displays)
    st, resp = call_fn("get-reconciliation", {"claimId": claim_a}, admin_jwt)
    check("get-reconciliation returns 200", st == 200 and resp.get("success"), f"status={st}")

    # Verify values match DB
    rows = mgmt_query(f"""
        SELECT approved_compensation_amount, airline_payment_amount, claimvelo_fee_amount,
               customer_payout_amount, claimvelo_fee_tier, claimvelo_fee_rate
        FROM claims WHERE id = '{claim_a}';
    """)
    db = rows[0] if rows else {}
    check("recon approvedCompensation matches DB",
          resp.get("approvedCompensation") == float(db.get("approved_compensation_amount") or 0),
          f"recon={resp.get('approvedCompensation')} db={db.get('approved_compensation_amount')}")
    check("recon airlinePayment matches DB",
          resp.get("airlinePayment", {}).get("amount") == float(db.get("airline_payment_amount") or 0),
          f"recon={resp.get('airlinePayment', {}).get('amount')} db={db.get('airline_payment_amount')}")
    check("recon claimveloFee matches DB",
          resp.get("claimveloFee", {}).get("amount") == float(db.get("claimvelo_fee_amount") or 0),
          f"recon={resp.get('claimveloFee', {}).get('amount')} db={db.get('claimvelo_fee_amount')}")
    check("recon customerPayout matches DB",
          resp.get("customerPayout", {}).get("amount") == float(db.get("customer_payout_amount") or 0),
          f"recon={resp.get('customerPayout', {}).get('amount')} db={db.get('customer_payout_amount')}")
    # Fee is 50% of 600 = 300, expected payout = 600 - 300 = 300, payout = 300
    check("recon expectedPayout = 300 (600-300)", resp.get("expectedPayout") == 300,
          f"expected={resp.get('expectedPayout')}")
    check("recon overallStatus = complete", resp.get("overallStatus") == "complete",
          f"status={resp.get('overallStatus')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 7. Reconciliation mismatch is displayed correctly ===")
    # claim_b: approve 400, fee legal (50% = 200), airline pays only 300 (partial),
    # then record a short customer payout (50 instead of 100) to make all 4
    # finance components present → overallStatus = mismatch (not just in_progress)
    call_fn("approve-compensation", {"claimId": claim_b, "amount": 400}, admin_jwt)
    call_fn("set-claimvelo-fee", {"claimId": claim_b, "tier": "legal"}, admin_jwt)
    st, resp = call_fn("record-airline-payment", {
        "claimId": claim_b, "amount": 300, "paymentDate": "2026-09-06", "reference": "AIR-PARTIAL",
    }, admin_jwt)
    check("partial airline payment recorded", st == 200 and resp.get("success"), f"status={st}")
    # Record a short payout (50 < max 100) to trigger mismatch on all 4 components
    st, resp = call_fn("record-customer-payout", {
        "claimId": claim_b, "amount": 50, "paymentDate": "2026-09-06", "reference": "PAY-SHORT",
    }, admin_jwt)
    check("short customer payout recorded", st == 200 and resp.get("success"), f"status={st}")

    st, resp = call_fn("get-reconciliation", {"claimId": claim_b}, admin_jwt)
    check("mismatch: overallStatus = mismatch", resp.get("overallStatus") == "mismatch",
          f"status={resp.get('overallStatus')}")
    check("mismatch: airlineMismatch = 100 (400-300)", resp.get("airlineMismatch") == 100,
          f"mismatch={resp.get('airlineMismatch')}")
    check("mismatch: expectedPayout = 100 (300-200)", resp.get("expectedPayout") == 100,
          f"expected={resp.get('expectedPayout')}")
    check("mismatch: payoutMismatch = 50 (100-50)", resp.get("payoutMismatch") == 50,
          f"mismatch={resp.get('payoutMismatch')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 8. Finance filters return correct data ===")
    # FinanceDashboard filters by transaction_type. Verify typed txns exist
    # and are correctly categorized.
    rows = mgmt_query(f"""
        SELECT transaction_type, type, amount
        FROM finance_transactions
        WHERE claim_id = '{claim_a}'
        ORDER BY transaction_type;
    """)
    types = {r["transaction_type"]: float(r["amount"]) for r in rows if r["transaction_type"]}
    check("claim_a has airline_payment txn (600)", types.get("airline_payment") == 600,
          f"types={types}")
    check("claim_a has claimvelo_fee txn (300)", types.get("claimvelo_fee") == 300,
          f"types={types}")
    check("claim_a has customer_payout txn (300)", types.get("customer_payout") == 300,
          f"types={types}")

    # Verify income vs expense types
    income_types = [r for r in rows if r["type"] == "income" and r["transaction_type"]]
    expense_types = [r for r in rows if r["type"] == "expense" and r["transaction_type"]]
    check("airline_payment is income", any(r["transaction_type"] == "airline_payment" for r in income_types),
          f"income={[r['transaction_type'] for r in income_types]}")
    check("customer_payout is expense", any(r["transaction_type"] == "customer_payout" for r in expense_types),
          f"expense={[r['transaction_type'] for r in expense_types]}")

    # Admin can filter by transaction_type via REST
    st, data = api("GET", f"/rest/v1/finance_transactions?select=id,amount&claim_id=eq.{claim_a}"
                   "&transaction_type=eq.airline_payment", token=admin_jwt, key=ANON)
    check("admin can filter finance by transaction_type", isinstance(data, list) and len(data) == 1,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 9. All finance/legal mutations go through manage-legal-finance ===")
    # RLS must block direct client writes to claims finance fields and legal_cases.
    # A customer (authenticated) tries to directly UPDATE claims finance fields:
    st, data = api("PATCH", f"/rest/v1/claims?id=eq.{claim_a}", {
        "approved_compensation_amount": 999999,
    }, token=customer_jwt, key=ANON)
    # Should be blocked by RLS (customer can't update claims they don't own,
    # and even if they owned it, the finance columns are protected)
    rows = mgmt_query(f"SELECT approved_compensation_amount FROM claims WHERE id = '{claim_a}';")
    check("customer CANNOT directly set approved_compensation_amount",
          float(rows[0]["approved_compensation_amount"]) == 600,
          f"amount={rows[0]['approved_compensation_amount']}")

    # A lawyer tries to directly UPDATE legal_cases (RLS blocks non-admin writes)
    st, data = api("PATCH", f"/rest/v1/legal_cases?id=eq.{lc_a_id}", {
        "legal_status": "judgment",
    }, token=lawyer_a_jwt, key=ANON)
    rows = mgmt_query(f"SELECT legal_status FROM legal_cases WHERE id = '{lc_a_id}';")
    check("lawyer CANNOT directly update legal_cases",
          rows[0]["legal_status"] == "court_filed",
          f"status={rows[0]['legal_status']}")

    # A lawyer tries to directly INSERT into finance_transactions
    st, data = api("POST", "/rest/v1/finance_transactions", {
        "description": "hack", "amount": 999, "type": "income",
        "category": "Other", "date": "2026-09-06",
    }, token=lawyer_a_jwt, key=ANON)
    check("lawyer CANNOT insert finance_transactions", st >= 400,
          f"status={st}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 10. Worker/customer/agent/sales_manager cannot perform admin-only finance actions ===")
    admin_only_actions = [
        ("escalate-claim", {"claimId": claim_b, "escalationReason": "hack"}),
        ("approve-compensation", {"claimId": claim_b, "amount": 999}),
        ("record-airline-payment", {"claimId": claim_b, "amount": 1, "paymentDate": "2026-09-06", "reference": "hack"}),
        ("set-claimvelo-fee", {"claimId": claim_b, "tier": "standard"}),
        ("record-customer-payout", {"claimId": claim_b, "amount": 1, "paymentDate": "2026-09-06", "reference": "hack"}),
        ("record-legal-expense", {"amount": 1, "paymentDate": "2026-09-06", "description": "hack", "claimId": claim_b}),
        ("update-legal-case", {"legalCaseId": lc_b_id, "legalStatus": "closed"}),
        ("get-reconciliation", {"claimId": claim_b}),
    ]
    non_admin_jwts = [
        ("worker", worker_jwt),
        ("customer", customer_jwt),
        ("agent", agent_jwt),
        ("sales_manager", sales_mgr_jwt),
    ]
    all_blocked = True
    for role_name, jwt in non_admin_jwts:
        for action, payload in admin_only_actions:
            st, _ = call_fn(action, payload, jwt)
            if st != 403:
                check(f"{role_name} blocked from {action}", False, f"status={st} (expected 403)")
                all_blocked = False
    if all_blocked:
        check("all non-admin roles (worker/customer/agent/sales_manager) get 403 on all admin-only actions",
              True, f"{len(non_admin_jwts)} roles × {len(admin_only_actions)} actions = {len(non_admin_jwts)*len(admin_only_actions)} checks")

    # Lawyer also blocked from admin-only mutations (but can do get-legal-overview for own)
    for action, payload in admin_only_actions:
        if action == "get-reconciliation":
            continue  # tested above
        st, _ = call_fn(action, payload, lawyer_a_jwt)
        if st != 403:
            check(f"lawyer blocked from {action}", False, f"status={st} (expected 403)")
            all_blocked = False
    if all_blocked:
        check("lawyer also blocked from all admin-only mutations (403)", True, "")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 11. Existing customer/admin/agent flows are not regressed ===")
    # Customer can read their own claim (RLS uses customer_user_id = auth.uid())
    customer_claim = create_test_claim(f"P9C-CUST-{ts}", email=f"p9c_customer_{ts}@test.app",
                                       customer_user_id=customer_id)
    st, data = api("GET", f"/rest/v1/claims?id=eq.{customer_claim}&select=id,claim_ref",
                   token=customer_jwt, key=ANON)
    check("customer CAN read own claim", isinstance(data, list) and len(data) == 1,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Customer cannot read other claims
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id", token=customer_jwt, key=ANON)
    check("customer CANNOT read unowned claims", isinstance(data, list) and len(data) == 0,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Admin can read all claims
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id", token=admin_jwt, key=ANON)
    check("admin CAN read claims", isinstance(data, list) and len(data) >= 1,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Admin can read finance_transactions
    st, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=admin_jwt, key=ANON)
    check("admin CAN read finance_transactions", isinstance(data, list) and len(data) >= 1,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Worker can read claims
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id", token=worker_jwt, key=ANON)
    check("worker CAN read claims", isinstance(data, list) and len(data) >= 1,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # Agent cannot read unassigned claims
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim_a}&select=id", token=agent_jwt, key=ANON)
    check("agent CANNOT read unassigned claims", isinstance(data, list) and len(data) == 0,
          f"rows={len(data) if isinstance(data, list) else 0}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== Summary ===")
    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"{passed} passed, {failed} failed, {len(results)} total")
    if failed:
        print("\nFAILURES:")
        for s, n, d in results:
            if s == "FAIL":
                print(f"  - {n}: {d}")

    return 1 if failed else 0


if __name__ == "__main__":
    exit_code = 0
    try:
        exit_code = main()
    finally:
        cleanup()
        print("\n[cleanup] All test data removed.")
    sys.exit(exit_code)
