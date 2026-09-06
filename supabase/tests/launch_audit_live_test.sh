#!/bin/bash
# Live production test for the worker/admin account creation flow.
# Uses GoTrue Admin API with properly formatted headers.
set -euo pipefail

source /run/base44/app.env 2>/dev/null

SUPABASE_URL="$VITE_SUPABASE_URL"
ANON_KEY="$VITE_SUPABASE_ANON_KEY"
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

TS=$(date +%s)
ADMIN_EMAIL="cv-audit-${TS}-admin@claimvelo.com"
ADMIN_PASS="LaunchTest2026!Secure"
WORKER_EMAIL="cv-audit-${TS}-worker@claimvelo.com"
WORKER_EMAIL_2="cv-audit-${TS}-admin2@claimvelo.com"
CUSTOMER_EMAIL="cv-audit-${TS}-customer@claimvelo.com"
CUSTOMER_PASS="LaunchTest2026!Secure"
ESC_EMAIL="cv-audit-${TS}-esc@claimvelo.com"

# Header arrays (properly quoted to preserve spaces in "Bearer KEY")
AUTH_H=("-H" "apikey: $ANON_KEY" "-H" "Authorization: Bearer $SERVICE_KEY" "-H" "Content-Type: application/json")
REST_H=("-H" "apikey: $SERVICE_KEY" "-H" "Authorization: Bearer $SERVICE_KEY" "-H" "Content-Type: application/json")

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=""

check() {
  local name="$1" condition="$2"
  if [ "$condition" = "true" ]; then
    RESULTS+="✅ PASS: $name\n"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    RESULTS+="❌ FAIL: $name\n"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ── Cleanup leftover test users ─────────────────────────────────────────────
echo "Cleaning up leftover test users..."
ALL_USERS=$(curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" "${AUTH_H[@]}")
TEST_IDS=$(echo "$ALL_USERS" | jq -r '.users[]? | select(.email | test("cv-audit-|cv-launch-test|cv-esc-test|cv-debug-test")) | .id' 2>/dev/null || true)
for uid in $TEST_IDS; do
  curl -s -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$uid" "${AUTH_H[@]}" >/dev/null 2>&1 || true
done
curl -s -X DELETE "$SUPABASE_URL/rest/v1/profiles?email=like.cv-audit-*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/worker_profiles?email=like.cv-audit-*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/profiles?email=like.cv-launch-test*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/worker_profiles?email=like.cv-launch-test*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/profiles?email=like.cv-esc-test*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/worker_profiles?email=like.cv-esc-test*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/profiles?email=like.cv-debug-test*" "${REST_H[@]}" >/dev/null 2>&1 || true
echo "Cleanup done."
echo ""

# ── 1. Create test admin auth user ──────────────────────────────────────────
echo "1. Creating test admin auth user..."
ADMIN_CREATE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" "${AUTH_H[@]}" \
  -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASS\", \"email_confirm\": true}")
ADMIN_ID=$(echo "$ADMIN_CREATE" | jq -r '.id // empty')
check "Admin auth user created" "$([ -n "$ADMIN_ID" ] && echo true || echo false)"
echo "   Admin ID: $ADMIN_ID"

# ── 2. Create admin profile with role=admin ─────────────────────────────────
echo "2. Creating admin profile..."
PROFILE_RES=$(curl -s -X POST "$SUPABASE_URL/rest/v1/profiles" "${REST_H[@]}" \
  -d "{\"id\": \"$ADMIN_ID\", \"role\": \"admin\", \"full_name\": \"Test Admin\", \"email\": \"$ADMIN_EMAIL\"}")
check "Admin profile created (role=admin)" "$(echo "$PROFILE_RES" | jq -e '.code' >/dev/null 2>&1 && echo false || echo true)"

# ── 3. Sign in as admin to get JWT ───────────────────────────────────────────
echo "3. Signing in as admin..."
SIGNIN_RES=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASS\"}")
ADMIN_JWT=$(echo "$SIGNIN_RES" | jq -r '.access_token // empty')
check "Admin sign-in (JWT obtained)" "$([ -n "$ADMIN_JWT" ] && echo true || echo false)"

