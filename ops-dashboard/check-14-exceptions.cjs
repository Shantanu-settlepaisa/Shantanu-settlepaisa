const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432
});

(async () => {
  try {
    console.log('=== CHECKING 14 EXCEPTIONS BREAKDOWN ===\n');
    
    // First, verify the count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND transaction_date >= '2025-10-23'
        AND transaction_date <= '2025-10-25'
    `);
    console.log('Total exceptions in sp_v2_transactions (by transaction_date):', countResult.rows[0].total);
    
    // Get the breakdown by exception_reason
    const breakdownResult = await pool.query(`
      SELECT
        exception_reason,
        exception_severity,
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND transaction_date >= '2025-10-23'
        AND transaction_date <= '2025-10-25'
      GROUP BY exception_reason, exception_severity
      ORDER BY count DESC
    `);
    
    console.log('\nBreakdown by reason and severity (transaction_date):');
    console.table(breakdownResult.rows);
    
    // Also check by created_at instead of transaction_date
    const countByCreated = await pool.query(`
      SELECT COUNT(*) as total
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND created_at::date >= '2025-10-23'
        AND created_at::date <= '2025-10-25'
    `);
    console.log('\nTotal exceptions by created_at:', countByCreated.rows[0].total);
    
    const breakdownByCreated = await pool.query(`
      SELECT
        exception_reason,
        exception_severity,
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND created_at::date >= '2025-10-23'
        AND created_at::date <= '2025-10-25'
      GROUP BY exception_reason, exception_severity
      ORDER BY count DESC
    `);
    
    console.log('\nBreakdown by created_at:');
    console.table(breakdownByCreated.rows);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
