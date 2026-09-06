#!/usr/bin/env python3
"""
Phase 9B — Legal/Finance Workflow: live acceptance + security tests.

Tests (against the live Supabase project + deployed edge function):
  1.  Standard claim escalation (escalate-claim creates legal_case + stamps claim)
  2.  Legal case creation (idempotent re-escalate returns existing)
  3.  Lawyer assignment (update-legal-case syncs lawyer_id to claim)
  4.  Lawyer isolation (get-legal-overview blocked for non-assigned lawyer)
  5.  Compensation approval (approve-compensation sets approved_compensation_amount)
  6.  Unauthorized compensation approval blocked (customer/agent/lawyer rejected)
  7.  30% standard fee (set-claimvelo-fee standard = 30% of approved amount)
  8.  50% legal escalation fee (set-claimvelo-fee legal = 50% of approved amount)
  9.  Airline payment recording (record-airline-payment sets fields + finance txn)
  10. Duplicate airline payment prevented/idempotent (upsert, no duplicate txn)
  11. Customer payout (record-customer-payout sets fields + finance txn)
  12. Unauthorized payout blocked (customer/agent/lawyer rejected)
  13. Partial airline payment mismatch (reconciliation flags underpaid)
  14. Reconciliation complete state (get-reconciliation overallStatus=complete)
  15. Reconciliation incomplete/mismatch state (get-reconciliation overallStatus=mismatch)
  16. Agent commission remains separate (legal/finance actions don't touch commissions)
  17. Audit trail for all major legal/finance actions
  18. Fee basis is approved_compensation_amount only (not airline payment)
  19. Customer payout overpay protection (partial airline → max payout enforced)
  20. Existing flows not regressed (customer/agent/admin can still read claims)

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
created_txn_ids = []


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
        "passenger_last_name": "Phase9B",
        "email": f"p9b_{claim_ref.lower()}@test.app",
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
    # Delete finance transactions created by tests
    for tid in created_txn_ids:
        mgmt_query(f"DELETE FROM finance_transactions WHERE id = '{tid}';")
    # Delete typed finance transactions for test claims
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM finance_transactions WHERE claim_id = '{cid}';")
    # Delete legal cases
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM legal_cases WHERE claim_id = '{cid}';")
    # Delete claims
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM claims WHERE id = '{cid}';")
    # Delete audit_log entries for test claims
    for cid in created_claim_ids:
        mgmt_query(f"DELETE FROM audit_log WHERE entity_id = '{cid}';")
    # Delete users
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
    admin_id, admin_jwt = create_test_user(f"p9b_admin_{ts}@test.app", pw, "admin", "Test Admin")
    lawyer_a_id, lawyer_a_jwt = create_test_user(f"p9b_lawyerA_{ts}@test.app", pw, "lawyer", "Test Lawyer A")
    lawyer_b_id, lawyer_b_jwt = create_test_user(f"p9b_lawyerB_{ts}@test.app", pw, "lawyer", "Test Lawyer B")
    customer_id, customer_jwt = create_test_user(f"p9b_customer_{ts}@test.app", pw, "customer", "Test Customer")
    agent_id, agent_jwt = create_test_user(f"p9b_agent_{ts}@test.app", pw, "agent", "Test Agent")
    check("all test users created", True, f"admin={admin_id[:8]} lawyerA={lawyer_a_id[:8]}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 1. Standard claim escalation ===")
    claim1 = create_test_claim(f"P9B-STD-{ts}")
    st, resp = call_fn("escalate-claim", {
        "claimId": claim1, "escalationReason": "Airline rejected — standard escalation",
    }, admin_jwt)
    check("escalate-claim returns 200", st == 200, f"status={st}")
    check("escalate-claim creates legal_case", resp.get("success") and resp.get("legalCase", {}).get("id"), "")
    check("alreadyEscalated=false on first call", resp.get("alreadyEscalated") is False, "")
    lc1_id = resp.get("legalCase", {}).get("id")
    if lc1_id:
        created_legal_case_ids.append(lc1_id)

    # Verify claim was stamped
    rows = mgmt_query(f"SELECT status, escalated_at, escalation_reason, legal_case_id, lawyer_id FROM claims WHERE id = '{claim1}';")
    check("claim status set to Escalated", rows[0]["status"] == "Escalated", f"status={rows[0]['status']}")
    check("claim escalated_at set", rows[0]["escalated_at"] is not None, "")
    check("claim legal_case_id linked", rows[0]["legal_case_id"] == lc1_id, "")
    check("claim escalation_reason set", "standard escalation" in (rows[0]["escalation_reason"] or ""), "")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 2. Legal case creation (idempotent) ===")
    st, resp2 = call_fn("escalate-claim", {
        "claimId": claim1, "escalationReason": "duplicate attempt",
    }, admin_jwt)
    check("re-escalate returns 200", st == 200, f"status={st}")
    check("re-escalate returns alreadyEscalated=true", resp2.get("alreadyEscalated") is True, "")
    check("re-escalate returns same legal_case id", resp2.get("legalCase", {}).get("id") == lc1_id, "")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 3. Lawyer assignment ===")
    st, resp = call_fn("update-legal-case", {
        "legalCaseId": lc1_id, "lawyerId": lawyer_a_id, "legalStatus": "pre_litigation",
    }, admin_jwt)
    check("update-legal-case returns 200", st == 200, f"status={st}")
    check("legal_case lawyer_id updated", resp.get("legalCase", {}).get("lawyer_id") == lawyer_a_id, "")
    # Verify lawyer_id synced to claim
    rows = mgmt_query(f"SELECT lawyer_id FROM claims WHERE id = '{claim1}';")
    check("claim lawyer_id synced from legal_case", rows[0]["lawyer_id"] == lawyer_a_id, f"lawyer_id={rows[0]['lawyer_id']}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 4. Lawyer isolation ===")
    # Lawyer A (assigned) can get legal overview
    st, resp = call_fn("get-legal-overview", {"claimId": claim1}, lawyer_a_jwt)
    check("assigned lawyer CAN get legal overview", st == 200 and resp.get("success"), f"status={st}")
    # Lawyer B (not assigned) cannot
    st, resp = call_fn("get-legal-overview", {"claimId": claim1}, lawyer_b_jwt)
    check("non-assigned lawyer CANNOT get legal overview", st == 403, f"status={st}")
    # Customer cannot
    st, resp = call_fn("get-legal-overview", {"claimId": claim1}, customer_jwt)
    check("customer CANNOT get legal overview", st == 403, f"status={st}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 5. Compensation approval ===")
    st, resp = call_fn("approve-compensation", {"claimId": claim1, "amount": 600}, admin_jwt)
    check("approve-compensation returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("approvedAmount correct", resp.get("approvedAmount") == 600, f"amount={resp.get('approvedAmount')}")
    rows = mgmt_query(f"SELECT approved_compensation_amount, approved_at, approved_by FROM claims WHERE id = '{claim1}';")
    check("approved_compensation_amount set to 600", float(rows[0]["approved_compensation_amount"]) == 600, "")
    check("approved_at set", rows[0]["approved_at"] is not None, "")
    check("approved_by set to admin", rows[0]["approved_by"] == admin_id, "")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 6. Unauthorized compensation approval blocked ===")
    claim1b = create_test_claim(f"P9B-AUTH-{ts}")
    for role_name, jwt in [("customer", customer_jwt), ("agent", agent_jwt), ("lawyer", lawyer_a_jwt)]:
        st, resp = call_fn("approve-compensation", {"claimId": claim1b, "amount": 999}, jwt)
        check(f"{role_name} CANNOT approve compensation", st == 403, f"status={st}")
    mgmt_query(f"DELETE FROM claims WHERE id = '{claim1b}';")
    created_claim_ids.remove(claim1b)

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 7. 30% standard fee ===")
    st, resp = call_fn("set-claimvelo-fee", {"claimId": claim1, "tier": "standard"}, admin_jwt)
    check("set-claimvelo-fee standard returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("fee rate is 30", resp.get("rate") == 30, f"rate={resp.get('rate')}")
    check("fee amount is 180 (30% of 600)", resp.get("feeAmount") == 180, f"fee={resp.get('feeAmount')}")
    check("baseAmount is 600 (approved, not airline)", resp.get("baseAmount") == 600, f"base={resp.get('baseAmount')}")
    rows = mgmt_query(f"SELECT claimvelo_fee_tier, claimvelo_fee_rate, claimvelo_fee_amount FROM claims WHERE id = '{claim1}';")
    check("claim fee tier=standard", rows[0]["claimvelo_fee_tier"] == "standard", "")
    check("claim fee amount=180", float(rows[0]["claimvelo_fee_amount"]) == 180, "")

    # Verify finance transaction created
    rows = mgmt_query(f"SELECT id, amount, transaction_type FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'claimvelo_fee';")
    check("claimvelo_fee finance txn created", len(rows) == 1 and float(rows[0]["amount"]) == 180, f"rows={len(rows)}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 8. 50% legal escalation fee ===")
    claim2 = create_test_claim(f"P9B-LEG-{ts}")
    call_fn("escalate-claim", {"claimId": claim2, "lawyerId": lawyer_b_id, "escalationReason": "legal escalation"}, admin_jwt)
    call_fn("approve-compensation", {"claimId": claim2, "amount": 400}, admin_jwt)
    st, resp = call_fn("set-claimvelo-fee", {"claimId": claim2, "tier": "legal"}, admin_jwt)
    check("set-claimvelo-fee legal returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("legal fee rate is 50", resp.get("rate") == 50, f"rate={resp.get('rate')}")
    check("legal fee amount is 200 (50% of 400)", resp.get("feeAmount") == 200, f"fee={resp.get('feeAmount')}")
    check("legal baseAmount is 400 (approved)", resp.get("baseAmount") == 400, f"base={resp.get('baseAmount')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 18. Fee basis is approved_compensation_amount only ===")
    # Record airline payment of 500 (less than approved 600) then verify fee unchanged
    call_fn("record-airline-payment", {"claimId": claim1, "amount": 500, "paymentDate": "2026-09-06", "reference": "AIR-500"}, admin_jwt)
    # Re-set fee — should still be 30% of 600 (approved), NOT 30% of 500 (airline)
    st, resp = call_fn("set-claimvelo-fee", {"claimId": claim1, "tier": "standard"}, admin_jwt)
    check("fee still 180 (30% of approved 600, not airline 500)", resp.get("feeAmount") == 180, f"fee={resp.get('feeAmount')}")
    check("baseAmount still 600 (approved, not airline)", resp.get("baseAmount") == 600, f"base={resp.get('baseAmount')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 9. Airline payment recording ===")
    # claim1 already has airline payment of 500 from test 18
    rows = mgmt_query(f"SELECT airline_payment_status, airline_payment_amount, airline_payment_date, airline_payment_reference FROM claims WHERE id = '{claim1}';")
    check("airline_payment_amount=500", float(rows[0]["airline_payment_amount"]) == 500, f"amt={rows[0]['airline_payment_amount']}")
    check("airline_payment_status=received", rows[0]["airline_payment_status"] == "received", f"st={rows[0]['airline_payment_status']}")
    check("airline_payment_reference set", rows[0]["airline_payment_reference"] == "AIR-500", "")
    # Finance txn
    rows = mgmt_query(f"SELECT id, amount, transaction_type, type FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'airline_payment';")
    check("airline_payment finance txn created", len(rows) == 1 and float(rows[0]["amount"]) == 500, f"rows={len(rows)}")
    check("airline_payment txn is income", rows[0]["type"] == "income", f"type={rows[0]['type']}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 10. Duplicate airline payment prevented/idempotent ===")
    before_count = mgmt_query(f"SELECT count(*) AS n FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'airline_payment';")[0]["n"]
    st, resp = call_fn("record-airline-payment", {"claimId": claim1, "amount": 600, "paymentDate": "2026-09-06", "reference": "AIR-600"}, admin_jwt)
    check("duplicate airline payment returns 200 (upsert)", st == 200 and resp.get("success"), f"status={st}")
    after_count = mgmt_query(f"SELECT count(*) AS n FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'airline_payment';")[0]["n"]
    check("no duplicate airline_payment txn (still 1)", int(after_count) == 1, f"before={before_count} after={after_count}")
    # Verify the txn was updated (amount changed to 600)
    rows = mgmt_query(f"SELECT amount FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'airline_payment';")
    check("airline_payment txn updated to 600", float(rows[0]["amount"]) == 600, f"amt={rows[0]['amount']}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 13. Partial airline payment mismatch ===")
    # claim2: approved 400, record airline payment of 300 (partial)
    st, resp = call_fn("record-airline-payment", {"claimId": claim2, "amount": 300, "paymentDate": "2026-09-06", "reference": "AIR-PARTIAL"}, admin_jwt)
    check("partial airline payment returns 200", st == 200 and resp.get("success"), f"status={st}")
    recon = resp.get("reconciliation")
    check("reconciliation detected mismatch", recon is not None, f"recon={recon}")
    if recon:
        check("reconciliation status=underpaid", recon.get("status") == "underpaid", f"status={recon.get('status')}")
        check("reconciliation mismatch=100 (400-300)", recon.get("mismatch") == 100, f"mismatch={recon.get('mismatch')}")
    # Verify approved_compensation_amount NOT corrupted
    rows = mgmt_query(f"SELECT approved_compensation_amount FROM claims WHERE id = '{claim2}';")
    check("approved_compensation_amount NOT corrupted by partial payment", float(rows[0]["approved_compensation_amount"]) == 400, f"amt={rows[0]['approved_compensation_amount']}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 19. Customer payout overpay protection ===")
    # claim2: airline paid 300, fee is 200 (50% of 400). Max payout = 300 - 200 = 100
    # Try to pay 250 (overpay) — should be blocked
    st, resp = call_fn("record-customer-payout", {
        "claimId": claim2, "amount": 250, "paymentDate": "2026-09-06", "reference": "PAYOUT-OVER",
    }, admin_jwt)
    check("overpay payout blocked (250 > max 100)", st == 409, f"status={st}")
    # Pay exactly 100 (max) — should succeed
    st, resp = call_fn("record-customer-payout", {
        "claimId": claim2, "amount": 100, "paymentDate": "2026-09-06", "reference": "PAYOUT-OK",
    }, admin_jwt)
    check("max payout (100) succeeds", st == 200 and resp.get("success"), f"status={st}")
    check("maxPayout=100 (300-200)", resp.get("maxPayout") == 100, f"max={resp.get('maxPayout')}")
    check("payoutComplete=true", resp.get("payoutComplete") is True, f"complete={resp.get('payoutComplete')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 11. Customer payout (full reconciliation) ===")
    # claim1: approved 600, fee 180 (30%), airline paid 600, max payout = 600-180 = 420
    st, resp = call_fn("record-customer-payout", {
        "claimId": claim1, "amount": 420, "paymentDate": "2026-09-06", "reference": "PAYOUT-FULL",
    }, admin_jwt)
    check("full customer payout returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("payout amount=420", resp.get("amount") == 420, f"amt={resp.get('amount')}")
    rows = mgmt_query(f"SELECT customer_payout_status, customer_payout_amount, customer_payout_reference FROM claims WHERE id = '{claim1}';")
    check("customer_payout_status=paid", rows[0]["customer_payout_status"] == "paid", f"st={rows[0]['customer_payout_status']}")
    check("customer_payout_amount=420", float(rows[0]["customer_payout_amount"]) == 420, "")
    # Finance txn
    rows = mgmt_query(f"SELECT id, amount, transaction_type, type FROM finance_transactions WHERE claim_id = '{claim1}' AND transaction_type = 'customer_payout';")
    check("customer_payout finance txn created", len(rows) == 1 and float(rows[0]["amount"]) == 420, f"rows={len(rows)}")
    check("customer_payout txn is expense", rows[0]["type"] == "expense", f"type={rows[0]['type']}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 12. Unauthorized payout blocked ===")
    claim_auth = create_test_claim(f"P9B-PAYOUT-{ts}")
    call_fn("escalate-claim", {"claimId": claim_auth}, admin_jwt)
    call_fn("approve-compensation", {"claimId": claim_auth, "amount": 600}, admin_jwt)
    call_fn("set-claimvelo-fee", {"claimId": claim_auth, "tier": "standard"}, admin_jwt)
    call_fn("record-airline-payment", {"claimId": claim_auth, "amount": 600, "paymentDate": "2026-09-06", "reference": "AIR"}, admin_jwt)
    for role_name, jwt in [("customer", customer_jwt), ("agent", agent_jwt), ("lawyer", lawyer_a_jwt)]:
        st, resp = call_fn("record-customer-payout", {
            "claimId": claim_auth, "amount": 420, "paymentDate": "2026-09-06", "reference": "HACK",
        }, jwt)
        check(f"{role_name} CANNOT record customer payout", st == 403, f"status={st}")
    mgmt_query(f"DELETE FROM finance_transactions WHERE claim_id = '{claim_auth}';")
    mgmt_query(f"DELETE FROM legal_cases WHERE claim_id = '{claim_auth}';")
    mgmt_query(f"DELETE FROM claims WHERE id = '{claim_auth}';")
    created_claim_ids.remove(claim_auth)

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 14. Reconciliation complete state ===")
    # claim1: approved 600, airline 600, fee 180, payout 420 → complete
    st, resp = call_fn("get-reconciliation", {"claimId": claim1}, admin_jwt)
    check("get-reconciliation returns 200", st == 200 and resp.get("success"), f"status={st}")
    check("overallStatus=complete", resp.get("overallStatus") == "complete", f"status={resp.get('overallStatus')}")
    check("airlineMismatch=0", resp.get("airlineMismatch") == 0, f"mismatch={resp.get('airlineMismatch')}")
    check("payoutMismatch=0", resp.get("payoutMismatch") == 0, f"mismatch={resp.get('payoutMismatch')}")
    check("expectedPayout=420", resp.get("expectedPayout") == 420, f"expected={resp.get('expectedPayout')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 15. Reconciliation incomplete/mismatch state ===")
    # claim2: approved 400, airline 300 (partial), fee 200, payout 100 → mismatch
    st, resp = call_fn("get-reconciliation", {"claimId": claim2}, admin_jwt)
    check("overallStatus=mismatch", resp.get("overallStatus") == "mismatch", f"status={resp.get('overallStatus')}")
    check("airlineMismatch=100 (400-300)", resp.get("airlineMismatch") == 100, f"mismatch={resp.get('airlineMismatch')}")
    check("expectedPayout=100 (300-200)", resp.get("expectedPayout") == 100, f"expected={resp.get('expectedPayout')}")
    check("payoutMismatch=0 (paid 100, expected 100)", resp.get("payoutMismatch") == 0, f"mismatch={resp.get('payoutMismatch')}")

    # Also test a claim with no finance data (pending state)
    claim3 = create_test_claim(f"P9B-PENDING-{ts}")
    st, resp = call_fn("get-reconciliation", {"claimId": claim3}, admin_jwt)
    check("overallStatus=pending (no finance data)", resp.get("overallStatus") == "pending", f"status={resp.get('overallStatus')}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 16. Agent commission remains separate ===")
    # Verify no commission records were created/modified for test claims
    rows = mgmt_query(f"SELECT count(*) AS n FROM commissions WHERE claim_id IN ('{claim1}','{claim2}','{claim3}');")
    check("no commissions created by legal/finance actions", int(rows[0]["n"]) == 0, f"count={rows[0]['n']}")
    # Verify finance transactions have correct transaction_types (no agent_commission type)
    rows = mgmt_query(f"SELECT DISTINCT transaction_type FROM finance_transactions WHERE claim_id IN ('{claim1}','{claim2}');")
    types = [r["transaction_type"] for r in rows]
    check("no agent_commission txns from legal/finance", "agent_commission" not in types, f"types={types}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 17. Audit trail for legal/finance actions ===")
    # Check audit_log entries for test claims
    actions = mgmt_query(f"""
        SELECT action FROM audit_log WHERE entity_id = '{claim1}'
        AND action IN ('claim.escalated','claim.compensation_approved','claim.airline_payment_changed',
                       'claim.customer_payout_changed','claim.fee_changed','legal_case.created')
        ORDER BY action;
    """)
    found_actions = set(r["action"] for r in actions)
    check("audit: claim.escalated", "claim.escalated" in found_actions, f"actions={found_actions}")
    check("audit: claim.compensation_approved", "claim.compensation_approved" in found_actions, f"actions={found_actions}")
    check("audit: claim.airline_payment_changed", "claim.airline_payment_changed" in found_actions, f"actions={found_actions}")
    check("audit: claim.customer_payout_changed", "claim.customer_payout_changed" in found_actions, f"actions={found_actions}")
    check("audit: claim.fee_changed", "claim.fee_changed" in found_actions, f"actions={found_actions}")

    # Legal case audit
    lc_actions = mgmt_query(f"SELECT action FROM audit_log WHERE entity_id = '{lc1_id}' AND action LIKE 'legal_case%';")
    check("audit: legal_case.created", any(r["action"] == "legal_case.created" for r in lc_actions), f"actions={[r['action'] for r in lc_actions]}")

    # ═══════════════════════════════════════════════════════════════════════════
    print("\n=== 20. Existing flows not regressed ===")
    # Customer can only read their OWN claims (not all claims) — RLS intact
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim1}&select=id,claim_ref", token=customer_jwt, key=ANON)
    check("customer CANNOT read unowned claims (RLS intact)", isinstance(data, list) and len(data) == 0, f"status={st} rows={len(data) if isinstance(data,list) else 0}")
    # Agent can only read claims assigned to them — RLS intact
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim1}&select=id,claim_ref", token=agent_jwt, key=ANON)
    check("agent CANNOT read unassigned claims (RLS intact)", isinstance(data, list) and len(data) == 0, f"status={st}")
    # Admin can still read claims
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim1}&select=id,claim_ref", token=admin_jwt, key=ANON)
    check("admin CAN read claims (RLS intact)", isinstance(data, list) and len(data) >= 1, f"status={st}")
    # Admin can read finance_transactions
    st, data = api("GET", "/rest/v1/finance_transactions?select=id&limit=1", token=admin_jwt, key=ANON)
    check("admin CAN read finance_transactions (RLS intact)", isinstance(data, list) and len(data) >= 1, f"status={st}")
    # Worker can still read claims
    worker_id, worker_jwt = create_test_user(f"p9b_worker_{ts}@test.app", pw, "worker", "Test Worker")
    st, data = api("GET", f"/rest/v1/claims?id=eq.{claim1}&select=id", token=worker_jwt, key=ANON)
    check("worker CAN read claims (RLS intact)", isinstance(data, list) and len(data) >= 1, f"status={st}")

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
