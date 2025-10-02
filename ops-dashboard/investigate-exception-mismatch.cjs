const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function investigateMismatch() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('EXCEPTION MISMATCH INVESTIGATION');
    console.log('='.repeat(80));
    console.log('');
    
    console.log('1. TOTAL EXCEPTIONS IN WORKFLOW TABLE');
    console.log('-'.repeat(80));
    const totalWorkflow = await client.query(`
      SELECT COUNT(*) as total FROM sp_v2_exception_workflow
    `);
    console.log(`Total in sp_v2_exception_workflow: ${totalWorkflow.rows[0].total}`);
    console.log('');
    
    console.log('2. EXCEPTIONS BY DATE (showing when created_at field was set)');
    console.log('-'.repeat(80));
    const byDate = await client.query(`
      SELECT 
        DATE(created_at) as exception_date,
        COUNT(*) as count,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sp_v2_exception_workflow
      GROUP BY DATE(created_at)
      ORDER BY exception_date DESC
      LIMIT 10
    `);
    console.log('Date         | Count | Earliest               | Latest');
    console.log('-'.repeat(80));
    byDate.rows.forEach(row => {
      console.log(`${row.exception_date} | ${String(row.count).padEnd(5)} | ${row.earliest} | ${row.latest}`);
    });
    console.log('');
    
    console.log('3. EXCEPTIONS IN LAST 30 DAYS (based on created_at)');
    console.log('-'.repeat(80));
    const last30Days = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_exception_workflow
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    console.log(`Exceptions in last 30 days (created_at): ${last30Days.rows[0].count}`);
    console.log('');
    
    console.log('4. CHECKING UNDERLYING TRANSACTION DATES');
    console.log('-'.repeat(80));
    const txnDates = await client.query(`
      SELECT 
        DATE(t.transaction_date) as txn_date,
        COUNT(*) as count
      FROM sp_v2_exception_workflow ew
      JOIN sp_v2_transactions t ON ew.transaction_id = t.id
      WHERE t.status = 'EXCEPTION'
      GROUP BY DATE(t.transaction_date)
      ORDER BY txn_date DESC
      LIMIT 10
    `);
    console.log('Transaction Date | Exception Count');
    console.log('-'.repeat(80));
    txnDates.rows.forEach(row => {
      console.log(`${row.txn_date} | ${row.count}`);
    });
    console.log('');
    
    console.log('5. EXCEPTIONS BY TRANSACTION DATE (last 30 days)');
    console.log('-'.repeat(80));
    const txnLast30 = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_exception_workflow ew
      JOIN sp_v2_transactions t ON ew.transaction_id = t.id
      WHERE t.transaction_date >= NOW() - INTERVAL '30 days'
        AND t.status = 'EXCEPTION'
    `);
    console.log(`Exceptions with txn_date in last 30 days: ${txnLast30.rows[0].count}`);
    console.log('');
    
    console.log('6. REASON BREAKDOWN (Why all AMOUNT_MISMATCH?)');
    console.log('-'.repeat(80));
    const reasons = await client.query(`
      SELECT 
        reason,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM sp_v2_exception_workflow
      GROUP BY reason
      ORDER BY count DESC
    `);
    console.log('Reason                | Count | Percentage');
    console.log('-'.repeat(80));
    reasons.rows.forEach(row => {
      console.log(`${row.reason.padEnd(20)} | ${String(row.count).padEnd(5)} | ${row.percentage}%`);
    });
    console.log('');
    
    console.log('7. HOW REASONS ARE SET');
    console.log('-'.repeat(80));
    console.log('Checking trigger function logic...');
    const triggerDef = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'fn_create_exception_workflow'
    `);
    const defText = triggerDef.rows[0].definition;
    const reasonLine = defText.split('\n').find(line => line.includes('v_reason'));
    console.log(`Reason assignment in trigger: ${reasonLine ? reasonLine.trim() : 'NOT FOUND'}`);
    console.log('');
    
    console.log('8. SAMPLE TRANSACTIONS (to understand reason assignment)');
    console.log('-'.repeat(80));
    const samples = await client.query(`
      SELECT 
        t.transaction_id,
        t.amount_paise,
        t.status as txn_status,
        ew.reason,
        ew.severity,
        t.created_at as txn_created,
        ew.created_at as workflow_created
      FROM sp_v2_transactions t
      JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
      ORDER BY t.created_at DESC
      LIMIT 5
    `);
    console.log('Transaction ID       | Amount    | Reason          | Severity | Txn Created');
    console.log('-'.repeat(80));
    samples.rows.forEach(row => {
      console.log(`${row.transaction_id.padEnd(20)} | ₹${(row.amount_paise / 100).toFixed(2).padEnd(8)} | ${row.reason.padEnd(15)} | ${row.severity.padEnd(8)} | ${row.txn_created}`);
    });
    console.log('');
    
    console.log('9. OVERVIEW API DATE FILTERING');
    console.log('-'.repeat(80));
    console.log('The Overview tab likely filters by transaction_date, not created_at');
    console.log('Let\'s check what the Overview API would return...');
    
    const overviewCount = await client.query(`
      SELECT 
        COUNT(*) as exceptions_last_30_days
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    console.log(`Exceptions with transaction_date in last 30 days: ${overviewCount.rows[0].exceptions_last_30_days}`);
    console.log('');
    
    console.log('10. THE 136 vs 124 DISCREPANCY EXPLAINED');
    console.log('-'.repeat(80));
    const breakdown = await client.query(`
      SELECT 
        CASE 
          WHEN t.transaction_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'In last 30 days (by txn_date)'
          ELSE 'Older than 30 days (by txn_date)'
        END as category,
        COUNT(*) as count
      FROM sp_v2_transactions t
      JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
      GROUP BY category
    `);
    console.log('Category                              | Count');
    console.log('-'.repeat(80));
    breakdown.rows.forEach(row => {
      console.log(`${row.category.padEnd(40)} | ${row.count}`);
    });
    console.log('');
    
    console.log('11. OLDEST EXCEPTIONS (likely backfilled from historical data)');
    console.log('-'.repeat(80));
    const oldest = await client.query(`
      SELECT 
        t.transaction_id,
        t.transaction_date,
        t.created_at as txn_created_at,
        ew.created_at as workflow_created_at,
        DATE_PART('day', NOW() - t.transaction_date) as days_old
      FROM sp_v2_transactions t
      JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
      ORDER BY t.transaction_date ASC
      LIMIT 10
    `);
    console.log('Transaction ID       | Txn Date   | Days Old | Workflow Created');
    console.log('-'.repeat(80));
    oldest.rows.forEach(row => {
      console.log(`${row.transaction_id.padEnd(20)} | ${row.transaction_date} | ${Math.floor(row.days_old).toString().padEnd(8)} | ${row.workflow_created_at}`);
    });
    console.log('');
    
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log('');
    console.log('The discrepancy is likely because:');
    console.log('1. Exceptions tab shows ALL exceptions (136 total)');
    console.log('2. Overview tab filters by transaction_date (last 30 days only = 124)');
    console.log('3. 12 exceptions are from transactions older than 30 days');
    console.log('');
    console.log('The AMOUNT_MISMATCH reason is because:');
    console.log('1. Trigger fn_create_exception_workflow() has hardcoded:');
    console.log('   v_reason := \'AMOUNT_MISMATCH\'');
    console.log('2. This was a fix we applied when the trigger referenced non-existent column');
    console.log('3. Real exception reasons should be determined from reconciliation logic');
    console.log('');
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

investigateMismatch()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
