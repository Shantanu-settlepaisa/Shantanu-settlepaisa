# Deploy Webhook Settlement to AWS Staging

**Date**: October 6, 2025  
**Version**: 2.27.0  
**Changes**: Webhook Settlement Integration

---

## 📋 Pre-Deployment Checklist

- [x] Code committed and pushed to GitHub ✅
- [x] Tested locally (12 webhooks settled) ✅
- [ ] RDS PostgreSQL accessible
- [ ] EC2 instance accessible
- [ ] Backup RDS database

---

## 🎯 What's Being Deployed

### **1. Database Migrations (5 files)**
- `019_add_settlement_items_fk.sql` - FK constraint
- `020_extend_transactions_for_webhooks.sql` - Schema extension
- `020b_add_webhook_source_type.sql` - WEBHOOK source type
- `020c_add_success_status.sql` - SUCCESS status
- `021_migrate_webhooks_to_v2.sql` - Migrate 376 webhooks

### **2. Backend Code (2 files)**
- `services/settlement-engine/settlement-scheduler.cjs`
- `services/settlement-engine/settlement-calculator.cjs`

---

## 🚀 Deployment Steps

### **Step 1: Connect to EC2**

```bash
# From your Mac
ssh -i ~/.ssh/settlepaisa-staging.pem ec2-user@13.201.179.44
```

---

### **Step 2: Backup RDS Database**

```bash
# On EC2 instance
pg_dump -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f ~/backup_before_webhook_settlement_$(date +%Y%m%d_%H%M%S).sql

echo "✅ Backup created at ~/backup_before_webhook_settlement_*.sql"
```

---

### **Step 3: Deploy Database Migrations**

```bash
# On EC2 instance
cd ~/ops-dashboard

# Pull latest code
git pull origin feat/ops-dashboard-exports

# Run migrations in order
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/019_add_settlement_items_fk.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/020_extend_transactions_for_webhooks.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/020b_add_webhook_source_type.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/020c_add_success_status.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f db/migrations/021_migrate_webhooks_to_v2.sql

echo "✅ All migrations completed"
```

---

### **Step 4: Verify Migrations**

```bash
# Check FK constraint exists
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT conname FROM pg_constraint WHERE conname = 'fk_settlement_items_transaction';"

# Check WEBHOOK source type allowed
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sp_v2_transactions_source_type_check';"

# Check SUCCESS status allowed
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sp_v2_transactions_status_check';"

echo "✅ Migration verification complete"
```

---

### **Step 5: Deploy Backend Code**

```bash
# On EC2 instance
cd ~/ops-dashboard

# Ensure latest code is pulled
git pull origin feat/ops-dashboard-exports

# Restart settlement services using PM2
pm2 restart settlement-scheduler 2>/dev/null || echo "Settlement scheduler not running"
pm2 restart settlement-calculator 2>/dev/null || echo "Settlement calculator not running"

# If services don't exist, they'll be started by the main API
pm2 restart all

echo "✅ Backend services restarted"
```

---

### **Step 6: Verify Services Running**

```bash
# Check PM2 status
pm2 status

# Check settlement scheduler
curl -s http://localhost:5108/api/settlement/health || echo "No dedicated endpoint"

# Check logs for errors
pm2 logs --lines 20 --nostream
```

---

### **Step 7: Add Webhook Merchant Config (If Needed)**

```bash
# Only if staging has webhook data
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "INSERT INTO sp_v2_merchant_master (merchant_id, merchant_name, is_active, rolling_reserve_enabled, rolling_reserve_percentage, settlement_cycle) 
      VALUES ('550e8400-e29b-41d4-a716-446655440001', 'Webhook Test Merchant', true, true, 4.00, 1) 
      ON CONFLICT (merchant_id) DO UPDATE SET is_active = true, merchant_name = 'Webhook Test Merchant';"

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "INSERT INTO sp_v2_merchant_settlement_config (merchant_id, merchant_name, settlement_frequency, settlement_day, auto_settle, min_settlement_amount_paise, is_active) 
      VALUES ('550e8400-e29b-41d4-a716-446655440001', 'Webhook Test Merchant', 'daily', 0, false, 0, true) 
      ON CONFLICT (merchant_id) DO UPDATE SET is_active = true;"

echo "✅ Webhook merchant configuration added"
```

