const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function verifyExceptionTiles() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(70));
    console.log('EXCEPTION TILES VERIFICATION');
    console.log('='.repeat(70));
    console.log('');
    
    console.log('1. DATABASE CHECK - Exception Transactions');
    console.log('-'.repeat(70));
    
    const txnResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
    `);
    
    console.log(`   Total EXCEPTION transactions: ${txnResult.rows[0].total}`);
    console.log(`   Earliest: ${txnResult.rows[0].earliest}`);
    console.log(`   Latest: ${txnResult.rows[0].latest}`);
    console.log('');
    
    console.log('2. DATABASE CHECK - Exception Workflow Records');
    console.log('-'.repeat(70));
    
    const workflowResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        status,
        severity,
        COUNT(*) FILTER (WHERE sla_breached = true) as sla_breached_count
      FROM sp_v2_exception_workflow
      GROUP BY status, severity
      ORDER BY status, severity
    `);
    
    console.log('   Status Breakdown:');
    workflowResult.rows.forEach(row => {
      console.log(`   - ${row.status} / ${row.severity}: ${row.total}`);
    });
    
    const totalWorkflow = await client.query(`
      SELECT COUNT(*) as total FROM sp_v2_exception_workflow
    `);
    console.log(`   Total workflow records: ${totalWorkflow.rows[0].total}`);
    console.log('');
    
    console.log('3. TRIGGER VERIFICATION - Today\'s Exceptions');
    console.log('-'.repeat(70));
    
    const todayExceptions = await client.query(`
      SELECT 
        t.id,
        t.transaction_id,
        t.created_at,
        ew.exception_id,
        ew.status,
        ew.severity
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
        AND t.created_at >= CURRENT_DATE
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    
    console.log(`   Today's exceptions (latest 10):`);
    todayExceptions.rows.forEach(row => {
      const hasWorkflow = row.exception_id ? '✅' : '❌';
      console.log(`   ${hasWorkflow} ${row.transaction_id} → ${row.exception_id || 'NO WORKFLOW'} (${row.created_at})`);
    });
    console.log('');
    
    console.log('4. API CHECK - /exceptions-v2');
    console.log('-'.repeat(70));
    
    try {
      const apiResponse = await axios.get('http://localhost:5103/exceptions-v2?limit=200');
      const apiData = apiResponse.data;
      
      console.log(`   ✅ API Status: ${apiData.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   Total exceptions returned: ${apiData.items.length}`);
      console.log('');
      console.log('   Counts by Status:');
      Object.entries(apiData.counts.byStatus || {}).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
      });
      console.log('');
      console.log('   Sample exceptions (first 3):');
      apiData.items.slice(0, 3).forEach(exc => {
        console.log(`   - ${exc.exceptionCode}`);
        console.log(`     Transaction: ${exc.pgTransactionId}`);
        console.log(`     Status: ${exc.status} | Severity: ${exc.severity}`);
        console.log(`     Amount: ₹${(exc.pgAmount / 100).toFixed(2)}`);
        console.log(`     Created: ${exc.createdAt}`);
        console.log('');
      });
      
    } catch (error) {
      console.log(`   ❌ API Error: ${error.message}`);
      console.log('   Make sure recon-api is running on port 5103');
    }
    
    console.log('5. FINAL VERIFICATION - Coverage');
    console.log('-'.repeat(70));
    
    const coverage = await client.query(`
      SELECT 
        COUNT(DISTINCT t.id) as exception_transactions,
        COUNT(DISTINCT ew.transaction_id) as with_workflow,
        COUNT(DISTINCT t.id) - COUNT(DISTINCT ew.transaction_id) as missing_workflow,
        ROUND(
          100.0 * COUNT(DISTINCT ew.transaction_id) / NULLIF(COUNT(DISTINCT t.id), 0), 
          2
        ) as coverage_percent
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
    `);
    
    const cov = coverage.rows[0];
    console.log(`   Exception Transactions: ${cov.exception_transactions}`);
    console.log(`   With Workflow Records: ${cov.with_workflow}`);
    console.log(`   Missing Workflow: ${cov.missing_workflow}`);
    console.log(`   Coverage: ${cov.coverage_percent}%`);
    console.log('');
    
    if (cov.coverage_percent === '100.00') {
      console.log('   ✅ PERFECT! All exceptions have workflow records!');
    } else {
      console.log(`   ⚠️  WARNING: ${cov.missing_workflow} exceptions missing workflow records`);
    }
    
    console.log('');
    console.log('6. KPI TILES EXPECTED VALUES');
    console.log('-'.repeat(70));
    
    const kpiData = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
        COUNT(*) FILTER (WHERE status = 'snoozed') as snoozed,
        COUNT(*) FILTER (WHERE sla_breached = true) as sla_breached,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '7 days') as resolved_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h_inflow
      FROM sp_v2_exception_workflow
    `);
    
    const kpi = kpiData.rows[0];
    console.log('   Exception KPIs (as shown in UI):');
    console.log(`   - Open: ${kpi.open}`);
    console.log(`   - Investigating: ${kpi.investigating}`);
    console.log(`   - Snoozed: ${kpi.snoozed}`);
    console.log(`   - SLA Breached: ${kpi.sla_breached}`);
    console.log(`   - Resolved (7d): ${kpi.resolved_7d}`);
    console.log(`   - Last 24h Inflow: ${kpi.last_24h_inflow}`);
    console.log('');
    
    console.log('='.repeat(70));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('Next Steps:');
    console.log('1. Open http://localhost:5174/ops/exceptions in browser');
    console.log('2. Verify KPI tiles show correct counts');
    console.log('3. Verify exception table shows all 136+ exceptions');
    console.log('4. Test CSV export functionality');
    console.log('');
    
  } catch (error) {
    console.error('Verification error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyExceptionTiles()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
