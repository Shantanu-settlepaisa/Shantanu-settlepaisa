const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433
});

(async () => {
  try {
    console.log('=== CHECKING LOCAL DB FOR EXCEPTIONS ===\n');
    
    // Check if we have any exceptions locally
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
    `);
    console.log('Total exceptions in local sp_v2_transactions:', countResult.rows[0].total);
    
    if (parseInt(countResult.rows[0].total) > 0) {
      // Get the breakdown
      const breakdownResult = await pool.query(`
        SELECT
          exception_reason,
          exception_severity,
          COUNT(*) as count,
          MIN(transaction_date) as earliest_date,
          MAX(transaction_date) as latest_date
        FROM sp_v2_transactions
        WHERE status = 'EXCEPTION'
        GROUP BY exception_reason, exception_severity
        ORDER BY count DESC
      `);
      
      console.log('\nBreakdown by reason and severity:');
      console.table(breakdownResult.rows);
    } else {
      console.log('No exceptions found in local database');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
