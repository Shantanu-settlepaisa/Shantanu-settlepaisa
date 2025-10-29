# End-to-End Reconciliation & Reports Testing - Tomorrow's Plan

**Date:** October 24, 2025
**Objective:** Verify complete automated workflow from file upload → reconciliation → settlement → all reports populated

---

## Pre-Test Checklist

### Environment Setup
- [ ] Start frontend dev server: `npm run dev -- --port 5174`
- [ ] Verify all backend services running:
  - [ ] Upload API (port 5109)
  - [ ] Recon API (port 5103)
  - [ ] Overview API (port 5108)
  - [ ] Settlement Queue Processor (PM2 on staging)
- [ ] Clear previous test data from staging database
- [ ] Verify database triggers are active:
  - [ ] `trg_transaction_status_change` (auto-settlement queue)
  - [ ] `trg_update_settlement_on_transfer` (batch status update)

### Test Data Preparation
- [ ] Create test PG transactions CSV (15-20 records)
  - [ ] Include matching UTRs with bank file
  - [ ] Include some non-matching UTRs (exceptions)
  - [ ] Mix of payment modes (UPI, CARD, NETBANKING)
  - [ ] Realistic amounts (₹500 - ₹5000)
- [ ] Create test Bank statements CSV (15-20 records)
  - [ ] Matching UTRs with PG file
  - [ ] Some bank-only UTRs (unmatched)
  - [ ] Same date range as PG file

---

## Test Execution Steps

