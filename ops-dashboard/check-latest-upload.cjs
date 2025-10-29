const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function main() {
  const client = await pool.connect();

  try {
    console.log('');
    console.log('=== CHECKING VERY RECENT UPLOADS (last 5 minutes) ===');
    console.log('');

    // Check bank statements
    const bankData = await client.query(`
      SELECT bank_name, utr, bank_ref, amount_paise, created_at
      FROM sp_v2_bank_statements
      WHERE created_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('Bank Statements (', bankData.rows.length, ' records):');
    bankData.rows.forEach((r, i) => {
      console.log('');
      console.log('[' + (i + 1) + '] Bank:', r.bank_name);
      console.log('    UTR:', r.utr || 'NULL');
      console.log('    bank_ref:', r.bank_ref || 'NULL');
      console.log('    Amount:', r.amount_paise / 100);
      console.log('    Created:', r.created_at);
    });

    // Check PG transactions
    const pgData = await client.query(`
      SELECT transaction_id, utr, amount_paise, status, created_at
      FROM sp_v2_transactions
      WHERE created_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('');
    console.log('=== PG TRANSACTIONS ===');
    console.log('');
    console.log('PG Transactions (', pgData.rows.length, ' records):');
    pgData.rows.forEach((r, i) => {
      console.log('');
      console.log('[' + (i + 1) + '] TXN ID:', r.transaction_id);
      console.log('    UTR:', r.utr || 'NULL');
      console.log('    Amount:', r.amount_paise / 100);
      console.log('    Status:', r.status);
      console.log('    Created:', r.created_at);
    });

    // Check upload-api logs for cache messages
    console.log('');
    console.log('=== CHECKING IF MAPPER USED CACHE ===');
    console.log('Check /tmp/upload-api.log for "[V1 Mapper] Using cached config" messages');

  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
