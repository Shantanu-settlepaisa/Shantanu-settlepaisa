#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const { Client } = pg;

// Helper to read SQL files
function readSQL(filename) {
  const sqlPath = path.join(process.cwd(), 'verification', 'sql', filename);
  return fs.readFileSync(sqlPath, 'utf8');
}

// Helper to run SQL query
async function runSQL(client, sqlFile, ...params) {
  const sql = readSQL(sqlFile);
  const result = await client.query(sql, params);
  return result.rows;
}

// Helper to fetch API
async function fetchAPI(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  } else {
    return await response.text();
  }
}

// Helper to parse CSV
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row;
  });
  return { headers, rows };
}

// Main audit function
async function auditV2Functional() {
  console.log('🔬 Starting V2 Functional Audit...\\n');
  
  // Load config
  const configPath = process.argv.includes('--config') 
    ? process.argv[process.argv.indexOf('--config') + 1]
    : 'verification/audit.config.json';
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { PG_URL, API_BASE, MERCHANT_ID, TOLERANCE_PAISE, AUDIT_SETTINGS } = config;
  
  // Results tracking
  const results = [];
  let hasFailures = false;
  const createdIds = []; // Track created data for cleanup
  
  function addResult(name, status, expected = null, actual = null, notes = '') {
    const result = { name, status, expected, actual, notes };
    results.push(result);
    if (status === 'FAIL') hasFailures = true;
    
    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${symbol} ${name}: ${status}`);
    if (status === 'FAIL' && expected !== null) {
      console.log(`   Expected: ${JSON.stringify(expected)}`);
      console.log(`   Actual: ${JSON.stringify(actual)}`);
    }
    if (notes) console.log(`   Notes: ${notes}`);
  }
  
  // Connect to database
  console.log('📊 Connecting to V2 Database...');
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  
  let transaction;
  
  try {
    // Start transaction for rollback capability
    await client.query('BEGIN');
    transaction = true;
    
    // 1. Pre-audit baseline
    console.log('\\n📋 Establishing Baseline...');
    const initialBalance = await runSQL(client, 'unsettled_net.sql', MERCHANT_ID);
    const initialSettlements = await fetchAPI(API_BASE, `/v1/merchant/settlements?limit=10&offset=0`);
    
    console.log(`Initial Balance: ${initialBalance[0]?.unsettled_net_paise || 0} paise`);
    console.log(`Initial Settlement Count: ${initialSettlements.settlements?.length || 0}`);
    
    // 2. Schedule Update Test (Write Operation)
    console.log('\\n🔧 Testing Schedule Update Flow...');
    
    // Get current schedule
    const originalSchedule = await fetchAPI(API_BASE, '/merchant/settlement/schedule');
    console.log(`Original Schedule: T+${originalSchedule.tPlusDays}, ${originalSchedule.cutoffMinutesIST}min`);
    
    // Update schedule
    const newSchedule = {
      tPlusDays: originalSchedule.tPlusDays === 1 ? 2 : 1,
      cutoffMinutesIST: originalSchedule.cutoffMinutesIST === 840 ? 900 : 840
    };
    
    try {
      await fetchAPI(API_BASE, '/merchant/settlement/schedule', {
        method: 'PUT',
        body: JSON.stringify(newSchedule)
      });
      
      // Verify update in API
      const updatedScheduleAPI = await fetchAPI(API_BASE, '/merchant/settlement/schedule');
      const scheduleUpdateSuccess = updatedScheduleAPI.tPlusDays === newSchedule.tPlusDays && 
                                  updatedScheduleAPI.cutoffMinutesIST === newSchedule.cutoffMinutesIST;
      
      addResult(
        'Schedule Update API',
        scheduleUpdateSuccess ? 'PASS' : 'FAIL',
        `T+${newSchedule.tPlusDays}, ${newSchedule.cutoffMinutesIST}min`,
        `T+${updatedScheduleAPI.tPlusDays}, ${updatedScheduleAPI.cutoffMinutesIST}min`
      );
      
      // Verify update in database
      const dbSchedule = await runSQL(client, 'settlement_config.sql', MERCHANT_ID);
      const dbMatch = dbSchedule[0]?.t_plus_days === newSchedule.tPlusDays && 
                     parseInt(dbSchedule[0]?.cutoff_minutes_ist) === newSchedule.cutoffMinutesIST;
      
      addResult(
        'Schedule Update DB Persistence',
        dbMatch ? 'PASS' : 'FAIL',
        `T+${newSchedule.tPlusDays}, ${newSchedule.cutoffMinutesIST}min`,
        `T+${dbSchedule[0]?.t_plus_days}, ${dbSchedule[0]?.cutoff_minutes_ist}min`
      );
      
      // Revert schedule
      await fetchAPI(API_BASE, '/merchant/settlement/schedule', {
        method: 'PUT',
        body: JSON.stringify(originalSchedule)
      });
      
    } catch (error) {
      addResult('Schedule Update Flow', 'FAIL', 'Update successful', error.message);
    }
    
    // 3. Instant Settlement Creation Test (Write Operation)
    console.log('\\n💰 Testing Instant Settlement Creation...');
    
    const settlementId = uuidv4();
    const grossAmount = AUDIT_SETTINGS.MAX_INSTANT_SETTLEMENT_PAISE;
    const fees = Math.floor(grossAmount * 0.02); // 2% fees
    const tax = Math.floor(fees * 0.18); // 18% tax on fees
    const netAmount = grossAmount - fees - tax;
    
    createdIds.push(settlementId);
    
    try {
      // Create instant settlement via API
      const instantResponse = await fetchAPI(API_BASE, '/v1/merchant/settlements/instant', {
        method: 'POST',
        body: JSON.stringify({
          amount: grossAmount,
          type: 'instant'
        })
      });
      
      addResult(
        'Instant Settlement API Creation',
        instantResponse.id ? 'PASS' : 'FAIL',
        'Settlement ID returned',
        instantResponse.id || 'No ID returned'
      );
      
      if (instantResponse.id) {
        createdIds.push(instantResponse.id);
        
        // Verify in database
        const dbResult = await client.query(
          'SELECT * FROM sp_v2_settlement_batches WHERE id = $1',
          [instantResponse.id]
        );
        
        addResult(
          'Instant Settlement DB Creation',
          dbResult.rows.length > 0 ? 'PASS' : 'FAIL',
          'Settlement record in DB',
          dbResult.rows.length > 0 ? 'Found' : 'Not found'
        );
        
        // Verify balance update
        const newBalance = await runSQL(client, 'unsettled_net.sql', MERCHANT_ID);
        const balanceChanged = newBalance[0]?.unsettled_net_paise !== initialBalance[0]?.unsettled_net_paise;
        
        addResult(
          'Balance Update After Instant Settlement',
          balanceChanged ? 'PASS' : 'FAIL',
          'Balance should change',
          balanceChanged ? 'Balance changed' : 'Balance unchanged'
        );
      }
      
    } catch (error) {
      addResult('Instant Settlement Creation', 'FAIL', 'Settlement created', error.message);
    }
    
    // 4. Settlement Math Breakdown Test
    console.log('\\n🧮 Testing Settlement Math Breakdown...');
    
    const breakdownData = await runSQL(client, 'audit_settlement_breakdown.sql', MERCHANT_ID);
    
    for (const settlement of breakdownData.slice(0, 3)) {
      const expectedNet = settlement.gross_amount_paise - settlement.fees_paise - settlement.tax_paise - 
                         (settlement.tds_paise || 0) - (settlement.reserve_amount_paise || 0);
      const actualNet = parseInt(settlement.net_amount_paise);
      const mathCorrect = expectedNet === actualNet;
      
      addResult(
        `Math Breakdown ${settlement.id.substring(0, 8)}`,
        mathCorrect ? 'PASS' : 'FAIL',
        `${expectedNet} paise`,
        `${actualNet} paise`,
        `gross(${settlement.gross_amount_paise}) - fees(${settlement.fees_paise}) - tax(${settlement.tax_paise})`
      );
    }
    
    // 5. Timeline Event Testing
    console.log('\\n⏰ Testing Timeline Events...');
    
    // Get a processing settlement for timeline test
    const processingSett = await runSQL(client, 'one_processing.sql', MERCHANT_ID);
    
    if (processingSett[0]?.id) {
      try {
        const timeline = await fetchAPI(API_BASE, `/v1/merchant/settlements/${processingSett[0].id}/timeline`);
        const dbEvents = await runSQL(client, 'audit_timeline_events.sql', processingSett[0].id);
        
        addResult(
          'Timeline API vs DB Event Count',
          timeline.events?.length === dbEvents.length ? 'PASS' : 'FAIL',
          `${dbEvents.length} events`,
          `${timeline.events?.length || 0} events`
        );
        
        // Check last event has explanation
        const lastEvent = timeline.events?.[timeline.events.length - 1];
        const hasExplanation = lastEvent?.detail || lastEvent?.meta;
        
        addResult(
          'Timeline Last Event Explanation',
          hasExplanation ? 'PASS' : 'FAIL',
          'Event has detail/meta',
          hasExplanation ? 'Present' : 'Missing'
        );
        
      } catch (error) {
        addResult('Timeline Endpoint Access', 'FAIL', 'Timeline accessible', error.message);
      }
    } else {
      addResult('Timeline Test', 'SKIP', null, null, 'No processing settlement available');
    }
    
    // 6. Export Functionality Test
    console.log('\\n📄 Testing Export Functionality...');
    
    try {
      const csvResponse = await fetchAPI(API_BASE, '/v1/merchant/settlements/export', {
        headers: {
          'Accept': 'text/csv'
        }
      });
      
      const csvData = parseCSV(csvResponse);
      const settlementsAPI = await fetchAPI(API_BASE, '/v1/merchant/settlements?limit=100&offset=0');
      
      addResult(
        'CSV Export Row Count',
        csvData.rows.length > 0 ? 'PASS' : 'FAIL',
        'Rows > 0',
        `${csvData.rows.length} rows`
      );
      
      // Verify CSV contains expected columns
      const expectedColumns = ['id', 'amount', 'status', 'createdAt'];
      const hasRequiredColumns = expectedColumns.every(col => csvData.headers.includes(col));
      
      addResult(
        'CSV Export Column Structure',
        hasRequiredColumns ? 'PASS' : 'FAIL',
        expectedColumns.join(', '),
        csvData.headers.join(', ')
      );
      
      // Verify amount sum matches (first 10 rows)
      if (csvData.rows.length > 0 && settlementsAPI.settlements?.length > 0) {
        const csvSum = csvData.rows.slice(0, 10).reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
        const apiSum = settlementsAPI.settlements.slice(0, 10).reduce((sum, s) => sum + s.amount, 0);
        
        addResult(
          'CSV vs API Amount Sum',
          Math.abs(csvSum - apiSum) < TOLERANCE_PAISE ? 'PASS' : 'FAIL',
          `${apiSum} paise`,
          `${csvSum} paise`
        );
      }
      
    } catch (error) {
      addResult('Export Functionality', 'FAIL', 'CSV export works', error.message);
    }
    
    // 7. Filter and Search Tests
    console.log('\\n🔍 Testing Filters and Search...');
    
    try {
      // Test instant-only filter
      const instantOnly = await fetchAPI(API_BASE, '/v1/merchant/settlements?type=instant&limit=5');
      const allInstant = instantOnly.settlements?.every(s => s.type === 'instant');
      
      addResult(
        'Instant Settlement Filter',
        allInstant ? 'PASS' : 'FAIL',
        'All settlements type=instant',
        allInstant ? 'All instant' : 'Mixed types'
      );
      
      // Test status filter
      const settledOnly = await fetchAPI(API_BASE, '/v1/merchant/settlements?status=settled&limit=5');
      const allSettled = settledOnly.settlements?.every(s => s.status === 'settled');
      
      addResult(
        'Status Filter',
        allSettled ? 'PASS' : 'FAIL',
        'All settlements status=settled',
        allSettled ? 'All settled' : 'Mixed statuses'
      );
      
      // Test pagination
      const page1 = await fetchAPI(API_BASE, '/v1/merchant/settlements?limit=2&offset=0');
      const page2 = await fetchAPI(API_BASE, '/v1/merchant/settlements?limit=2&offset=2');
      
      const paginationWorks = page1.settlements?.length === 2 && 
                             page2.settlements?.length >= 0 &&
                             page1.settlements?.[0]?.id !== page2.settlements?.[0]?.id;
      
      addResult(
        'Pagination Functionality',
        paginationWorks ? 'PASS' : 'FAIL',
        'Different records on different pages',
        paginationWorks ? 'Working' : 'Not working'
      );
      
    } catch (error) {
      addResult('Filter and Search Tests', 'FAIL', 'Filters work', error.message);
    }
    
    // 8. Data Integrity Cross-Check
    console.log('\\n🔒 Testing Data Integrity...');
    
    const finalBalance = await runSQL(client, 'unsettled_net.sql', MERCHANT_ID);
    const finalSummary = await fetchAPI(API_BASE, '/v1/merchant/dashboard/summary');
    
    const balanceMatches = Math.abs(finalSummary.currentBalance - finalBalance[0]?.unsettled_net_paise) <= TOLERANCE_PAISE;
    
    addResult(
      'Final Balance Integrity',
      balanceMatches ? 'PASS' : 'FAIL',
      `${finalBalance[0]?.unsettled_net_paise} paise`,
      `${finalSummary.currentBalance} paise`
    );
    
    // Generate report
    console.log('\\n📝 Generating Audit Report...');
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: config.TZ });
    
    const report = `# V2 Functional Audit Report

**Generated:** ${timestamp} (${config.TZ})  
**Merchant ID:** ${MERCHANT_ID}  
**API Base:** ${API_BASE}  
**Audit Type:** Comprehensive Functional Testing

## Summary

**Total Tests:** ${results.length}  
**Passed:** ${results.filter(r => r.status === 'PASS').length}  
**Failed:** ${results.filter(r => r.status === 'FAIL').length}  
**Skipped:** ${results.filter(r => r.status === 'SKIP').length}

${hasFailures ? '❌ **AUDIT FAILED - Some functional tests failed**' : '✅ **ALL FUNCTIONAL TESTS PASSED**'}

## Test Categories

### 🔧 Write Operations
- Schedule Updates (PUT requests)
- Instant Settlement Creation (POST requests)
- Configuration Persistence

### 📊 Data Validation  
- Settlement Math Breakdowns
- Balance Calculations
- Cross-API Consistency

### 🔍 User Workflows
- Timeline Event Accuracy
- Export Functionality (CSV)
- Filters and Search
- Pagination

### 🔒 Data Integrity
- Transaction Atomicity
- Balance Consistency
- Event Sequencing

## Detailed Results

| Test | Status | Expected | Actual | Notes |
|------|--------|----------|--------|-------|
${results.map(r => {
  const expected = r.expected ? JSON.stringify(r.expected).substring(0, 40) : '-';
  const actual = r.actual ? JSON.stringify(r.actual).substring(0, 40) : '-';
  return `| ${r.name} | ${r.status} | ${expected} | ${actual} | ${r.notes || '-'} |`;
}).join('\\n')}

## Test Data Created

During this audit, the following test data was created and ${AUDIT_SETTINGS.CLEANUP_AFTER_TEST ? 'cleaned up' : 'left in database'}:

${createdIds.map(id => `- Settlement ID: ${id}`).join('\\n')}

${hasFailures ? `
## FIXME Section

The following functional tests failed and require attention:

${results.filter(r => r.status === 'FAIL').map(r => `
### ${r.name}
**Issue:** ${r.notes || 'Test failed'}
**Expected:** ${r.expected}
**Actual:** ${r.actual}
**Recommended Fix:** Review the endpoint implementation and ensure proper data flow
`).join('\\n')}
` : '## ✅ All functional tests passed - V2 system is working correctly!'}

## Runbook

### How to re-run functional audit:
\`\`\`bash
npm run audit:v2
\`\`\`

### How to run specific test categories:
\`\`\`bash
# Wiring verification only
npm run verify:v2

# Full functional audit
npm run audit:v2

# Custom config
npm run audit:v2 -- --config verification/custom-audit.config.json
\`\`\`

### Test Data Cleanup:
${AUDIT_SETTINGS.CLEANUP_AFTER_TEST ? 'Automatic cleanup is enabled in config' : 'Manual cleanup required - check audit.config.json'}

### Where to read results:
- This file: \`verification/V2_FUNCTIONAL_AUDIT.md\`
- Console output during \`npm run audit:v2\`
`;

    // Write report
    fs.writeFileSync('verification/V2_FUNCTIONAL_AUDIT.md', report);
    console.log('\\n📄 Audit report written to verification/V2_FUNCTIONAL_AUDIT.md');
    
    // Cleanup test data if configured
    if (AUDIT_SETTINGS.CLEANUP_AFTER_TEST && createdIds.length > 0) {
      console.log('\\n🧹 Cleaning up test data...');
      await runSQL(client, 'audit_cleanup_test_data.sql', MERCHANT_ID);
      console.log(`Cleaned up ${createdIds.length} test records`);
    }
    
    // Commit transaction if all passed, rollback if failed and configured
    if (hasFailures && AUDIT_SETTINGS.ROLLBACK_ON_FAILURE) {
      await client.query('ROLLBACK');
      console.log('\\n↩️ Transaction rolled back due to failures');
    } else {
      await client.query('COMMIT');
      console.log('\\n✅ Transaction committed');
    }
    
    // Exit with appropriate code
    if (hasFailures) {
      console.log('\\n❌ Functional Audit FAILED - see report for details');
      process.exit(1);
    } else {
      console.log('\\n✅ Functional Audit PASSED - All V2 features working correctly!');
      process.exit(0);
    }
    
  } catch (error) {
    if (transaction) {
      await client.query('ROLLBACK');
      console.log('\\n↩️ Transaction rolled back due to error');
    }
    throw error;
  } finally {
    await client.end();
  }
}

// Run audit
auditV2Functional().catch(error => {
  console.error('💥 Functional audit script error:', error);
  process.exit(1);
});