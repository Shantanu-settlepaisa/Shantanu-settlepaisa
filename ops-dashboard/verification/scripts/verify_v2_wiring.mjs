#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import fetch from 'node-fetch';

const { Client } = pg;

// Helper to read SQL files
function readSQL(filename) {
  const sqlPath = path.join(process.cwd(), 'verification', 'sql', filename);
  return fs.readFileSync(sqlPath, 'utf8');
}

// Helper to run SQL query
async function runSQL(client, sqlFile, merchantId) {
  const sql = readSQL(sqlFile);
  const result = await client.query(sql, [merchantId]);
  return result.rows[0] || {};
}

// Helper to fetch API
async function fetchAPI(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json();
}

// Main verification function
async function verifyV2Wiring() {
  console.log('🔍 Starting V2 Database Wiring Verification...\n');
  
  // Load config
  const configPath = process.argv.includes('--config') 
    ? process.argv[process.argv.indexOf('--config') + 1]
    : 'verification/verify.config.json';
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const { PG_URL, API_BASE, MERCHANT_ID, TOLERANCE_PAISE, FRONTEND_BASE } = config;
  
  // Results tracking
  const results = [];
  let hasFailures = false;
  
  function addResult(name, status, expected = null, actual = null, notes = '') {
    const result = { name, status, expected, actual, notes };
    results.push(result);
    if (status === 'FAIL') hasFailures = true;
    
    const symbol = status === 'PASS' ? '✅' : '❌';
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
  
  try {
    // 1. Environment flags check
    console.log('\\n🔧 Checking Environment Flags...');
    try {
      const healthResponse = await fetchAPI(API_BASE, '/health/live');
      addResult('API Health Check', 'PASS', null, healthResponse);
    } catch (error) {
      addResult('API Health Check', 'FAIL', 'API accessible', error.message);
    }
    
    // 2. Get database truth
    console.log('\\n📋 Fetching Database Truth...');
    const unsettledNet = await runSQL(client, 'unsettled_net.sql', MERCHANT_ID);
    const lastCompleted = await runSQL(client, 'last_completed.sql', MERCHANT_ID);
    const settlementConfig = await runSQL(client, 'settlement_config.sql', MERCHANT_ID);
    const oneProcessing = await runSQL(client, 'one_processing.sql', MERCHANT_ID);
    const completedWithUtr = await runSQL(client, 'one_completed_with_utr.sql', MERCHANT_ID);
    
    console.log(`DB Truth - Unsettled: ${unsettledNet.unsettled_net_paise} paise`);
    console.log(`DB Truth - Last Completed: ${lastCompleted.net_amount_paise} paise`);
    console.log(`DB Truth - Config: T+${settlementConfig.t_plus_days}, ${settlementConfig.cutoff_minutes_ist} min`);
    
    // 3. Fetch API responses
    console.log('\\n🌐 Fetching API Responses...');
    const summary = await fetchAPI(API_BASE, '/v1/merchant/dashboard/summary');
    const settlements = await fetchAPI(API_BASE, '/v1/merchant/settlements?limit=5&offset=0');
    const schedule = await fetchAPI(API_BASE, '/merchant/settlement/schedule');
    
    // Optional: insights and timeline
    let insights = null;
    let timeline = null;
    
    try {
      insights = await fetchAPI(API_BASE, '/v1/merchant/insights/settlement-trend');
    } catch (e) {
      console.log('ℹ️ Insights endpoint not available');
    }
    
    if (oneProcessing.id) {
      try {
        timeline = await fetchAPI(API_BASE, `/v1/merchant/settlements/${oneProcessing.id}/timeline`);
      } catch (e) {
        console.log('ℹ️ Timeline endpoint not available for processing settlement');
      }
    }
    
    // 4. Verification checks
    console.log('\\n✅ Running Verification Checks...');
    
    // Check 1: Current Balance vs DB
    const balanceDiff = Math.abs(summary.currentBalance - unsettledNet.unsettled_net_paise);
    addResult(
      'Current Balance Accuracy',
      balanceDiff <= TOLERANCE_PAISE ? 'PASS' : 'FAIL',
      `${unsettledNet.unsettled_net_paise} ±${TOLERANCE_PAISE} paise`,
      `${summary.currentBalance} paise`,
      `Difference: ${balanceDiff} paise`
    );
    
    // Check 2: Last Settlement Amount
    const lastSettlementMatch = summary.lastSettlement?.amount === parseInt(lastCompleted.net_amount_paise);
    addResult(
      'Last Settlement Amount',
      lastSettlementMatch ? 'PASS' : 'FAIL',
      `${lastCompleted.net_amount_paise} paise`,
      `${summary.lastSettlement?.amount} paise`
    );
    
    // Check 3: Last Settlement Status  
    const lastSettlementStatus = summary.lastSettlement?.status === 'SETTLED';
    addResult(
      'Last Settlement Status',
      lastSettlementStatus ? 'PASS' : 'FAIL',
      'SETTLED',
      summary.lastSettlement?.status
    );
    
    // Check 4: Settlement Schedule Config
    const scheduleMatch = schedule.tPlusDays === settlementConfig.t_plus_days && 
                         schedule.cutoffMinutesIST === parseInt(settlementConfig.cutoff_minutes_ist);
    addResult(
      'Settlement Schedule Config',
      scheduleMatch ? 'PASS' : 'FAIL',
      `T+${settlementConfig.t_plus_days}, ${settlementConfig.cutoff_minutes_ist}min`,
      `T+${schedule.tPlusDays}, ${schedule.cutoffMinutesIST}min`
    );
    
    // Check 5: Settlements History Order
    const historyOrdered = settlements.settlements.length >= 2 ? 
      new Date(settlements.settlements[0].createdAt) >= new Date(settlements.settlements[1].createdAt) :
      true;
    addResult(
      'Settlement History Order',
      historyOrdered ? 'PASS' : 'FAIL',
      'DESC by createdAt',
      historyOrdered ? 'Correct order' : 'Incorrect order'
    );
    
    // Check 6: Completed Settlement has UTR
    const completedEntry = settlements.settlements.find(s => s.status === 'completed');
    const hasUtr = completedEntry ? (completedEntry.utr && completedEntry.utr !== '-') : true;
    addResult(
      'Completed Settlement UTR',
      hasUtr ? 'PASS' : 'FAIL',
      'Non-empty UTR for completed',
      completedEntry ? completedEntry.utr : 'No completed settlement'
    );
    
    // Check 7: Timeline for Processing Settlement
    if (timeline && timeline.events) {
      const hasEvents = timeline.events.length > 0;
      const lastEvent = timeline.events[timeline.events.length - 1];
      const hasReasonOrMeta = lastEvent?.detail || lastEvent?.meta;
      
      addResult(
        'Timeline Events Exist',
        hasEvents ? 'PASS' : 'FAIL',
        '≥1 event',
        `${timeline.events.length} events`
      );
      
      addResult(
        'Timeline Last Event Detail',
        hasReasonOrMeta ? 'PASS' : 'FAIL',
        'Has detail or meta',
        hasReasonOrMeta ? 'Present' : 'Missing'
      );
    } else {
      addResult('Timeline Endpoint', 'SKIP', null, null, 'No processing settlement or endpoint unavailable');
    }
    
    // Check 8: Insights Data
    if (insights && insights.trend) {
      const trendValid = Array.isArray(insights.trend) && insights.trend.length > 0;
      addResult(
        'Insights Trend Data',
        trendValid ? 'PASS' : 'FAIL',
        'Array with length > 0',
        `Array with length ${insights.trend?.length || 0}`
      );
    } else {
      addResult('Insights Endpoint', 'SKIP', null, null, 'Endpoint unavailable');
    }
    
    // Check 9: Status Vocabulary
    const validStatuses = ['settled', 'processing', 'pending', 'approved', 'failed', 'completed'];
    const invalidStatuses = settlements.settlements
      .map(s => s.status)
      .filter(status => !validStatuses.includes(status));
    
    addResult(
      'Status Vocabulary',
      invalidStatuses.length === 0 ? 'PASS' : 'FAIL',
      'Only valid V2 statuses',
      invalidStatuses.length ? `Invalid: ${invalidStatuses.join(', ')}` : 'All valid'
    );
    
    // Check 10: No NaN Values
    const hasNaN = settlements.settlements.some(s => 
      isNaN(s.amount) || isNaN(s.fees) || isNaN(s.tax)
    );
    addResult(
      'No NaN Values',
      !hasNaN ? 'PASS' : 'FAIL',
      'All numeric fields are numbers',
      hasNaN ? 'Found NaN values' : 'All valid numbers'
    );
    
    // 5. Generate report
    console.log('\\n📝 Generating Report...');
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: config.TZ });
    
    const report = `# V2 Database Wiring Verification Report
    
**Generated:** ${timestamp} (${config.TZ})  
**Merchant ID:** ${MERCHANT_ID}  
**API Base:** ${API_BASE}  
**Database:** ${PG_URL.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}

## Summary

**Total Checks:** ${results.length}  
**Passed:** ${results.filter(r => r.status === 'PASS').length}  
**Failed:** ${results.filter(r => r.status === 'FAIL').length}  
**Skipped:** ${results.filter(r => r.status === 'SKIP').length}

${hasFailures ? '❌ **VERIFICATION FAILED**' : '✅ **ALL CHECKS PASSED**'}

## Detailed Results

| Check | Status | Expected | Actual | Notes |
|-------|--------|----------|--------|--------|
${results.map(r => {
  const expected = r.expected ? JSON.stringify(r.expected).substring(0, 50) : '-';
  const actual = r.actual ? JSON.stringify(r.actual).substring(0, 50) : '-';
  return `| ${r.name} | ${r.status} | ${expected} | ${actual} | ${r.notes || '-'} |`;
}).join('\\n')}

## Database Truth (Raw)

\`\`\`json
{
  "unsettled_net_paise": ${unsettledNet.unsettled_net_paise},
  "last_completed": ${JSON.stringify(lastCompleted, null, 2)},
  "settlement_config": ${JSON.stringify(settlementConfig, null, 2)},
  "one_processing_id": "${oneProcessing.id || 'none'}",
  "completed_with_utr": ${JSON.stringify(completedWithUtr, null, 2)}
}
\`\`\`

## API Responses (Sample)

### Dashboard Summary
\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

### Settlements (First 2)
\`\`\`json
${JSON.stringify(settlements.settlements.slice(0, 2), null, 2)}
\`\`\`

### Schedule
\`\`\`json
${JSON.stringify(schedule, null, 2)}
\`\`\`

${hasFailures ? `
## FIXME Section

${results.filter(r => r.status === 'FAIL').map(r => {
  let fix = '';
  if (r.name.includes('Current Balance')) {
    fix = 'Check getMerchantSummary() in services/merchant-api/db/v2Adapter.js - ensure pending sum matches unsettled calculation';
  } else if (r.name.includes('Last Settlement')) {
    fix = 'Verify lastSettlement mapping in services/merchant-api/index.js dashboard summary endpoint';
  } else if (r.name.includes('Schedule')) {
    fix = 'Check settlement schedule calculation in v2Adapter.js getNextSettlementETA method';
  } else if (r.name.includes('UTR')) {
    fix = 'Verify JOIN between sp_v2_settlement_batches and sp_v2_bank_transfer_queue in listSettlements query';
  } else if (r.name.includes('Timeline')) {
    fix = 'Check timeline endpoint in services/merchant-api/index.js and ensure events are properly returned';
  } else {
    fix = 'Review API response format and status mapping';
  }
  return `### ${r.name}
**Issue:** ${r.notes}
**Fix:** ${fix}
`;
}).join('\\n')}
` : '## ✅ All checks passed - V2 database is properly wired!'}

## Runbook

### How to re-run verification:
\`\`\`bash
npm run verify:v2
\`\`\`

### How to update config:
\`\`\`bash
cp verification/verify.config.json.sample verification/verify.config.json
# Edit PG_URL, API_BASE, MERCHANT_ID as needed
\`\`\`

### Where to read results:
- This file: \`verification/V2_WIRING_REPORT.md\`
- Console output during \`npm run verify:v2\`
`;

    // Write report
    fs.writeFileSync('verification/V2_WIRING_REPORT.md', report);
    console.log('\\n📄 Report written to verification/V2_WIRING_REPORT.md');
    
    // Exit with appropriate code
    if (hasFailures) {
      console.log('\\n❌ Verification FAILED - see report for details');
      process.exit(1);
    } else {
      console.log('\\n✅ Verification PASSED - V2 database is properly wired!');
      process.exit(0);
    }
    
  } finally {
    await client.end();
  }
}

// Run verification
verifyV2Wiring().catch(error => {
  console.error('💥 Verification script error:', error);
  process.exit(1);
});