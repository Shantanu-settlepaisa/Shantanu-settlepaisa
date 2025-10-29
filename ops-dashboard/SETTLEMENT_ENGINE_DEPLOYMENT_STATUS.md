# Settlement Engine Deployment Status - AWS Staging

**Date**: October 6, 2025  
**Environment**: AWS Staging  
**Status**: ⚠️ Partially Complete

---

## ✅ **What's Working**

### **1. Database Layer - COMPLETE**
- ✅ All 5 migrations deployed successfully
- ✅ 376 webhook transactions migrated to sp_v2_transactions
- ✅ FK constraint on settlement_items working
- ✅ WEBHOOK source_type enabled
- ✅ SUCCESS status enabled
- ✅ 319 webhook transactions ready for settlement (₹84,048.08)

**Verification:**
```sql
-- Total transactions: 1,181
-- Webhook transactions: 376
-- Settlement-ready: 747 (428 RECONCILED + 319 SUCCESS)
```

### **2. Settlement API Service - RUNNING**
- ✅ Deployed to EC2: `/home/ec2-user/services/settlement-engine/`
- ✅ Running on PM2 as `settlement-api` (port 5111)
- ✅ Environment variables configured for RDS
- ✅ Health endpoint working: `http://localhost:5111/api/health`

**PM2 Status:**
```
┌────┬───────────────────┬────────┬───────────┐
│ id │ name              │ uptime │ status    │
├────┼───────────────────┼────────┼───────────┤
│ 3  │ settlement-api    │ 5m     │ online    │
│ 1  │ overview-api      │ 25m    │ online    │
│ 2  │ recon-api         │ 25m    │ online    │
│ 0  │ upload-api        │ 4h     │ online    │
└────┴───────────────────┴────────┴───────────┘
```

### **3. Working Endpoints**

**✅ Health Check**
```bash
curl http://localhost:5111/api/health
# Returns: { status: 'healthy', service: 'settlement-engine' }
```

**✅ Get Settlement Batches**
```bash
curl http://localhost:5111/api/settlement-batches
# Returns: 50 existing settlement batches
```

---

## ⚠️ **What's Not Working Yet**

### **1. Settlement Processing**

**Issue**: Type mismatch between sp_v2_transactions and sp_v2_settlement_items

**Error:**
```
operator does not exist: bigint = uuid
```

**Root Cause:**
- `sp_v2_transactions.id` is **BIGSERIAL** (auto-increment bigint)
- Settlement calculator tries to query using UUID comparisons
- The code was written for the old schema where IDs were UUIDs

**Impact:**
- ❌ Cannot process new settlement batches
- ❌ Pending transactions endpoint fails
- ✅ Can VIEW existing batches (50 found)

### **2. External Access**

**Issue**: Port 5111 not open in EC2 security group

**Current State:**
- ✅ Service accessible from EC2 instance (localhost:5111)
- ❌ Not accessible externally (13.201.179.44:5111)

**To Fix**: Add inbound rule in security group for port 5111

---

## 📋 **Files Deployed to EC2**

**Location**: `/home/ec2-user/services/settlement-engine/`

| File | Status | Purpose |
|------|--------|---------|
| settlement-api.cjs | ✅ Deployed | HTTP API server |
| settlement-calculator.cjs | ✅ Deployed | Settlement calculation logic |
| settlement-scheduler.cjs | ✅ Deployed | Cron scheduler (not started yet) |
| package.json | ✅ Deployed | Dependencies |
| .env | ✅ Deployed | RDS connection config |
| node_modules/ | ✅ Installed | 88 packages including dotenv |

**Environment Variables (.env):**
```bash
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432
NODE_ENV=production
PORT=5111
```

---

## 🔧 **What Needs to Be Fixed**

### **Priority 1: Fix Type Mismatches**

The settlement-calculator.cjs needs to be updated to:
1. Use `transaction_id` (VARCHAR) instead of `id` (BIGINT) for joins
2. Update all queries to match the new schema
3. Remove UUID-specific logic

**Example Fix Needed:**
```javascript
// OLD (broken):
WHERE id NOT IN (...)

// NEW (should be):
WHERE transaction_id NOT IN (...)
```

### **Priority 2: Test Full Settlement Flow**

Once type fixes are done:
1. Test `POST /api/pending-transactions`
2. Test `POST /api/process-settlements`
3. Verify webhook transactions get settled
4. Check settlement_items FK works correctly