---

### **Step 8: Test Settlement on Staging**

```bash
# Check unsettled transactions
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT status, COUNT(*) as count, SUM(amount_paise)/100 as total_rupees 
      FROM sp_v2_transactions 
      WHERE status IN ('RECONCILED', 'SUCCESS') 
        AND settlement_batch_id IS NULL 
      GROUP BY status;"

# Run settlement manually (if settlement API exists)
curl -X POST http://localhost:5108/api/settlement/run \
  -H "Content-Type: application/json" \
  -d '{"fromDate": "2025-10-01", "toDate": "2025-10-06"}' || echo "Manual trigger not available"
```

---

### **Step 9: Verify on Staging UI**

1. **Open Ops Dashboard:**
   ```
   http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com/ops/settlement-pipeline
   ```

2. **Check for:**
   - Settlement batches list
   - Webhook transactions in batches
   - Source type = WEBHOOK
   - Status = SUCCESS

---

### **Step 10: Monitor Logs**

```bash
# Watch PM2 logs for errors
pm2 logs --lines 50

# Check for settlement errors
grep -i "settlement" ~/.pm2/logs/*.log | tail -20

# Check for webhook errors  
grep -i "webhook" ~/.pm2/logs/*.log | tail -20
```

---

## 🔍 Post-Deployment Verification

### **1. Check Data in RDS**

```bash
# Total transactions in sp_v2_transactions
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT source_type, COUNT(*) as count FROM sp_v2_transactions GROUP BY source_type;"

# Check FK constraint
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT COUNT(*) FROM sp_v2_settlement_items;"
```

### **2. Test Settlement API**

```bash
# Check if settlement endpoint responds
curl http://13.201.179.44:5108/api/settlement/batches | jq

# Check settlement items endpoint
curl http://13.201.179.44:5108/api/settlement/batches/[BATCH_ID]/items | jq
```

### **3. UI Verification**

- [ ] Ops dashboard loads without errors
- [ ] Settlement batches display
- [ ] Webhook transactions show in settlement items
- [ ] Source type column shows "WEBHOOK"
- [ ] Status column shows "SUCCESS"

---

## 🐛 Troubleshooting

### **Issue: Migrations Fail**

```bash
# Check RDS connection
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT version();"

# Restore from backup if needed
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f ~/backup_before_webhook_settlement_*.sql
```

### **Issue: Services Won't Restart**

```bash
# Check PM2 status
pm2 status

# Restart individual service
pm2 restart [service-name]

# Check logs for errors
pm2 logs [service-name] --lines 50
```

### **Issue: No Webhook Transactions**

```bash
# Check if staging has webhook data
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = 'WEBHOOK';"

# If zero, migration 021 might not have run or staging has no webhook data
```

---

## 📊 Success Criteria

- [ ] All 5 migrations executed successfully
- [ ] FK constraint created
- [ ] WEBHOOK source_type allowed
- [ ] SUCCESS status allowed
- [ ] Backend services restarted without errors
- [ ] PM2 logs show no errors
- [ ] UI displays settlement batches
- [ ] Webhook transactions visible in settlement items
- [ ] Settlement calculator processes SUCCESS status

---

## 🔄 Rollback Plan

If deployment fails:

```bash
# 1. Restore database from backup
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f ~/backup_before_webhook_settlement_*.sql

# 2. Rollback code
cd ~/ops-dashboard
git checkout [previous-commit-hash]

# 3. Restart services
pm2 restart all

# 4. Verify rollback
curl http://localhost:5108/health
```

---

## 📞 Quick Reference

**EC2 Instance:**
- IP: 13.201.179.44
- SSH: `ssh -i ~/.ssh/settlepaisa-staging.pem ec2-user@13.201.179.44`

**RDS PostgreSQL:**
- Endpoint: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
- Port: 5432
- Database: settlepaisa_v2

**Staging URLs:**
- Ops Dashboard: http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com
- Merchant Dashboard: http://merchant-dashboard-staging.s3-website.ap-south-1.amazonaws.com

**Backend Services:**
- Overview API: http://13.201.179.44:5108
- Recon API: http://13.201.179.44:5103
- Merchant API: http://13.201.179.44:8080
