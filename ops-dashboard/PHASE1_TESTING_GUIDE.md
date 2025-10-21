# Phase 1 Testing Guide: Production Readiness
**Date**: October 21, 2025
**Purpose**: Test authentication, audit logging, and database migrations
**Prerequisites**: Docker PostgreSQL running on localhost:5433

---

## Table of Contents
1. [Setup & Prerequisites](#setup--prerequisites)
2. [Database Migration Testing](#database-migration-testing)
3. [Install Required Dependencies](#install-required-dependencies)
4. [Authentication API Testing](#authentication-api-testing)
5. [Protected Endpoints Testing](#protected-endpoints-testing)
6. [Audit Log Testing](#audit-log-testing)
7. [Security Testing](#security-testing)
8. [Performance Testing](#performance-testing)
9. [Troubleshooting](#troubleshooting)

---

## Setup & Prerequisites

### 1. Verify PostgreSQL is Running
```bash
# Check if Docker container is running
docker ps | grep ops-postgres-v2

# If not running, start it
docker-compose up -d ops-postgres-v2

# Verify connection
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c "SELECT version();"
```

### 2. Set Environment Variables
```bash
# Create .env file for overview-api
cd services/overview-api
cp .env.example .env

# Edit .env with these values:
# DB_HOST=localhost
# DB_PORT=5433
# DB_NAME=settlepaisa_v2
# DB_USER=postgres
# DB_PASSWORD=settlepaisa123
# JWT_SECRET=phase1-test-secret-change-in-production
# PORT=5108
```

---

## Database Migration Testing

### 1. Run Migration 025: Settlement Type Column
```bash
cd /Users/shantanusingh/ops-dashboard

# Apply migration
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -f db/migrations/025_add_settlement_type.sql
```

**Expected Output:**
```
🔧 Migration 025: Adding settlement_type column...
✅ Added settlement_type column
✅ Added priority column
✅ Migration 025 completed successfully!
```

**Verify:**
```sql
-- Check column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sp_v2_settlement_batches'
  AND column_name IN ('settlement_type', 'priority');
```

**Expected Result:**
```
  column_name   | data_type | column_default
-----------------+-----------+---------------
 settlement_type | varchar   | 'automatic'
 priority        | integer   | 0
```

---

### 2. Run Migration 026: User Management Tables
```bash
# Apply migration
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -f db/migrations/026_user_management.sql
```

**Expected Output:**
```
🔧 Migration 026: Creating user management tables...
👤 Default admin user created: admin@settlepaisa.com / Admin@123
⚠️  IMPORTANT: Change this password immediately after first login!
✅ Migration 026 completed successfully!
```

**Verify Tables Created:**
```sql
-- Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name IN (
  'sp_v2_ops_users',
  'sp_v2_user_sessions',
  'sp_v2_user_permissions',
  'sp_v2_login_attempts'
)
ORDER BY table_name;
```

**Expected Result:**
```
        table_name
---------------------------
 sp_v2_login_attempts
 sp_v2_ops_users
 sp_v2_user_permissions
 sp_v2_user_sessions
```

**Verify Default Admin User:**
```sql
SELECT email, full_name, role, is_active, email_verified
FROM sp_v2_ops_users
WHERE email = 'admin@settlepaisa.com';
```

**Expected Result:**
```
        email            |     full_name        | role  | is_active | email_verified
-------------------------+---------------------+-------+-----------+----------------
 admin@settlepaisa.com   | System Administrator | ADMIN | true      | true
```

---

### 3. Run Migration 027: Audit Log
```bash
# Apply migration
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -f db/migrations/027_audit_log.sql
```

**Expected Output:**
```
🔧 Migration 027: Creating audit log table...
✅ Migration 027 completed successfully!
```

**Verify:**
```sql
-- Check table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'sp_v2_ops_audit_log';

-- Check views exist
SELECT table_name
FROM information_schema.views
WHERE table_name LIKE 'vw_%audit%';

-- Check function exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'log_audit_action';
```

---

### 4. Run Migration 028: Production Indexes
```bash
# Apply migration
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -f db/migrations/028_production_indexes.sql
```

**Expected Output:**
```
🔧 Migration 028: Creating production performance indexes...
✅ Created transaction table indexes
✅ Created settlement batch indexes
✅ Created exception workflow indexes
✅ Migration 028 completed successfully!

Expected performance improvements:
  📊 Dashboard overview page: 5-10x faster
  💰 Settlement list page: 3-5x faster
  ⚠️  Exception dashboard: 4-8x faster
```

**Verify Indexes:**
```sql
-- List all new indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename LIKE 'sp_v2_%'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

---

## Install Required Dependencies

```bash
cd /Users/shantanusingh/ops-dashboard/services/overview-api

# Install new dependencies
npm install bcryptjs jsonwebtoken winston
```

**Verify installation:**
```bash
npm list bcryptjs jsonwebtoken winston
```

---

## Authentication API Testing

### 1. Start Overview API
```bash
cd /Users/shantanusingh/ops-dashboard/services/overview-api

# Start the server
node index.js
```

**Expected Output:**
```
[Overview API] Server running on port 5108
[Settlement Pipeline] Checking database initialization...
[Settlement Pipeline] Database ready
```

---

### 2. Test Health Check (Public Route)
```bash
curl -X GET http://localhost:5108/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "overview-api",
  "port": 5108
}
```

---

### 3. Test Login with Default Admin
```bash
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@settlepaisa.com",
    "password": "Admin@123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2025-10-21T16:00:00.000Z",
    "user": {
      "id": "uuid-here",
      "email": "admin@settlepaisa.com",
      "full_name": "System Administrator",
      "role": "ADMIN"
    }
  }
}
```

**Save the token:**
```bash
# In bash, save to variable
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4. Test Login with Wrong Password
```bash
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@settlepaisa.com",
    "password": "WrongPassword"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

---

### 5. Test User Registration (Admin Only)
```bash
curl -X POST http://localhost:5108/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "ops.manager@settlepaisa.com",
    "password": "OpsManager@123",
    "full_name": "Operations Manager",
    "role": "OPS_MANAGER"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "ops.manager@settlepaisa.com",
      "full_name": "Operations Manager",
      "role": "OPS_MANAGER",
      "is_active": true,
      "created_at": "2025-10-21T08:30:00.000Z"
    }
  }
}
```

---

### 6. Test Get Current User Info
```bash
curl -X GET http://localhost:5108/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "admin@settlepaisa.com",
      "full_name": "System Administrator",
      "role": "ADMIN",
      "is_active": true,
      "last_login_at": "2025-10-21T08:30:00.000Z"
    }
  }
}
```

---

### 7. Test Token Verification
```bash
curl -X POST http://localhost:5108/api/auth/verify-token \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$TOKEN\"
  }"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "uuid-here",
    "email": "admin@settlepaisa.com",
    "role": "ADMIN"
  }
}
```

---

### 8. Test Change Password
```bash
curl -X POST http://localhost:5108/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "currentPassword": "Admin@123",
    "newPassword": "NewAdmin@456"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password changed successfully. Please login again."
}
```

**Note:** After changing password, you'll need to login again with the new password.

---

### 9. Test Logout
```bash
curl -X POST http://localhost:5108/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Protected Endpoints Testing

