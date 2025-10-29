const { Pool } = require('pg');

async function cleanupTestData() {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('🧹 Cleaning test data for 2025-10-09...');
    
    // Delete in correct order (respect FK constraints)
    const result1 = await pool.query(`
      DELETE FROM sp_v2_reconciliation_results 
      WHERE created_at >= '2025-10-09'::date
    `);
    console.log(`✓ Deleted ${result1.rowCount} reconciliation results`);

    const result2 = await pool.query(`
      DELETE FROM sp_v2_settlement_items 
      WHERE created_at >= '2025-10-09'::date
    `);
    console.log(`✓ Deleted ${result2.rowCount} settlement items`);

    const result3 = await pool.query(`
      DELETE FROM sp_v2_settlement_batches 
      WHERE cycle_date >= '2025-10-09'::date
    `);
    console.log(`✓ Deleted ${result3.rowCount} settlement batches`);

    const result4 = await pool.query(`
      DELETE FROM sp_v2_transactions 
      WHERE transaction_date >= '2025-10-09'::date 
      AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✓ Deleted ${result4.rowCount} PG transactions`);

    const result5 = await pool.query(`
      DELETE FROM sp_v2_bank_statements 
      WHERE transaction_date >= '2025-10-09'::date 
      AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✓ Deleted ${result5.rowCount} bank statements`);

    console.log('✅ Cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

cleanupTestData().catch(console.error);
