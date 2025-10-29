#!/usr/bin/env node

const { Pool } = require('pg');

// Staging RDS Connection
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024!',
  ssl: {
    rejectUnauthorized: false
  }
});

async function verifyBySourceFix() {
  console.log('====================================================');
  console.log('VERIFICATION: bySource Real Data vs MOCK Data');
  console.log('Date:', new Date().toISOString().split('T')[0]);
  console.log('====================================================\n');

  const client = await pool.connect();

  try {
    const today = new Date().toISOString().split('T')[0];

    // Query database for actual source breakdown
    console.log('📊 STEP 1: Query Database for Real Source Breakdown\n');
    
    const sourceQuery = `
      SELECT
        source_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as matched,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'UNMATCHED')) as unmatched
      FROM sp_v2_transactions
      WHERE created_at::date = $1
      GROUP BY source_type
      ORDER BY source_type
    `;

    const result = await client.query(sourceQuery, [today]);

    let manualTotal = 0, connectorTotal = 0, totalTransactions = 0;

    console.log('Database Results:');
    console.log('─────────────────────────────────────────────────');
    result.rows.forEach(row => {
      const sourceType = row.source_type?.toUpperCase() || 'UNKNOWN';
      const total = parseInt(row.total) || 0;
      const matched = parseInt(row.matched) || 0;
      const exceptions = parseInt(row.exceptions) || 0;
      const unmatched = parseInt(row.unmatched) || 0;
      const matchPct = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';

      console.log(`  ${sourceType}:`);
      console.log(`    Total: ${total}`);
      console.log(`    Matched: ${matched} (${matchPct}%)`);
      console.log(`    Exceptions: ${exceptions}`);
      console.log(`    Unmatched: ${unmatched}`);

      if (sourceType === 'MANUAL_UPLOAD') manualTotal = total;
      if (sourceType === 'CONNECTOR') connectorTotal = total;
      totalTransactions += total;
    });

    console.log('\n📊 STEP 2: Calculate What MOCK Data Would Show\n');
    const mockManual = Math.floor(totalTransactions * 0.3);
    const mockConnector = Math.floor(totalTransactions * 0.7);

    console.log('MOCK Data (30%/70% split):');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Manual: ${mockManual} (30% of ${totalTransactions})`);
    console.log(`  Connector: ${mockConnector} (70% of ${totalTransactions})`);

    console.log('\n📊 STEP 3: Fetch API Response from Staging\n');
    
    const apiUrl = `http://13.201.179.44:5108/api/overview?from=${today}&to=${today}`;
    console.log(`API URL: ${apiUrl}\n`);

    const fetch = (await import('node-fetch')).default;
    const apiResponse = await fetch(apiUrl);
    const apiData = await apiResponse.json();

    const apiManual = apiData.reconciliation?.bySource?.manual || 0;
    const apiConnector = apiData.reconciliation?.bySource?.connector || 0;

    console.log('API Response (bySource):');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Manual: ${apiManual}`);
    console.log(`  Connector: ${apiConnector}`);

    console.log('\n====================================================');
    console.log('COMPARISON RESULTS');
    console.log('====================================================\n');

    console.log('┌─────────────┬──────────┬──────────┬──────────┐');
    console.log('│ Source      │ Database │ API      │ MOCK     │');
    console.log('├─────────────┼──────────┼──────────┼──────────┤');
    console.log(`│ Manual      │ ${manualTotal.toString().padEnd(8)} │ ${apiManual.toString().padEnd(8)} │ ${mockManual.toString().padEnd(8)} │`);
    console.log(`│ Connector   │ ${connectorTotal.toString().padEnd(8)} │ ${apiConnector.toString().padEnd(8)} │ ${mockConnector.toString().padEnd(8)} │`);
    console.log('└─────────────┴──────────┴──────────┴──────────┘\n');

    // Verification
    const manualMatch = manualTotal === apiManual;
    const connectorMatch = connectorTotal === apiConnector;
    const notMock = (apiManual !== mockManual || apiConnector !== mockConnector);

    console.log('VERIFICATION STATUS:');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Manual Match (DB = API):      ${manualMatch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Connector Match (DB = API):   ${connectorMatch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Not Using MOCK Data:          ${notMock ? '✅ PASS' : '❌ FAIL (still using MOCK!)'}`);

    console.log('\n====================================================');
    if (manualMatch && connectorMatch && notMock) {
      console.log('✅ SUCCESS: API is returning REAL data from database!');
    } else {
      console.log('❌ FAILURE: API is NOT returning correct data!');
      if (!manualMatch) console.log('   - Manual count mismatch');
      if (!connectorMatch) console.log('   - Connector count mismatch');
      if (!notMock) console.log('   - Still using MOCK 30%/70% split');
    }
    console.log('====================================================\n');

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyBySourceFix();