### Phase 1: File Upload & Verification (15 mins)
- [ ] **Step 1.1:** Navigate to Recon Workspace (http://localhost:5174/ops/recon-workspace)
- [ ] **Step 1.2:** Upload PG transactions CSV
  - [ ] Monitor upload API logs: `tail -f /tmp/upload-api.log`
  - [ ] Verify success message in UI
  - [ ] Check database: `SELECT COUNT(*) FROM sp_v2_transactions WHERE created_at > NOW() - INTERVAL '5 minutes'`
- [ ] **Step 1.3:** Upload Bank statements CSV
  - [ ] Monitor upload API logs
  - [ ] Verify success message in UI
  - [ ] Check database: `SELECT COUNT(*) FROM sp_v2_bank_statements WHERE created_at > NOW() - INTERVAL '5 minutes'`
- [ ] **Step 1.4:** Screenshot uploaded files confirmation

**Expected Result:** Both files uploaded successfully, records in database

---

### Phase 2: Run Reconciliation (10 mins)
- [ ] **Step 2.1:** Click "Run Reconciliation" button in UI
- [ ] **Step 2.2:** Monitor recon-api logs: `ssh ec2-user@13.201.179.44 "pm2 logs recon-api --lines 50"`
- [ ] **Step 2.3:** Wait for job completion (should take 10-30 seconds)
- [ ] **Step 2.4:** Verify reconciliation results in database:
  ```sql
  SELECT
    match_status,
    COUNT(*)
  FROM sp_v2_reconciliation_results
  WHERE created_at > NOW() - INTERVAL '5 minutes'
  GROUP BY match_status;
  ```
  - [ ] Should show: MATCHED, UNMATCHED_PG, UNMATCHED_BANK, EXCEPTION counts
- [ ] **Step 2.5:** Verify transaction status updated:
  ```sql
  SELECT status, COUNT(*)
  FROM sp_v2_transactions
  WHERE created_at > NOW() - INTERVAL '5 minutes'
  GROUP BY status;
  ```
  - [ ] Should show some as 'RECONCILED'

**Expected Result:** Recon job completes, results populated, transactions marked RECONCILED

---

### Phase 3: Verify Database Triggers Fire (5 mins)
- [ ] **Step 3.1:** Check settlement queue populated:
  ```sql
  SELECT * FROM sp_v2_settlement_queue
  WHERE queued_at > NOW() - INTERVAL '5 minutes'
  ORDER BY queued_at DESC;
  ```
  - [ ] Should have entries with status = 'PENDING'
- [ ] **Step 3.2:** Monitor settlement-queue-processor logs:
  ```bash
  ssh ec2-user@13.201.179.44 "pm2 logs settlement-queue-processor --lines 100"
  ```
  - [ ] Should see: "Found X merchant batches ready for processing"
  - [ ] Should see: "Processing settlement batch for MERCH001"
- [ ] **Step 3.3:** Wait 2-3 minutes for settlement processing (polling interval)

**Expected Result:** Trigger fires, settlement queue populated, processor picks up batches

---

### Phase 4: Verify Settlement Processing (10 mins)
- [ ] **Step 4.1:** Check settlement batches created:
  ```sql
  SELECT * FROM sp_v2_settlement_batches
  WHERE created_at > NOW() - INTERVAL '10 minutes'
  ORDER BY created_at DESC;
  ```
  - [ ] Should have at least 1 batch
  - [ ] Status should be 'PENDING_APPROVAL' or 'APPROVED' (if under ₹10k)
- [ ] **Step 4.2:** Check settlement items created:
  ```sql
  SELECT COUNT(*) FROM sp_v2_settlement_items
  WHERE created_at > NOW() - INTERVAL '10 minutes';
  ```
  - [ ] Count should match number of reconciled transactions
- [ ] **Step 4.3:** Verify settlement calculations:
  ```sql
  SELECT
    gross_amount_paise / 100.0 as gross_amount,
    total_commission_paise / 100.0 as commission,
    total_gst_paise / 100.0 as gst,
    net_amount_paise / 100.0 as net_amount
  FROM sp_v2_settlement_batches
  WHERE created_at > NOW() - INTERVAL '10 minutes';
  ```
  - [ ] Amounts should be reasonable (not zero, not negative)

**Expected Result:** Settlement batches and items created with correct calculations

---

### Phase 5: Verify All Reports Populated (15 mins)

#### Report 1: Bank MIS
- [ ] **Step 5.1:** Navigate to Reports → Bank MIS (http://localhost:5174/ops/reports/bank-mis)
- [ ] **Step 5.2:** Set date filter to today's date
- [ ] **Step 5.3:** Verify data displayed:
  - [ ] Bank Reference (UTR) visible
  - [ ] Bank Amount shows actual amounts (not ₹0.00)
  - [ ] Bank Name populated
  - [ ] Match Status shows (MATCHED/UNMATCHED/EXCEPTION)
  - [ ] Row count matches bank file upload count
- [ ] **Step 5.4:** Test export to CSV functionality
- [ ] **Step 5.5:** Screenshot the report

**Expected Result:** Bank MIS shows all bank statements with reconciliation status

#### Report 2: Recon Outcome
- [ ] **Step 5.6:** Navigate to Reports → Recon Outcome
- [ ] **Step 5.7:** Set date filter to today's date
- [ ] **Step 5.8:** Verify data displayed:
  - [ ] Transaction ID visible
  - [ ] PG Amount shows actual amounts
  - [ ] Payment Mode visible
  - [ ] Match Status shows (MATCHED/UNMATCHED/EXCEPTION)
  - [ ] Bank Reference shows for matched transactions
  - [ ] Row count matches PG file upload count
- [ ] **Step 5.9:** Test export to CSV functionality
- [ ] **Step 5.10:** Screenshot the report

**Expected Result:** Recon Outcome shows all PG transactions with bank match status

#### Report 3: Settlement Summary
- [ ] **Step 5.11:** Navigate to Reports → Settlement Summary
- [ ] **Step 5.12:** Set date filter to today's date
- [ ] **Step 5.13:** Verify data displayed:
  - [ ] Settlement Batch ID visible
  - [ ] Merchant ID/Name visible
  - [ ] Cycle Date = today's date
  - [ ] Total Transactions count matches reconciled count
  - [ ] Gross Amount > 0
  - [ ] Commission Amount > 0
  - [ ] GST Amount > 0
  - [ ] Net Amount = Gross - Commission - GST - Reserve
  - [ ] Status shows (PENDING_APPROVAL or APPROVED)
  - [ ] **NEW:** Refund Deductions column (should be 0 for this test)
  - [ ] **NEW:** Chargeback Deductions column (should be 0 for this test)
- [ ] **Step 5.14:** Test export to CSV functionality
- [ ] **Step 5.15:** Screenshot the report

**Expected Result:** Settlement Summary shows batch with correct calculations

#### Report 4: Settlement Transactions
- [ ] **Step 5.16:** Navigate to Reports → Settlement Transactions
- [ ] **Step 5.17:** Set date filter to today's date
- [ ] **Step 5.18:** Verify data displayed:
  - [ ] Individual transaction rows visible
  - [ ] Transaction ID matches uploaded PG transactions
  - [ ] Amount matches original transaction amount
  - [ ] Commission calculated correctly
  - [ ] GST calculated correctly
  - [ ] Net Amount = Amount - Commission - GST
  - [ ] Payment Mode visible
  - [ ] Row count matches reconciled transaction count
- [ ] **Step 5.19:** Test export to CSV functionality
- [ ] **Step 5.20:** Screenshot the report

**Expected Result:** Settlement Transactions shows itemized list of settled transactions

---

### Phase 6: Verify Analytics Tab (10 mins)

#### Analytics Overview
- [ ] **Step 6.1:** Navigate to Analytics → Overview
- [ ] **Step 6.2:** Verify KPIs updated:
  - [ ] Total Transactions count increased
  - [ ] Total GMV increased by sum of test transactions
  - [ ] Settlement Amount shows new settlement batch amount
  - [ ] Success Rate calculation correct
- [ ] **Step 6.3:** Verify charts populated:
  - [ ] GMV Trend chart shows data point for today
  - [ ] Payment Mode breakdown shows test data distribution
  - [ ] Settlement status chart updated

#### Financial Analytics
- [ ] **Step 6.4:** Navigate to Analytics → Financial
- [ ] **Step 6.5:** Verify financial metrics:
  - [ ] Revenue (commission) calculated from settlement
  - [ ] Settlement volume matches batch gross amount
  - [ ] Reserve amount (if applicable) shown correctly
- [ ] **Step 6.6:** Screenshot analytics dashboard

**Expected Result:** Analytics powered by real settlement data

---

## Monitoring & Debugging Checklist

### If Upload Fails
- [ ] Check upload-api logs: `tail -f /tmp/upload-api.log`
- [ ] Verify CSV format matches expected schema
- [ ] Check file size < 10MB
- [ ] Verify database connectivity
- [ ] Check file permissions on uploads directory

### If Recon Fails
- [ ] Check recon-api PM2 logs: `ssh ec2-user@13.201.179.44 "pm2 logs recon-api"`
- [ ] Verify both files uploaded successfully
- [ ] Check for schema mismatches in CSV
- [ ] Verify UTR format is consistent
- [ ] Check database has both PG and bank records

### If Settlement Queue Doesn't Populate
- [ ] Verify trigger exists: `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_transaction_status_change'`
- [ ] Check transaction status = 'RECONCILED'
- [ ] Look for trigger errors in database logs
- [ ] Manually insert into queue for testing:
  ```sql
  INSERT INTO sp_v2_settlement_queue (transaction_id, merchant_id, amount_paise)
  SELECT transaction_id, merchant_id, amount_paise
  FROM sp_v2_transactions
  WHERE status = 'RECONCILED' AND created_at > NOW() - INTERVAL '1 hour';
  ```

### If Settlement Processor Doesn't Run
- [ ] Check PM2 status: `ssh ec2-user@13.201.179.44 "pm2 list | grep settlement-queue"`
- [ ] Restart if needed: `ssh ec2-user@13.201.179.44 "pm2 restart settlement-queue-processor"`
- [ ] Check processor logs for errors
- [ ] Verify database connection in processor
- [ ] Check for NULL value errors (should be fixed now)

### If Reports Show Empty/Wrong Data
- [ ] Verify API endpoint responding: `curl http://localhost:5108/api/reports/bank-mis?from_date=2025-10-24&to_date=2025-10-24`
- [ ] Check Overview API logs
- [ ] Verify database queries return data
- [ ] Check frontend network tab for API errors
- [ ] Verify date filter matches test data date

### If Analytics Not Updated
- [ ] Check if analytics pulls from settlement tables
- [ ] Verify date range includes test data
- [ ] Refresh browser (clear cache if needed)
- [ ] Check analytics API endpoints
- [ ] Verify aggregation queries in analytics service

---

## Success Criteria

### Must Pass:
- ✅ Files upload successfully (both PG and Bank)
- ✅ Reconciliation completes without errors
- ✅ Database trigger fires and populates settlement queue
- ✅ Settlement processor creates batches within 2 minutes
- ✅ All 4 reports show data (Bank MIS, Recon Outcome, Settlement Summary, Settlement Transactions)
- ✅ Report data is accurate (amounts, counts, statuses)
- ✅ No errors in any service logs
- ✅ Analytics tab updates with new data

### Nice to Have:
- ✅ Export to CSV works for all reports
- ✅ UI is responsive and fast
- ✅ Date filters work correctly
- ✅ No console errors in browser
- ✅ All charts render properly in Analytics

---

## Post-Test Actions

### If All Tests Pass:
- [ ] Document test results with screenshots
- [ ] Create summary report for stakeholders
- [ ] Update CLAUDE.md with confirmed workflow
- [ ] Plan production deployment
- [ ] Create runbook for ops team

### If Tests Fail:
- [ ] Document exact failure point
- [ ] Capture error logs from all services
- [ ] Create detailed bug report with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Error messages
  - Database state
- [ ] Fix issues immediately (Claude will help!)
- [ ] Re-run failed test phase
- [ ] Update this checklist with learnings

---

## Timeline Estimate

| Phase | Duration | Total Time |
|-------|----------|------------|
| Pre-Test Setup | 10 mins | 0:10 |
| Phase 1: Upload | 15 mins | 0:25 |
| Phase 2: Recon | 10 mins | 0:35 |
| Phase 3: Triggers | 5 mins | 0:40 |
| Phase 4: Settlement | 10 mins | 0:50 |
| Phase 5: Reports | 15 mins | 1:05 |
| Phase 6: Analytics | 10 mins | 1:15 |
| Buffer for debugging | 15 mins | 1:30 |

**Total Estimated Time:** 1.5 hours

---

## Notes for Claude (Tomorrow's Session)

- User expects me to monitor each component actively
- Fix any issues immediately as they arise
- Test data should be realistic but small (15-20 transactions)
- Focus on end-to-end flow validation
- Analytics tab must also get powered by the settlement data
- This is the final validation before production deployment

---

## Quick Commands Reference

### Start All Services
```bash
# Frontend
npm run dev -- --port 5174

# Check all backend services on staging
ssh ec2-user@13.201.179.44 "pm2 list"
```

### Monitor Logs
```bash
# Upload API
tail -f /tmp/upload-api.log

# Recon API (on staging)
ssh ec2-user@13.201.179.44 "pm2 logs recon-api --lines 50"

# Settlement Queue Processor (on staging)
ssh ec2-user@13.201.179.44 "pm2 logs settlement-queue-processor --lines 50"

# Overview API (on staging)
ssh ec2-user@13.201.179.44 "pm2 logs overview-api --lines 50"
```

### Database Queries
```bash
# Connect to staging DB
psql "host=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com port=5432 dbname=settlepaisa_v2 user=postgres password=SettlePaisa2024"

# Or use node script for queries
node check-test-data.cjs
```

---

**Created:** October 23, 2025, 11:30 PM
**Status:** Ready for tomorrow's E2E testing
**Owner:** Shantanu + Claude