# ── 4. Admin creates a Worker via send-welcome-email ─────────────────────────
echo "4. Admin creating worker via send-welcome-email..."
WORKER_RES=$(curl -s -w "\nHTTP_STATUS=%{http_code}" -X POST "$SUPABASE_URL/functions/v1/send-welcome-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d "{\"email\": \"$WORKER_EMAIL\", \"fullName\": \"Test Worker\", \"role\": \"worker\"}")
WORKER_HTTP=$(echo "$WORKER_RES" | tail -1 | sed 's/HTTP_STATUS=//')
WORKER_BODY=$(echo "$WORKER_RES" | head -n -1)
WORKER_OK=$(echo "$WORKER_BODY" | jq -r '.ok // false')
WORKER_USER_ID=$(echo "$WORKER_BODY" | jq -r '.userId // empty')
check "send-welcome-email returns ok=true (HTTP $WORKER_HTTP)" "$([ "$WORKER_OK" = "true" ] && [ "$WORKER_HTTP" = "200" ] && echo true || echo false)"
echo "   Response: $WORKER_BODY"

# ── 5. Verify auth user was created ──────────────────────────────────────────
echo "5. Verifying worker auth user exists..."
WORKER_AUTH=$(curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" "${AUTH_H[@]}")
WORKER_AUTH_ID=$(echo "$WORKER_AUTH" | jq -r ".users[]? | select(.email == \"$WORKER_EMAIL\") | .id" 2>/dev/null || true)
check "Worker auth user created in Supabase Auth" "$([ -n "$WORKER_AUTH_ID" ] && echo true || echo false)"

# ── 6. Verify profiles row with correct role ────────────────────────────────
echo "6. Verifying worker profiles row..."
WORKER_PROFILE=$(curl -s "$SUPABASE_URL/rest/v1/profiles?email=eq.$WORKER_EMAIL" "${REST_H[@]}")
WORKER_PROFILE_ROLE=$(echo "$WORKER_PROFILE" | jq -r '.[0].role // empty')
check "Worker profiles row exists with role=worker" "$([ "$WORKER_PROFILE_ROLE" = "worker" ] && echo true || echo false)"
echo "   Profile role: $WORKER_PROFILE_ROLE"

# ── 7. Verify worker_profiles row ───────────────────────────────────────────
echo "7. Verifying worker_profiles row..."
WORKER_WP=$(curl -s "$SUPABASE_URL/rest/v1/worker_profiles?email=eq.$WORKER_EMAIL" "${REST_H[@]}")
WORKER_WP_ROLE=$(echo "$WORKER_WP" | jq -r '.[0].role // empty')
WORKER_WP_USER_ID=$(echo "$WORKER_WP" | jq -r '.[0].user_id // empty')
check "worker_profiles row exists with role=worker" "$([ "$WORKER_WP_ROLE" = "worker" ] && echo true || echo false)"
check "worker_profiles.user_id linked to auth user" "$([ -n "$WORKER_WP_USER_ID" ] && echo true || echo false)"
echo "   worker_profiles role: $WORKER_WP_ROLE, user_id: $WORKER_WP_USER_ID"

# ── 8. Test duplicate email rejection ───────────────────────────────────────
echo "8. Testing duplicate email rejection..."
DUP_RES=$(curl -s -w "\nHTTP_STATUS=%{http_code}" -X POST "$SUPABASE_URL/functions/v1/send-welcome-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d "{\"email\": \"$WORKER_EMAIL\", \"fullName\": \"Duplicate\", \"role\": \"worker\"}")
DUP_HTTP=$(echo "$DUP_RES" | tail -1 | sed 's/HTTP_STATUS=//')
DUP_BODY=$(echo "$DUP_RES" | head -n -1)
DUP_ERR=$(echo "$DUP_BODY" | jq -r '.error // empty')
check "Duplicate email rejected (HTTP $DUP_HTTP)" "$([ "$DUP_HTTP" = "409" ] && echo true || echo false)"
echo "   Error: $DUP_ERR"

# ── 9. Test non-admin cannot create worker ───────────────────────────────────
echo "9. Testing non-admin rejection..."
CUST_CREATE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" "${AUTH_H[@]}" \
  -d "{\"email\": \"$CUSTOMER_EMAIL\", \"password\": \"$CUSTOMER_PASS\", \"email_confirm\": true}")
CUST_ID=$(echo "$CUST_CREATE" | jq -r '.id // empty')
curl -s -X POST "$SUPABASE_URL/rest/v1/profiles" "${REST_H[@]}" \
  -d "{\"id\": \"$CUST_ID\", \"role\": \"customer\", \"full_name\": \"Test Customer\", \"email\": \"$CUSTOMER_EMAIL\"}" >/dev/null 2>&1
CUST_SIGNIN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\": \"$CUSTOMER_EMAIL\", \"password\": \"$CUSTOMER_PASS\"}")
CUST_JWT=$(echo "$CUST_SIGNIN" | jq -r '.access_token // empty')
FORBIDDEN_RES=$(curl -s -w "\nHTTP_STATUS=%{http_code}" -X POST "$SUPABASE_URL/functions/v1/send-welcome-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CUST_JWT" \
  -d "{\"email\": \"$ESC_EMAIL\", \"fullName\": \"Should Fail\", \"role\": \"worker\"}")
FORBIDDEN_HTTP=$(echo "$FORBIDDEN_RES" | tail -1 | sed 's/HTTP_STATUS=//')
check "Non-admin (customer) rejected with 403 (HTTP $FORBIDDEN_HTTP)" "$([ "$FORBIDDEN_HTTP" = "403" ] && echo true || echo false)"

# ── 10. Test admin role creation ─────────────────────────────────────────────
echo "10. Testing admin role creation via send-welcome-email..."
ADMIN2_RES=$(curl -s -w "\nHTTP_STATUS=%{http_code}" -X POST "$SUPABASE_URL/functions/v1/send-welcome-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d "{\"email\": \"$WORKER_EMAIL_2\", \"fullName\": \"Test Admin 2\", \"role\": \"admin\"}")
ADMIN2_HTTP=$(echo "$ADMIN2_RES" | tail -1 | sed 's/HTTP_STATUS=//')
ADMIN2_BODY=$(echo "$ADMIN2_RES" | head -n -1)
ADMIN2_OK=$(echo "$ADMIN2_BODY" | jq -r '.ok // false')
check "Admin role creation via send-welcome-email (HTTP $ADMIN2_HTTP)" "$([ "$ADMIN2_OK" = "true" ] && [ "$ADMIN2_HTTP" = "200" ] && echo true || echo false)"
ADMIN2_PROFILE=$(curl -s "$SUPABASE_URL/rest/v1/profiles?email=eq.$WORKER_EMAIL_2" "${REST_H[@]}")
ADMIN2_ROLE=$(echo "$ADMIN2_PROFILE" | jq -r '.[0].role // empty')
check "Admin2 profiles row has role=admin" "$([ "$ADMIN2_ROLE" = "admin" ] && echo true || echo false)"

# ── 11. Test privilege escalation prevention (super_admin) ───────────────────
echo "11. Testing privilege escalation prevention..."
ESC_RES=$(curl -s -w "\nHTTP_STATUS=%{http_code}" -X POST "$SUPABASE_URL/functions/v1/send-welcome-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d "{\"email\": \"$ESC_EMAIL\", \"fullName\": \"Escalation\", \"role\": \"super_admin\"}")
ESC_HTTP=$(echo "$ESC_RES" | tail -1 | sed 's/HTTP_STATUS=//')
check "super_admin role rejected (HTTP $ESC_HTTP)" "$([ "$ESC_HTTP" = "400" ] && echo true || echo false)"

# ── Cleanup ─────────────────────────────────────────────────────────────────
echo ""
echo "Cleaning up test data..."
ALL_USERS=$(curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" "${AUTH_H[@]}")
TEST_IDS=$(echo "$ALL_USERS" | jq -r ".users[]? | select(.email | startswith(\"cv-audit-$TS\")) | .id" 2>/dev/null || true)
for uid in $TEST_IDS; do
  curl -s -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$uid" "${AUTH_H[@]}" >/dev/null 2>&1 || true
done
curl -s -X DELETE "$SUPABASE_URL/rest/v1/profiles?email=like.cv-audit-$TS*" "${REST_H[@]}" >/dev/null 2>&1 || true
curl -s -X DELETE "$SUPABASE_URL/rest/v1/worker_profiles?email=like.cv-audit-$TS*" "${REST_H[@]}" >/dev/null 2>&1 || true
echo "Cleanup done."

# ── Results ─────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "LIVE TEST RESULTS"
echo "=========================================="
echo -e "$RESULTS"
echo ""
echo "Total: $((PASS_COUNT + FAIL_COUNT)) | PASS: $PASS_COUNT | FAIL: $FAIL_COUNT"
echo "=========================================="
