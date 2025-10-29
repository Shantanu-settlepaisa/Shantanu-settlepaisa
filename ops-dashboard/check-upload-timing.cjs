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
    console.log('=== UPLOAD TIMING ANALYSIS ===');
    console.log('');

    // Check when each bank was uploaded
    const timing = await client.query(`
      SELECT
        bank_name,
        COUNT(*) as count,
        MIN(created_at) as first_upload,
        MAX(created_at) as last_upload
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY bank_name
      ORDER BY first_upload
    `);

    timing.rows.forEach(r => {
      console.log('Bank:', r.bank_name);
      console.log('  Count:', r.count);
      console.log('  First upload:', r.first_upload);
      console.log('  Last upload:', r.last_upload);
      console.log('');
    });

    // Sample AXIS records to see what they look like
    console.log('=== AXIS BANK SAMPLE RECORDS ===');
    console.log('');

    const axisSample = await client.query(`
      SELECT id, utr, bank_ref, amount_paise / 100.0 as amount, created_at
      FROM sp_v2_bank_statements
      WHERE bank_name = 'AXIS BANK'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    axisSample.rows.forEach((r, i) => {
      console.log('[' + (i + 1) + '] ID:', r.id);
      console.log('    UTR:', r.utr || 'NULL ❌');
      console.log('    bank_ref:', r.bank_ref || 'NULL');
      console.log('    Amount:', r.amount);
      console.log('    Created:', r.created_at);
      console.log('');
    });

    // Check HDFC for comparison
    console.log('=== HDFC BANK SAMPLE RECORDS (Working) ===');
    console.log('');

    const hdfcSample = await client.query(`
      SELECT id, utr, bank_ref, amount_paise / 100.0 as amount, created_at
      FROM sp_v2_bank_statements
      WHERE bank_name = 'HDFC BANK'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    hdfcSample.rows.forEach((r, i) => {
      console.log('[' + (i + 1) + '] ID:', r.id);
      console.log('    UTR:', r.utr || 'NULL');
      console.log('    bank_ref:', r.bank_ref || 'NULL');
      console.log('    Amount:', r.amount);
      console.log('    Created:', r.created_at);
      console.log('');
    });

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