### **Priority 3: Security Group Update**

Add inbound rule to EC2 security group:
- Type: Custom TCP
- Port: 5111
- Source: 0.0.0.0/0 (or restrict to dashboard IPs)
- Description: Settlement API

---

## 📊 **Current State Summary**

### **Database**
```
sp_v2_transactions: 1,181 rows
├─ MANUAL_UPLOAD: 755
├─ API_SYNC: 50
└─ WEBHOOK: 376 ✅ (NEW!)

Settleable transactions: 747
├─ RECONCILED: 428
└─ SUCCESS: 319 ✅ (webhooks)

sp_v2_settlement_batches: 50 existing batches
```

### **Services**
```
✅ overview-api (5108) - Running
✅ recon-api (5103) - Running  
✅ upload-api (5109) - Running
✅ settlement-api (5111) - Running but partially functional
```

### **Functionality**
```
✅ View existing settlements
✅ Database migrations
✅ Webhook data migration
⚠️ Create new settlements (type mismatch)
⚠️ Process pending transactions (type mismatch)
❌ External API access (security group)
```

---

## 🎯 **Next Steps**

### **Immediate (to make fully functional):**

1. **Fix settlement-calculator.cjs**
   - Update queries to use `transaction_id` instead of `id`
   - Test locally first
   - Deploy fixed version to EC2

2. **Test settlement processing**
   ```bash
   # Should work after fix:
   curl -X POST http://localhost:5111/api/process-settlements
   ```

3. **Open security group port 5111**
   - EC2 → Security Groups → Add inbound rule
   - Test external access

### **Future Enhancements:**

4. **Start settlement scheduler** (automated daily settlements)
   ```bash
   pm2 start settlement-scheduler.cjs --name settlement-scheduler
   ```

5. **Add settlement endpoints to frontend**
   - Update ops dashboard to call port 5111
   - Add "Process Settlement" button
   - Show real-time settlement status

6. **Monitor and optimize**
   - Set up CloudWatch alarms
   - Monitor PM2 logs
   - Track settlement success rate

---

## 🔗 **URLs Summary**

### **Staging URLs**
- **Ops Dashboard**: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com
- **Merchant Dashboard**: http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com

### **Backend APIs (Internal)**
- **Overview API**: http://13.201.179.44:5108
- **Recon API**: http://13.201.179.44:5103
- **Upload API**: http://13.201.179.44:5109
- **Settlement API**: http://13.201.179.44:5111 ⚠️ (not publicly accessible yet)

### **Database**
- **RDS**: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432
- **Database**: settlepaisa_v2

---

## 📞 **Quick Commands**

### **EC2 Access**
```bash
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44
```

### **Check Service Status**
```bash
pm2 status
pm2 logs settlement-api --lines 50
```

### **Test Settlement API**
```bash
# Health check
curl http://localhost:5111/api/health | jq

# Get batches
curl http://localhost:5111/api/settlement-batches | jq '.success, .count'

# Pending transactions (currently failing)
curl http://localhost:5111/api/pending-transactions?limit=10 | jq
```

### **Restart Services**
```bash
pm2 restart settlement-api
pm2 restart all
```

---

## ✅ **Success Criteria**

For deployment to be considered **complete**, these must all work:

- [x] Database migrations deployed
- [x] Webhook transactions migrated
- [x] Settlement API running on PM2
- [x] Health endpoint working
- [x] Get batches endpoint working
- [ ] Process settlements working ⚠️ (type mismatch)
- [ ] Pending transactions working ⚠️ (type mismatch)
- [ ] External access enabled ⚠️ (security group)
- [ ] End-to-end settlement test passed

**Current Progress**: 5/9 (56%)

---

## 🐛 **Known Issues**

1. **Type Mismatch in Settlement Calculator**
   - Severity: High
   - Impact: Cannot create new settlements
   - Status: Identified, fix pending

2. **Port 5111 Not Publicly Accessible**
   - Severity: Medium
   - Impact: Dashboard cannot call settlement API directly
   - Status: Security group update needed

3. **Settlement Scheduler Not Started**
   - Severity: Low
   - Impact: No automated settlements (manual trigger only)
   - Status: Intentional (waiting for fixes)

---

**Deployment Progress**: ⚠️ **56% Complete**

**Next Action**: Fix settlement-calculator.cjs type mismatches

**Deployed By**: Claude Code  
**Deployment Time**: October 6, 2025, 10:50 PM IST