### 1. Test Accessing Protected Route Without Token
```bash
curl -X GET http://localhost:5108/api/audit
```

**Expected Response:**
```json
{
  "success": false,
  "error": "No authentication token provided"
}
```

---

### 2. Test Accessing Protected Route With Invalid Token
```bash
curl -X GET http://localhost:5108/api/audit \
  -H "Authorization: Bearer invalid-token-here"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

---

### 3. Test Accessing Protected Route With Valid Token
First, login again to get a fresh token:
```bash
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@settlepaisa.com",
    "password": "NewAdmin@456"
  }'

# Save the new token
TOKEN="new-token-here"

# Now test audit API
curl -X GET http://localhost:5108/api/audit \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "logs": [],
    "pagination": {
      "total": 0,
      "limit": 100,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

## Audit Log Testing

### 1. Check Login Audit Logs
```bash
curl -X GET "http://localhost:5108/api/audit?action=LOGIN&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "user_id": "uuid-here",
        "user_email": "admin@settlepaisa.com",
        "user_role": "ADMIN",
        "action": "LOGIN",
        "action_category": null,
        "resource_type": "USER",
        "resource_id": "uuid-here",
        "created_at": "2025-10-21T08:30:00.000Z",
        "ip_address": "::1",
        "success": true
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 10,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

### 2. Check Failed Login Attempts
```bash
curl -X GET http://localhost:5108/api/audit/failed-logins \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "suspiciousAttempts": [],
    "allFailedAttempts": [
      {
        "user_email": "admin@settlepaisa.com",
        "ip_address": "::1",
        "attempt_time": "2025-10-21T08:25:00.000Z",
        "error_message": null
      }
    ]
  }
}
```

---

### 3. Check Audit Summary
```bash
curl -X GET http://localhost:5108/api/audit/summary \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_actions": 5,
      "unique_users": 1,
      "failed_actions": 1,
      "total_logins": 2,
      "failed_logins": 1,
      "settlement_actions": 0,
      "avg_duration_ms": null
    },
    "actionBreakdown": [
      { "action": "LOGIN", "count": 2, "failed_count": 0 },
      { "action": "USER_REGISTERED", "count": 1, "failed_count": 0 },
      { "action": "PASSWORD_CHANGED", "count": 1, "failed_count": 0 },
      { "action": "LOGOUT", "count": 1, "failed_count": 0 }
    ],
    "topUsers": [
      {
        "user_email": "admin@settlepaisa.com",
        "user_role": "ADMIN",
        "action_count": 5,
        "last_activity": "2025-10-21T08:35:00.000Z"
      }
    ]
  }
}
```

---

### 4. Check User Activity
```bash
# Get current user's audit trail
USER_ID="uuid-from-login-response"

