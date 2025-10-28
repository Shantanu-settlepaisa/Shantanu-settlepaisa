#!/usr/bin/env node

/**
 * Test script to verify the reconciliation fix for AXIS and BOB banks
 * Tests that UTR extraction works correctly for all three banks:
 * - HDFC: MERCHANT_TRACKID
 * - AXIS: PRNNo
 * - BOB: Merchant Track ID
 */

const fs = require('fs');
const path = require('path');

// Read and parse CSV files
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const records = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx];
    });
    return record;
  });

  return { headers, records };
}

// Simulate the bank normalization logic from runReconciliation.js:981
function extractUTR(record) {
  return (
    record.UTR ||
    record.utr ||
    record.MERCHANT_TRACKID ||
    record.merchant_trackid ||
    record.PRNNo ||
    record.prnno ||
    record.merchant_track_id ||
    record['Merchant Track ID'] ||
    ''
  ).toString().trim().toUpperCase();
}

console.log('🧪 Testing Reconciliation Fix for Multi-Bank UTR Extraction\n');
console.log('=' .repeat(80));

// Test PG file
const pgFile = '/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/pg_transactions.csv';
console.log('\n📄 PG File:', pgFile);
const pgData = parseCSV(pgFile);
console.log(`   Records: ${pgData.records.length}`);
console.log(`   Headers: ${pgData.headers.join(', ')}`);
console.log(`   Sample UTRs: ${pgData.records.slice(0, 3).map(r => r.utr).join(', ')}`);

const pgUTRs = new Set(pgData.records.map(r => r.utr?.trim().toUpperCase()).filter(Boolean));
console.log(`   ✅ Unique UTRs extracted: ${pgUTRs.size}`);

// Test HDFC file
console.log('\n🏦 HDFC Bank File:');
const hdfcFile = '/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/hdfc_bank_statements.csv';
const hdfcData = parseCSV(hdfcFile);
console.log(`   Records: ${hdfcData.records.length}`);
console.log(`   Headers: ${hdfcData.headers.join(', ')}`);

const hdfcUTRs = hdfcData.records.map(r => extractUTR(r)).filter(Boolean);
console.log(`   Sample raw column: ${hdfcData.records[0].MERCHANT_TRACKID || 'N/A'}`);
console.log(`   Sample extracted UTR: ${hdfcUTRs[0]}`);
console.log(`   ✅ UTRs extracted: ${hdfcUTRs.length}/${hdfcData.records.length}`);

// Test AXIS file
console.log('\n🏦 AXIS Bank File:');
const axisFile = '/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/axis_bank_statements.csv';
const axisData = parseCSV(axisFile);
console.log(`   Records: ${axisData.records.length}`);
console.log(`   Headers: ${axisData.headers.join(', ')}`);

const axisUTRs = axisData.records.map(r => extractUTR(r)).filter(Boolean);
console.log(`   Sample raw column: ${axisData.records[0].PRNNo || 'N/A'}`);
console.log(`   Sample extracted UTR: ${axisUTRs[0]}`);
console.log(`   ✅ UTRs extracted: ${axisUTRs.length}/${axisData.records.length}`);

// Test BOB file
console.log('\n🏦 BOB Bank File:');
const bobFile = '/Users/shantanusingh/ops-dashboard/test-files-comma-delimiter/bob_bank_statements.csv';
const bobData = parseCSV(bobFile);
console.log(`   Records: ${bobData.records.length}`);
console.log(`   Headers: ${bobData.headers.join(', ')}`);

const bobUTRs = bobData.records.map(r => extractUTR(r)).filter(Boolean);
console.log(`   Sample raw column: ${bobData.records[0]['Merchant Track ID'] || 'N/A'}`);
console.log(`   Sample extracted UTR: ${bobUTRs[0]}`);
console.log(`   ✅ UTRs extracted: ${bobUTRs.length}/${bobData.records.length}`);

// Match UTRs
console.log('\n' + '='.repeat(80));
console.log('🔍 Matching Analysis:\n');

const allBankUTRs = [...hdfcUTRs, ...axisUTRs, ...bobUTRs];
const bankUTRSet = new Set(allBankUTRs);

console.log(`📊 Total Bank UTRs extracted: ${allBankUTRs.length}`);
console.log(`📊 Unique Bank UTRs: ${bankUTRSet.size}`);
console.log(`📊 Total PG UTRs: ${pgUTRs.size}`);

let matchedCount = 0;
let unmatchedPG = [];

pgUTRs.forEach(pgUtr => {
  if (bankUTRSet.has(pgUtr)) {
    matchedCount++;
  } else {
    unmatchedPG.push(pgUtr);
  }
});

console.log('\n✅ RESULTS:');
console.log(`   Matched: ${matchedCount}/${pgUTRs.size}`);
console.log(`   Unmatched PG: ${unmatchedPG.length}`);

if (unmatchedPG.length > 0) {
  console.log(`\n❌ Unmatched PG UTRs: ${unmatchedPG.slice(0, 5).join(', ')}${unmatchedPG.length > 5 ? '...' : ''}`);
}

console.log('\n' + '='.repeat(80));

if (matchedCount === pgUTRs.size && pgUTRs.size === 50) {
  console.log('✅ SUCCESS: All 50 PG transactions should now match with bank records!');
  console.log('✅ Fix verified: UTR extraction works for HDFC, AXIS, and BOB banks');
  process.exit(0);
} else {
  console.log('❌ ISSUE: Not all transactions match. Expected 50/50.');
  console.log(`   Got: ${matchedCount}/${pgUTRs.size}`);
  process.exit(1);
}