curl -X GET "http://localhost:5108/api/audit/user/$USER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Security Testing

### 1. Test Password Strength Validation
```bash
# Try weak password
curl -X POST http://localhost:5108/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "test@settlepaisa.com",
    "password": "weak",
    "full_name": "Test User",
    "role": "OPS_VIEWER"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Password does not meet requirements",
  "details": [
    "Password must be at least 8 characters long",
    "Password must contain at least one uppercase letter",
    "Password must contain at least one number",
    "Password must contain at least one special character"
  ]
}
```

---

### 2. Test Account Lockout (Brute Force Protection)
```bash
# Try 5 failed login attempts
for i in {1..5}; do
  curl -X POST http://localhost:5108/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin@settlepaisa.com",
      "password": "WrongPassword"
    }'
  echo "\nAttempt $i"
done

# 6th attempt should be locked
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@settlepaisa.com",
    "password": "Admin@123"
  }'
```

**Expected Response (6th attempt):**
```json
{
  "success": false,
  "error": "Account is locked. Please try again later."
}
```

---

### 3. Test Session Revocation
```bash
# Login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@settlepaisa.com",
    "password": "NewAdmin@456"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')

# Use the token
curl -X GET http://localhost:5108/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
# Should work

# Logout
curl -X POST http://localhost:5108/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# Try using the same token again
curl -X GET http://localhost:5108/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (after logout):**
```json
{
  "success": false,
  "error": "Session has been revoked or expired",
  "code": "SESSION_REVOKED"
}
```

---

## Performance Testing

### 1. Test Index Performance
```sql
-- Run EXPLAIN ANALYZE on common queries

-- Dashboard overview query (should use idx_transactions_merchant_status_date)
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM sp_v2_transactions
WHERE merchant_id = 'MERCH001'
  AND status = 'RECONCILED'
  AND transaction_date >= '2025-10-01';

-- Settlement approval queue (should use idx_settlement_batches_approval_queue)
EXPLAIN ANALYZE
SELECT *
FROM sp_v2_settlement_batches
WHERE status = 'PENDING_APPROVAL'
ORDER BY net_amount_paise DESC, created_at
LIMIT 10;
```

**Expected:** Both queries should show "Index Scan" or "Bitmap Index Scan" in the plan.

---

### 2. Test Session Query Performance
```sql
-- Should use idx_user_sessions_active
EXPLAIN ANALYZE
SELECT *
FROM sp_v2_user_sessions
WHERE is_active = true
  AND expires_at > NOW();
```

---

## Troubleshooting

### Issue: Migration fails with "relation already exists"
**Solution:** Migrations are idempotent. If the table/column already exists, they skip creation. This is normal.

---

### Issue: Cannot connect to database
**Check:**
```bash
# Is Docker running?
docker ps

# Is PostgreSQL container running?
docker ps | grep ops-postgres-v2

# Can you connect?
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2 -c "SELECT 1;"
```

---

### Issue: "Module not found" errors
**Solution:**
```bash
cd services/overview-api
npm install bcryptjs jsonwebtoken winston
```

---

### Issue: JWT token expired
**Solution:** Login again to get a fresh token. Default expiry is 8 hours.

---

### Issue: Account locked after failed attempts
**Solution:** Wait 30 minutes or unlock manually:
```sql
UPDATE sp_v2_ops_users
SET failed_login_attempts = 0, locked_until = NULL
WHERE email = 'admin@settlepaisa.com';
```

---

## Verification Checklist

After completing all tests, verify:

- [ ] All 4 migrations ran successfully
- [ ] Default admin user can login
- [ ] JWT tokens are generated correctly
- [ ] Protected routes reject requests without tokens
- [ ] Protected routes accept valid tokens
- [ ] Audit logs capture all actions
- [ ] Password strength validation works
- [ ] Account lockout works after 5 failed attempts
- [ ] Session revocation works on logout
- [ ] All indexes are created
- [ ] Database queries use indexes (check with EXPLAIN ANALYZE)

---

## Next Steps

After Phase 1 is complete:

1. **Deploy to Staging**: Run all migrations on staging database
2. **Phase 2 Frontend**: Build login UI, user management, audit log viewer
3. **Phase 3 Security Audit**: Penetration testing, security review
4. **Production Deployment**: Final testing and go-live

---

## Success Criteria

Phase 1 is complete when:

✅ All database migrations run without errors
✅ Authentication API works (login, register, logout)
✅ JWT tokens are generated and validated
✅ Protected routes require authentication
✅ Audit logs capture all user actions
✅ Performance indexes are created
✅ Security features work (password strength, account lockout)
✅ All tests pass with expected responses

---

**Last Updated:** October 21, 2025
**Tested By:** _[Your Name]_
**Status:** Ready for Testing
